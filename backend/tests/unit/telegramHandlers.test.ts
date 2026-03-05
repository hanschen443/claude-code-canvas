import type {Mock} from 'vitest';

vi.mock('../../src/services/telegram/telegramClientManager.js', () => ({
    telegramClientManager: {
        initialize: vi.fn(() => Promise.resolve()),
        remove: vi.fn(),
    },
}));

vi.mock('../../src/services/socketService.js', () => ({
    socketService: {
        emitToAll: vi.fn(),
        emitToConnection: vi.fn(),
        emitToCanvas: vi.fn(),
    },
}));

vi.mock('../../src/utils/logger.js', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../src/services/canvasStore.js', () => ({
    canvasStore: {
        getActiveCanvas: vi.fn(),
        getCanvasDir: vi.fn(),
    },
}));

import {beforeEach, describe, expect, it} from 'vitest';
import {initTestDb, resetDb} from '../../src/database/index.js';
import {getStatements, resetStatements} from '../../src/database/statements.js';
import {getDb} from '../../src/database/index.js';
import {telegramBotStore} from '../../src/services/telegram/telegramBotStore.js';
import {podStore} from '../../src/services/podStore.js';
import {telegramClientManager} from '../../src/services/telegram/telegramClientManager.js';
import {socketService} from '../../src/services/socketService.js';
import {canvasStore} from '../../src/services/canvasStore.js';
import {
    handleTelegramBotCreate,
    handleTelegramBotDelete,
    handleTelegramBotList,
    handleTelegramBotGet,
    handlePodBindTelegram,
    handlePodUnbindTelegram,
} from '../../src/handlers/telegramHandlers.js';
import {WebSocketResponseEvents} from '../../src/schemas/events.js';

function asMock(fn: unknown): Mock<any> {
    return fn as Mock<any>;
}

const CONNECTION_ID = 'conn-test-1';
const REQUEST_ID = 'req-test-1';
const CANVAS_ID = 'canvas-test-1';
const BOT_TOKEN = '123456789:AABBCCDDEEFFaabbccddeeff1234567890';

function setupCanvas(): void {
    asMock(canvasStore.getActiveCanvas).mockReturnValue(CANVAS_ID);
}

function setupPodInDb(): string {
    const podId = '550e8400-e29b-41d4-a716-446655440001';
    const db = getDb();
    db.exec(`INSERT OR IGNORE INTO canvases (id, name, sort_index) VALUES ('${CANVAS_ID}', 'test-canvas', 0)`);
    const stmts = getStatements(db);
    stmts.pod.insert.run({
        $id: podId,
        $canvasId: CANVAS_ID,
        $name: 'Test Pod',
        $status: 'idle',
        $x: 0,
        $y: 0,
        $rotation: 0,
        $model: 'opus',
        $workspacePath: '/workspace/test-pod',
        $claudeSessionId: null,
        $outputStyleId: null,
        $repositoryId: null,
        $commandId: null,
        $autoClear: 0,
        $scheduleJson: null,
        $slackBindingJson: null,
        $telegramBindingJson: null,
    });
    return podId;
}

function resetTestDb(): void {
    initTestDb();
    resetStatements();
}

describe('handleTelegramBotCreate', () => {
    beforeEach(() => {
        resetTestDb();
        vi.resetAllMocks();
    });

    it('正常建立 Bot 後應回傳成功結果（不含 botToken）', async () => {
        await handleTelegramBotCreate(CONNECTION_ID, {name: '測試 Bot', botToken: BOT_TOKEN}, REQUEST_ID);

        expect(socketService.emitToAll).toHaveBeenCalledWith(
            WebSocketResponseEvents.TELEGRAM_BOT_CREATED,
            expect.objectContaining({
                requestId: REQUEST_ID,
                success: true,
                telegramBot: expect.objectContaining({
                    name: '測試 Bot',
                }),
            })
        );

        const call = asMock(socketService.emitToAll).mock.calls[0];
        const telegramBot = (call[1] as Record<string, any>).telegramBot;
        expect(telegramBot).not.toHaveProperty('botToken');
    });

    it('正常建立 Bot 後應呼叫 telegramClientManager.initialize', async () => {
        await handleTelegramBotCreate(CONNECTION_ID, {name: '測試 Bot', botToken: BOT_TOKEN}, REQUEST_ID);

        expect(telegramClientManager.initialize).toHaveBeenCalled();
    });

    it('重複 token 應回傳 error', async () => {
        await handleTelegramBotCreate(CONNECTION_ID, {name: '第一個 Bot', botToken: BOT_TOKEN}, REQUEST_ID);
        vi.resetAllMocks();

        await handleTelegramBotCreate(CONNECTION_ID, {name: '第二個 Bot', botToken: BOT_TOKEN}, REQUEST_ID);

        expect(socketService.emitToConnection).toHaveBeenCalledWith(
            CONNECTION_ID,
            WebSocketResponseEvents.TELEGRAM_BOT_CREATED,
            expect.objectContaining({
                success: false,
                code: 'DUPLICATE_TOKEN',
            })
        );
        expect(socketService.emitToAll).not.toHaveBeenCalled();
    });
});

describe('handleTelegramBotDelete', () => {
    beforeEach(() => {
        resetTestDb();
        vi.resetAllMocks();
    });

    it('正常刪除 Bot 應回傳成功', async () => {
        const createResult = telegramBotStore.create('刪除測試 Bot', BOT_TOKEN);
        const botId = createResult.data!.id;

        await handleTelegramBotDelete(CONNECTION_ID, {telegramBotId: botId}, REQUEST_ID);

        expect(socketService.emitToAll).toHaveBeenCalledWith(
            WebSocketResponseEvents.TELEGRAM_BOT_DELETED,
            expect.objectContaining({
                requestId: REQUEST_ID,
                success: true,
                telegramBotId: botId,
            })
        );
    });

    it('刪除後 Bot 不存在於 store', async () => {
        const createResult = telegramBotStore.create('刪除測試 Bot', BOT_TOKEN);
        const botId = createResult.data!.id;

        await handleTelegramBotDelete(CONNECTION_ID, {telegramBotId: botId}, REQUEST_ID);

        expect(telegramBotStore.getById(botId)).toBeUndefined();
    });

    it('Bot 不存在時應回傳 not found error', async () => {
        const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

        await handleTelegramBotDelete(CONNECTION_ID, {telegramBotId: nonExistentId}, REQUEST_ID);

        expect(socketService.emitToConnection).toHaveBeenCalledWith(
            CONNECTION_ID,
            WebSocketResponseEvents.TELEGRAM_BOT_DELETED,
            expect.objectContaining({
                success: false,
                code: 'NOT_FOUND',
            })
        );
    });
});

describe('handleTelegramBotList', () => {
    beforeEach(() => {
        resetTestDb();
        vi.resetAllMocks();
    });

    it('應回傳所有 bot 列表（不含 botToken）', async () => {
        const anotherToken = '987654321:ZZYYXXWWVVUUttssrrqqpp9876543210';
        telegramBotStore.create('Bot A', BOT_TOKEN);
        telegramBotStore.create('Bot B', anotherToken);

        await handleTelegramBotList(CONNECTION_ID, {}, REQUEST_ID);

        expect(socketService.emitToConnection).toHaveBeenCalledWith(
            CONNECTION_ID,
            WebSocketResponseEvents.TELEGRAM_BOT_LIST_RESULT,
            expect.objectContaining({
                success: true,
                telegramBots: expect.arrayContaining([
                    expect.objectContaining({name: 'Bot A'}),
                    expect.objectContaining({name: 'Bot B'}),
                ]),
            })
        );

        const call = asMock(socketService.emitToConnection).mock.calls[0];
        const bots = (call[2] as Record<string, any>).telegramBots as Record<string, any>[];
        for (const bot of bots) {
            expect(bot).not.toHaveProperty('botToken');
        }
    });

    it('無 Bot 時應回傳空陣列', async () => {
        await handleTelegramBotList(CONNECTION_ID, {}, REQUEST_ID);

        expect(socketService.emitToConnection).toHaveBeenCalledWith(
            CONNECTION_ID,
            WebSocketResponseEvents.TELEGRAM_BOT_LIST_RESULT,
            expect.objectContaining({
                success: true,
                telegramBots: [],
            })
        );
    });
});

describe('handleTelegramBotGet', () => {
    beforeEach(() => {
        resetTestDb();
        vi.resetAllMocks();
    });

    it('正常取得 Bot 應回傳完整資料（不含 botToken）', async () => {
        const createResult = telegramBotStore.create('取得測試 Bot', BOT_TOKEN);
        const botId = createResult.data!.id;

        await handleTelegramBotGet(CONNECTION_ID, {telegramBotId: botId}, REQUEST_ID);

        expect(socketService.emitToConnection).toHaveBeenCalledWith(
            CONNECTION_ID,
            WebSocketResponseEvents.TELEGRAM_BOT_GET_RESULT,
            expect.objectContaining({
                success: true,
                telegramBot: expect.objectContaining({
                    id: botId,
                    name: '取得測試 Bot',
                }),
            })
        );

        const call = asMock(socketService.emitToConnection).mock.calls[0];
        const telegramBot = (call[2] as Record<string, any>).telegramBot;
        expect(telegramBot).not.toHaveProperty('botToken');
    });

    it('Bot 不存在應回傳 not found error', async () => {
        const nonExistentId = '550e8400-e29b-41d4-a716-446655440000';

        await handleTelegramBotGet(CONNECTION_ID, {telegramBotId: nonExistentId}, REQUEST_ID);

        expect(socketService.emitToConnection).toHaveBeenCalledWith(
            CONNECTION_ID,
            WebSocketResponseEvents.TELEGRAM_BOT_GET_RESULT,
            expect.objectContaining({
                success: false,
                code: 'NOT_FOUND',
            })
        );
    });
});

describe('handlePodBindTelegram', () => {
    beforeEach(() => {
        resetTestDb();
        vi.resetAllMocks();
        setupCanvas();
    });

    it('群組模式：正常綁定成功', async () => {
        const podId = setupPodInDb();
        const createResult = telegramBotStore.create('群組綁定 Bot', BOT_TOKEN);
        const botId = createResult.data!.id;
        const chatId = -100123456;

        telegramBotStore.updateStatus(botId, 'connected');
        telegramBotStore.updateChats(botId, [{id: chatId, type: 'group', title: '測試群組'}]);

        await handlePodBindTelegram(CONNECTION_ID, {
            canvasId: CANVAS_ID,
            podId,
            telegramBotId: botId,
            telegramChatId: chatId,
            chatType: 'group',
        }, REQUEST_ID);

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
            CANVAS_ID,
            WebSocketResponseEvents.POD_TELEGRAM_BOUND,
            expect.objectContaining({
                requestId: REQUEST_ID,
                success: true,
            })
        );
    });

    it('私聊模式：正常綁定成功', async () => {
        const podId = setupPodInDb();
        const createResult = telegramBotStore.create('私聊綁定 Bot', BOT_TOKEN);
        const botId = createResult.data!.id;
        const userId = 111111;

        telegramBotStore.updateStatus(botId, 'connected');

        await handlePodBindTelegram(CONNECTION_ID, {
            canvasId: CANVAS_ID,
            podId,
            telegramBotId: botId,
            telegramChatId: userId,
            chatType: 'private',
        }, REQUEST_ID);

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
            CANVAS_ID,
            WebSocketResponseEvents.POD_TELEGRAM_BOUND,
            expect.objectContaining({
                requestId: REQUEST_ID,
                success: true,
            })
        );
    });

    it('Bot 不存在應回傳 error', async () => {
        const podId = setupPodInDb();
        const nonExistentBotId = '550e8400-e29b-41d4-a716-446655440000';

        await handlePodBindTelegram(CONNECTION_ID, {
            canvasId: CANVAS_ID,
            podId,
            telegramBotId: nonExistentBotId,
            telegramChatId: 123456,
            chatType: 'group',
        }, REQUEST_ID);

        expect(socketService.emitToConnection).toHaveBeenCalledWith(
            CONNECTION_ID,
            WebSocketResponseEvents.POD_TELEGRAM_BOUND,
            expect.objectContaining({
                success: false,
                code: 'NOT_FOUND',
            })
        );
    });

    it('Pod 不存在應回傳 error', async () => {
        const createResult = telegramBotStore.create('綁定測試 Bot', BOT_TOKEN);
        const botId = createResult.data!.id;
        const nonExistentPodId = '550e8400-e29b-41d4-a716-446655440099';

        await handlePodBindTelegram(CONNECTION_ID, {
            canvasId: CANVAS_ID,
            podId: nonExistentPodId,
            telegramBotId: botId,
            telegramChatId: 123456,
            chatType: 'group',
        }, REQUEST_ID);

        expect(socketService.emitToConnection).toHaveBeenCalledWith(
            CONNECTION_ID,
            WebSocketResponseEvents.POD_TELEGRAM_BOUND,
            expect.objectContaining({
                success: false,
                code: 'NOT_FOUND',
            })
        );
    });
});

describe('handlePodUnbindTelegram', () => {
    beforeEach(() => {
        resetTestDb();
        vi.resetAllMocks();
        setupCanvas();
    });

    it('正常解除綁定成功', async () => {
        const podId = setupPodInDb();
        const createResult = telegramBotStore.create('解綁測試 Bot', BOT_TOKEN);
        const botId = createResult.data!.id;

        await podStore.setTelegramBinding(CANVAS_ID, podId, {
            telegramBotId: botId,
            telegramChatId: 123456,
            chatType: 'group',
        });

        await handlePodUnbindTelegram(CONNECTION_ID, {
            canvasId: CANVAS_ID,
            podId,
        }, REQUEST_ID);

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
            CANVAS_ID,
            WebSocketResponseEvents.POD_TELEGRAM_UNBOUND,
            expect.objectContaining({
                requestId: REQUEST_ID,
                success: true,
            })
        );
    });

    it('Pod 不存在應回傳 error', async () => {
        const nonExistentPodId = '550e8400-e29b-41d4-a716-446655440099';

        await handlePodUnbindTelegram(CONNECTION_ID, {
            canvasId: CANVAS_ID,
            podId: nonExistentPodId,
        }, REQUEST_ID);

        expect(socketService.emitToConnection).toHaveBeenCalledWith(
            CONNECTION_ID,
            WebSocketResponseEvents.POD_TELEGRAM_UNBOUND,
            expect.objectContaining({
                success: false,
                code: 'NOT_FOUND',
            })
        );
    });
});
