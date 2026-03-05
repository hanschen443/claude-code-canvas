import { WebSocketResponseEvents } from '../schemas';
import type {
    TelegramBotCreatePayload,
    TelegramBotDeletePayload,
    TelegramBotGetPayload,
    TelegramBotChatsPayload,
    PodBindTelegramPayload,
    PodUnbindTelegramPayload,
} from '../schemas';
import type { TelegramBot } from '../types/index.js';
import { telegramBotStore } from '../services/telegram/telegramBotStore.js';
import { telegramClientManager } from '../services/telegram/telegramClientManager.js';
import { podStore } from '../services/podStore.js';
import { socketService } from '../services/socketService.js';
import { emitError, emitNotFound, emitSuccess } from '../utils/websocketResponse.js';
import { logger } from '../utils/logger.js';
import { fireAndForget } from '../utils/operationHelpers.js';
import { emitPodUpdated, handleResultError, getPodDisplayName, validatePod, withCanvasId } from '../utils/handlerHelpers.js';

interface SanitizedTelegramBot {
    id: string;
    name: string;
    connectionStatus: TelegramBot['connectionStatus'];
    chats: TelegramBot['chats'];
    botUsername: string;
}

function sanitizeTelegramBot(bot: TelegramBot): SanitizedTelegramBot {
    return {id: bot.id, name: bot.name, connectionStatus: bot.connectionStatus, chats: bot.chats, botUsername: bot.botUsername};
}

function getTelegramBotOrEmitError(connectionId: string, botId: string, responseEvent: WebSocketResponseEvents, requestId: string): TelegramBot | null {
    const bot = telegramBotStore.getById(botId);
    if (!bot) {
        emitNotFound(connectionId, responseEvent, 'Telegram Bot', botId, requestId);
        return null;
    }
    return bot;
}

export async function handleTelegramBotCreate(
    connectionId: string,
    payload: TelegramBotCreatePayload,
    requestId: string
): Promise<void> {
    const {name, botToken} = payload;

    const existing = telegramBotStore.getByBotToken(botToken);
    if (existing) {
        emitError(connectionId, WebSocketResponseEvents.TELEGRAM_BOT_CREATED, '已存在使用相同 Bot Token 的 Telegram Bot', requestId, undefined, 'DUPLICATE_TOKEN');
        return;
    }

    const result = telegramBotStore.create(name, botToken);
    if (handleResultError(result, connectionId, WebSocketResponseEvents.TELEGRAM_BOT_CREATED, requestId, '建立 Telegram Bot 失敗')) return;

    const bot = result.data;

    logger.log('Telegram', 'Create', `建立 Telegram Bot「${bot.name}」`);

    fireAndForget(
        telegramClientManager.initialize(bot),
        'Telegram',
        `Telegram Bot「${bot.name}」初始化失敗`
    );

    socketService.emitToAll(WebSocketResponseEvents.TELEGRAM_BOT_CREATED, {
        requestId,
        success: true,
        telegramBot: sanitizeTelegramBot(bot),
    });
}

export async function handleTelegramBotDelete(
    connectionId: string,
    payload: TelegramBotDeletePayload,
    requestId: string
): Promise<void> {
    const {telegramBotId} = payload;

    const bot = getTelegramBotOrEmitError(connectionId, telegramBotId, WebSocketResponseEvents.TELEGRAM_BOT_DELETED, requestId);
    if (!bot) return;

    telegramClientManager.remove(telegramBotId);

    const boundPods = podStore.findByTelegramBot(telegramBotId);
    for (const {canvasId, pod} of boundPods) {
        podStore.setTelegramBinding(canvasId, pod.id, null);
        socketService.emitToCanvas(canvasId, WebSocketResponseEvents.POD_TELEGRAM_UNBOUND, {
            canvasId,
            podId: pod.id,
        });
        logger.log('Telegram', 'Delete', `清除 Pod「${pod.name}」的 Telegram 綁定`);
    }

    telegramBotStore.delete(telegramBotId);

    logger.log('Telegram', 'Delete', `已刪除 Telegram Bot「${bot.name}」`);

    socketService.emitToAll(WebSocketResponseEvents.TELEGRAM_BOT_DELETED, {
        requestId,
        success: true,
        telegramBotId,
    });
}

export async function handleTelegramBotList(
    connectionId: string,
    _payload: unknown,
    requestId: string
): Promise<void> {
    const bots = telegramBotStore.list();
    emitSuccess(connectionId, WebSocketResponseEvents.TELEGRAM_BOT_LIST_RESULT, {
        requestId,
        success: true,
        telegramBots: bots.map(sanitizeTelegramBot),
    });
}

export async function handleTelegramBotGet(
    connectionId: string,
    payload: TelegramBotGetPayload,
    requestId: string
): Promise<void> {
    const {telegramBotId} = payload;

    const bot = getTelegramBotOrEmitError(connectionId, telegramBotId, WebSocketResponseEvents.TELEGRAM_BOT_GET_RESULT, requestId);
    if (!bot) return;

    emitSuccess(connectionId, WebSocketResponseEvents.TELEGRAM_BOT_GET_RESULT, {
        requestId,
        success: true,
        telegramBot: sanitizeTelegramBot(bot),
    });
}

export async function handleTelegramBotChats(
    connectionId: string,
    payload: TelegramBotChatsPayload,
    requestId: string
): Promise<void> {
    const {telegramBotId} = payload;

    const bot = getTelegramBotOrEmitError(connectionId, telegramBotId, WebSocketResponseEvents.TELEGRAM_BOT_CHATS_RESULT, requestId);
    if (!bot) return;

    emitSuccess(connectionId, WebSocketResponseEvents.TELEGRAM_BOT_CHATS_RESULT, {
        requestId,
        success: true,
        telegramBotId,
        chats: bot.chats,
    });
}

export const handlePodBindTelegram = withCanvasId<PodBindTelegramPayload>(
    WebSocketResponseEvents.POD_TELEGRAM_BOUND,
    async (connectionId: string, canvasId: string, payload: PodBindTelegramPayload, requestId: string): Promise<void> => {
        const {podId, telegramBotId, telegramChatId, chatType} = payload;

        const pod = validatePod(connectionId, podId, WebSocketResponseEvents.POD_TELEGRAM_BOUND, requestId);
        if (!pod) return;

        const bot = telegramBotStore.getById(telegramBotId);
        if (!bot) {
            emitNotFound(connectionId, WebSocketResponseEvents.POD_TELEGRAM_BOUND, 'Telegram Bot', telegramBotId, requestId);
            return;
        }

        if (bot.connectionStatus !== 'connected') {
            emitError(connectionId, WebSocketResponseEvents.POD_TELEGRAM_BOUND, `Telegram Bot「${bot.name}」尚未連線`, requestId, undefined, 'NOT_CONNECTED');
            return;
        }

        if (chatType === 'group') {
            const chat = bot.chats.find((c) => c.id === telegramChatId);
            if (!chat) {
                emitNotFound(connectionId, WebSocketResponseEvents.POD_TELEGRAM_BOUND, 'Chat', String(telegramChatId), requestId);
                return;
            }
            logger.log('Telegram', 'Create', `Pod「${pod.name}」已綁定 Telegram Bot「${bot.name}」群組「${chat.title ?? chat.username ?? String(telegramChatId)}」`);
        } else {
            logger.log('Telegram', 'Create', `Pod「${pod.name}」已綁定 Telegram Bot「${bot.name}」私人對話 User ID「${telegramChatId}」`);
        }

        podStore.setTelegramBinding(canvasId, podId, {telegramBotId, telegramChatId, chatType});

        emitPodUpdated(canvasId, podId, requestId, WebSocketResponseEvents.POD_TELEGRAM_BOUND);
    }
);

export const handlePodUnbindTelegram = withCanvasId<PodUnbindTelegramPayload>(
    WebSocketResponseEvents.POD_TELEGRAM_UNBOUND,
    async (connectionId: string, canvasId: string, payload: PodUnbindTelegramPayload, requestId: string): Promise<void> => {
        const {podId} = payload;

        const pod = validatePod(connectionId, podId, WebSocketResponseEvents.POD_TELEGRAM_UNBOUND, requestId);
        if (!pod) return;

        if (!pod.telegramBinding) {
            emitError(connectionId, WebSocketResponseEvents.POD_TELEGRAM_UNBOUND, `Pod「${getPodDisplayName(canvasId, podId)}」尚未綁定 Telegram`, requestId, undefined, 'NOT_BOUND');
            return;
        }

        podStore.setTelegramBinding(canvasId, podId, null);

        logger.log('Telegram', 'Delete', `Pod「${getPodDisplayName(canvasId, podId)}」已解除 Telegram 綁定`);

        emitPodUpdated(canvasId, podId, requestId, WebSocketResponseEvents.POD_TELEGRAM_UNBOUND);
    }
);
