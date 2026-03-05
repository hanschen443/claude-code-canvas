import {initTestDb, closeDb} from '../../src/database/index.js';
import {resetStatements} from '../../src/database/statements.js';
import {telegramBotStore} from '../../src/services/telegram/telegramBotStore.js';

describe('TelegramBotStore', () => {
    beforeEach(() => {
        resetStatements();
        initTestDb();
    });

    afterAll(() => {
        closeDb();
    });

    describe('Bot 建立流程', () => {
        test('使用全新 token 建立 Bot 應成功，回傳包含 id、name、botToken 的 TelegramBot', () => {
            const result = telegramBotStore.create('測試機器人', 'token-abc-123');

            expect(result.success).toBe(true);
            if (!result.success) return;

            expect(result.data.id).toBeDefined();
            expect(result.data.name).toBe('測試機器人');
            expect(result.data.botToken).toBe('token-abc-123');
            expect(result.data.connectionStatus).toBe('disconnected');
            expect(result.data.chats).toEqual([]);
        });

        test('使用重複 token 建立 Bot 應回傳 err，錯誤訊息包含「已存在」', () => {
            telegramBotStore.create('機器人A', 'duplicate-token');
            const result = telegramBotStore.create('機器人B', 'duplicate-token');

            expect(result.success).toBe(false);
            if (result.success) return;

            expect(result.error).toContain('已存在');
        });
    });

    describe('查詢', () => {
        test('getById 存在的 bot 應回傳正確資料', () => {
            const created = telegramBotStore.create('查詢機器人', 'token-getbyid');
            if (!created.success) throw new Error('建立失敗');

            const found = telegramBotStore.getById(created.data.id);

            expect(found).toBeDefined();
            expect(found?.id).toBe(created.data.id);
            expect(found?.name).toBe('查詢機器人');
            expect(found?.botToken).toBe('token-getbyid');
        });

        test('getById 不存在的 id 應回傳 undefined', () => {
            const found = telegramBotStore.getById('non-existent-id');
            expect(found).toBeUndefined();
        });

        test('getByBotToken 存在的 token 應回傳正確 bot', () => {
            telegramBotStore.create('Token 查詢機器人', 'token-bytoken');

            const found = telegramBotStore.getByBotToken('token-bytoken');

            expect(found).toBeDefined();
            expect(found?.botToken).toBe('token-bytoken');
            expect(found?.name).toBe('Token 查詢機器人');
        });

        test('getByBotToken 不存在的 token 應回傳 undefined', () => {
            const found = telegramBotStore.getByBotToken('non-existent-token');
            expect(found).toBeUndefined();
        });

        test('list 可列出所有 Bot，connectionStatus 預設為 disconnected', () => {
            telegramBotStore.create('機器人一', 'token-list-1');
            telegramBotStore.create('機器人二', 'token-list-2');

            const bots = telegramBotStore.list();

            expect(bots).toHaveLength(2);
            expect(bots.every((b) => b.connectionStatus === 'disconnected')).toBe(true);
        });
    });

    describe('狀態管理（Runtime State）', () => {
        test('updateStatus 後 getById 應反映新的 connectionStatus', () => {
            const created = telegramBotStore.create('狀態機器人', 'token-status');
            if (!created.success) throw new Error('建立失敗');

            telegramBotStore.updateStatus(created.data.id, 'connected');

            const bot = telegramBotStore.getById(created.data.id);
            expect(bot?.connectionStatus).toBe('connected');
        });

        test('updateChats 後 getById 的 chats 應更新', () => {
            const created = telegramBotStore.create('Chat 機器人', 'token-chats');
            if (!created.success) throw new Error('建立失敗');

            const chats = [
                {id: 100, type: 'private' as const, username: 'user1'},
                {id: 200, type: 'group' as const, title: '群組A'},
            ];

            telegramBotStore.updateChats(created.data.id, chats);

            const bot = telegramBotStore.getById(created.data.id);
            expect(bot?.chats).toHaveLength(2);
            expect(bot?.chats[0].id).toBe(100);
            expect(bot?.chats[1].id).toBe(200);
        });

        test('upsertChat 新增 chat 應成功', () => {
            const created = telegramBotStore.create('Upsert 機器人', 'token-upsert');
            if (!created.success) throw new Error('建立失敗');

            telegramBotStore.upsertChat(created.data.id, {id: 300, type: 'private', username: 'newuser'});

            const bot = telegramBotStore.getById(created.data.id);
            expect(bot?.chats).toHaveLength(1);
            expect(bot?.chats[0].id).toBe(300);
        });

        test('upsertChat 同一個 chat id 應就地更新而非重複新增', () => {
            const created = telegramBotStore.create('更新 Chat 機器人', 'token-upsert-update');
            if (!created.success) throw new Error('建立失敗');

            telegramBotStore.upsertChat(created.data.id, {id: 400, type: 'group', title: '舊標題'});
            telegramBotStore.upsertChat(created.data.id, {id: 400, type: 'group', title: '新標題'});

            const bot = telegramBotStore.getById(created.data.id);
            expect(bot?.chats).toHaveLength(1);
            expect(bot?.chats[0].title).toBe('新標題');
        });
    });

    describe('刪除', () => {
        test('delete 存在的 bot 應回傳 true，並清除 runtimeState', () => {
            const created = telegramBotStore.create('刪除機器人', 'token-delete');
            if (!created.success) throw new Error('建立失敗');

            telegramBotStore.updateStatus(created.data.id, 'connected');

            const deleted = telegramBotStore.delete(created.data.id);

            expect(deleted).toBe(true);
            expect(telegramBotStore.getById(created.data.id)).toBeUndefined();
        });

        test('delete 不存在的 id 應回傳 false', () => {
            const deleted = telegramBotStore.delete('non-existent-id');
            expect(deleted).toBe(false);
        });
    });
});
