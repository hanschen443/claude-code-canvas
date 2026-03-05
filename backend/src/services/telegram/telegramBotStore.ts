import {v4 as uuidv4} from 'uuid';
import type {TelegramBot, TelegramBotConnectionStatus, TelegramChat} from '../../types/index.js';
import {Result, ok, err} from '../../types/index.js';
import {getDb} from '../../database/index.js';
import {getStatements} from '../../database/statements.js';

interface TelegramBotRow {
    id: string;
    name: string;
    bot_token: string;
    bot_username: string;
}

interface TelegramBotChatRow {
    telegram_bot_id: string;
    chat_id: number;
    chat_type: string;
    title: string | null;
    username: string | null;
}

class TelegramBotStore {
    private runtimeState: Map<string, {connectionStatus: TelegramBotConnectionStatus; chats: TelegramChat[]}> =
        new Map();

    private get stmts(): ReturnType<typeof getStatements>['telegramBot'] {
        return getStatements(getDb()).telegramBot;
    }

    private get chatStmts(): ReturnType<typeof getStatements>['telegramBotChat'] {
        return getStatements(getDb()).telegramBotChat;
    }

    private rowToTelegramBot(row: TelegramBotRow): TelegramBot {
        const runtime = this.runtimeState.get(row.id);
        return {
            id: row.id,
            name: row.name,
            botToken: row.bot_token,
            botUsername: row.bot_username,
            connectionStatus: runtime?.connectionStatus ?? 'disconnected',
            chats: runtime?.chats ?? [],
        };
    }

    create(name: string, botToken: string): Result<TelegramBot> {
        const existing = this.stmts.selectByBotToken.get(botToken) as TelegramBotRow | undefined;
        if (existing) {
            return err('已存在使用相同 Bot Token 的 Telegram Bot');
        }

        const id = uuidv4();
        this.stmts.insert.run({$id: id, $name: name, $botToken: botToken, $botUsername: ''});

        return ok({
            id,
            name,
            botToken,
            botUsername: '',
            connectionStatus: 'disconnected',
            chats: [],
        });
    }

    list(): TelegramBot[] {
        const rows = this.stmts.selectAll.all() as TelegramBotRow[];
        return rows.map((row) => this.rowToTelegramBot(row));
    }

    getById(id: string): TelegramBot | undefined {
        const row = this.stmts.selectById.get(id) as TelegramBotRow | undefined;
        if (!row) return undefined;
        return this.rowToTelegramBot(row);
    }

    getByBotToken(botToken: string): TelegramBot | undefined {
        const row = this.stmts.selectByBotToken.get(botToken) as TelegramBotRow | undefined;
        if (!row) return undefined;
        return this.rowToTelegramBot(row);
    }

    updateStatus(id: string, status: TelegramBotConnectionStatus): void {
        const current = this.runtimeState.get(id) ?? {connectionStatus: 'disconnected', chats: []};
        this.runtimeState.set(id, {...current, connectionStatus: status});
    }

    updateChats(id: string, chats: TelegramChat[]): void {
        const current = this.runtimeState.get(id) ?? {connectionStatus: 'disconnected', chats: []};
        this.runtimeState.set(id, {...current, chats});
    }

    updateBotUsername(id: string, botUsername: string): void {
        this.stmts.updateBotUsername.run({$botUsername: botUsername, $id: id});
    }

    upsertChat(botId: string, chat: TelegramChat): void {
        this.chatStmts.upsert.run({
            $telegramBotId: botId,
            $chatId: chat.id,
            $chatType: chat.type,
            $title: chat.title ?? null,
            $username: chat.username ?? null,
        });

        const current = this.runtimeState.get(botId) ?? {connectionStatus: 'disconnected', chats: []};
        const existingIndex = current.chats.findIndex((c) => c.id === chat.id);
        if (existingIndex >= 0) {
            current.chats[existingIndex] = chat;
        } else {
            current.chats.push(chat);
        }
        this.runtimeState.set(botId, current);
    }

    loadChatsFromDb(botId: string): void {
        const rows = this.chatStmts.selectByBotId.all(botId) as TelegramBotChatRow[];
        const chats: TelegramChat[] = rows.map((row) => ({
            id: row.chat_id,
            type: row.chat_type as TelegramChat['type'],
            title: row.title ?? undefined,
            username: row.username ?? undefined,
        }));
        const current = this.runtimeState.get(botId) ?? {connectionStatus: 'disconnected', chats: []};
        this.runtimeState.set(botId, {...current, chats});
    }

    delete(id: string): boolean {
        const result = this.stmts.deleteById.run(id);
        this.runtimeState.delete(id);
        return result.changes > 0;
    }
}

export const telegramBotStore = new TelegramBotStore();
