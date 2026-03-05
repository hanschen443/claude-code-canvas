import type {TelegramBot, TelegramChat} from '../../types/index.js';
import {Result, ok, err} from '../../types/index.js';
import {logger} from '../../utils/logger.js';
import {getErrorMessage} from '../../utils/errorHelpers.js';
import {telegramBotStore} from './telegramBotStore.js';
import {socketService} from '../socketService.js';
import {WebSocketResponseEvents} from '../../schemas/events.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
const POLLING_TIMEOUT = 30;
const MAX_RETRY_DELAY = 60_000;
const INITIAL_RETRY_DELAY = 1_000;

export interface TelegramApiChat {
    id: number;
    type: string;
    title?: string;
    username?: string;
}

export interface TelegramApiMessage {
    message_id: number;
    from?: {
        id: number;
        is_bot: boolean;
        username?: string;
        first_name?: string;
    };
    chat: TelegramApiChat;
    text?: string;
}

interface TelegramUpdate {
    update_id: number;
    message?: TelegramApiMessage;
}

type OnMessageCallback = (botId: string, message: TelegramApiMessage, botUsername: string) => Promise<void>;

class TelegramClientManager {
    private pollingControllers: Map<string, AbortController> = new Map();
    private pollingOffsets: Map<string, number> = new Map();
    private onMessageCallback: OnMessageCallback | null = null;

    async initialize(bot: TelegramBot): Promise<void> {
        const validated = await this.validateAndUpdateBot(bot);
        if (!validated) {
            this.markError(bot.id);
            return;
        }

        telegramBotStore.loadChatsFromDb(bot.id);
        telegramBotStore.updateStatus(bot.id, 'connected');
        this.broadcastConnectionStatus(bot.id);

        logger.log('Telegram', 'Complete', `Telegram Bot ${bot.id} 初始化成功`);

        this.startPolling(bot.id, bot.botToken);
    }

    private async validateAndUpdateBot(bot: TelegramBot): Promise<boolean> {
        try {
            const response = await fetch(`${TELEGRAM_API_BASE}${bot.botToken}/getMe`);
            const data = await response.json() as {ok: boolean; result?: {username?: string}};

            if (!data.ok) {
                logger.error('Telegram', 'Error', `Telegram Bot ${bot.id} 初始化失敗：Token 無效`);
                return false;
            }

            const botUsername = data.result?.username ?? '';
            telegramBotStore.updateBotUsername(bot.id, botUsername);
            return true;
        } catch (error) {
            logger.error('Telegram', 'Error', `Telegram Bot ${bot.id} 初始化失敗：${getErrorMessage(error)}`);
            return false;
        }
    }

    private markError(botId: string): void {
        telegramBotStore.updateStatus(botId, 'error');
        this.broadcastConnectionStatus(botId);
    }

    // 每個 Bot 有獨立的 polling 迴圈，透過 AbortController 控制生命週期，避免 memory leak
    private async startPolling(botId: string, botToken: string): Promise<void> {
        const controller = new AbortController();
        this.pollingControllers.set(botId, controller);

        let retryDelay = INITIAL_RETRY_DELAY;

        while (!controller.signal.aborted) {
            const offset = this.pollingOffsets.get(botId) ?? 0;

            try {
                const updates = await this.getUpdates(botToken, offset, POLLING_TIMEOUT, controller.signal);
                retryDelay = INITIAL_RETRY_DELAY;

                for (const update of updates) {
                    this.processUpdate(botId, update);
                    this.pollingOffsets.set(botId, update.update_id + 1);
                }
            } catch (error) {
                if (controller.signal.aborted) break;

                logger.warn('Telegram', 'Warn', `Telegram Bot ${botId} polling 失敗，${retryDelay}ms 後重試：${getErrorMessage(error)}`);
                await new Promise((resolve) => setTimeout(resolve, retryDelay));
                retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY);
            }
        }

        logger.log('Telegram', 'Complete', `Telegram Bot ${botId} polling 已停止`);
    }

    private async getUpdates(
        botToken: string,
        offset: number,
        timeout: number,
        signal: AbortSignal,
    ): Promise<TelegramUpdate[]> {
        const url = `${TELEGRAM_API_BASE}${botToken}/getUpdates?offset=${offset}&timeout=${timeout}`;
        const response = await fetch(url, {signal});
        const data = await response.json() as {ok: boolean; result?: TelegramUpdate[]; error_code?: number; description?: string};

        if (!data.ok) {
            throw new Error(`getUpdates 回傳失敗: [${data.error_code}] ${data.description}`);
        }

        return data.result ?? [];
    }

    private processUpdate(botId: string, update: TelegramUpdate): void {
        const message = update.message;
        if (!message) return;

        const chat = message.chat;
        const telegramChat: TelegramChat = {
            id: chat.id,
            type: chat.type as TelegramChat['type'],
            title: chat.title,
            username: chat.username,
        };

        telegramBotStore.upsertChat(botId, telegramChat);

        if (!this.onMessageCallback) return;

        const bot = telegramBotStore.getById(botId);
        const botUsername = bot?.botUsername ?? '';

        this.onMessageCallback(botId, message, botUsername).catch((error) => {
            logger.error('Telegram', 'Error', `[TelegramClientManager] 處理訊息回呼失敗：${getErrorMessage(error)}`);
        });
    }

    async sendMessage(botId: string, chatId: number, text: string, replyToMessageId?: number): Promise<Result<void>> {
        const bot = telegramBotStore.getById(botId);
        if (!bot) {
            return err(`找不到 Telegram Bot ${botId}`);
        }

        const body: Record<string, unknown> = {chat_id: chatId, text};
        if (replyToMessageId !== undefined) {
            body.reply_to_message_id = replyToMessageId;
        }

        try {
            const response = await fetch(`${TELEGRAM_API_BASE}${bot.botToken}/sendMessage`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            });

            const data = await response.json() as {ok: boolean; error_code?: number; description?: string};
            if (!data.ok) {
                logger.error('Telegram', 'Error', `[Telegram] 發送訊息失敗: [${data.error_code}] ${data.description}`);
                return err('發送訊息失敗');
            }

            return ok();
        } catch (error) {
            logger.error('Telegram', 'Error', `發送訊息至 Chat ${chatId} 失敗：${getErrorMessage(error)}`);
            return err('發送訊息失敗');
        }
    }

    remove(botId: string): void {
        const controller = this.pollingControllers.get(botId);
        if (controller) {
            controller.abort();
            this.pollingControllers.delete(botId);
        }

        this.pollingOffsets.delete(botId);
        telegramBotStore.updateStatus(botId, 'disconnected');
        this.broadcastConnectionStatus(botId);

        logger.log('Telegram', 'Complete', `Telegram Bot ${botId} 已移除`);
    }

    destroyAll(): void {
        for (const controller of this.pollingControllers.values()) {
            controller.abort();
        }
        this.pollingControllers.clear();
        this.pollingOffsets.clear();

        logger.log('Telegram', 'Complete', '已清除所有 Telegram Bot 連線');
    }

    setOnMessage(callback: OnMessageCallback): void {
        this.onMessageCallback = callback;
    }

    private broadcastConnectionStatus(botId: string): void {
        const bot = telegramBotStore.getById(botId);
        if (!bot) return;

        socketService.emitToAll(WebSocketResponseEvents.TELEGRAM_CONNECTION_STATUS_CHANGED, {
            telegramBotId: botId,
            connectionStatus: bot.connectionStatus,
            chats: bot.chats,
        });
    }
}

export const telegramClientManager = new TelegramClientManager();
