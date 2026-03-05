import type {Mock} from 'vitest';

vi.mock('../../src/services/podStore.js', () => ({
    podStore: {
        getById: vi.fn(),
        setStatus: vi.fn(),
        findByTelegramBot: vi.fn(() => []),
    },
}));

vi.mock('../../src/services/messageStore.js', () => ({
    messageStore: {
        addMessage: vi.fn(() => Promise.resolve({success: true, data: {id: 'msg-1'}})),
    },
}));

vi.mock('../../src/services/socketService.js', () => ({
    socketService: {
        emitToCanvas: vi.fn(),
    },
}));

vi.mock('../../src/services/connectionStore.js', () => ({
    connectionStore: {
        findBySourcePodId: vi.fn(() => []),
        findByTargetPodId: vi.fn(() => []),
    },
}));

vi.mock('../../src/services/claude/streamingChatExecutor.js', () => ({
    executeStreamingChat: vi.fn(() => Promise.resolve({messageId: 'stream-1', content: '回覆', hasContent: true, aborted: false})),
}));

vi.mock('../../src/utils/logger.js', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('../../src/services/autoClear/index.js', () => ({
    autoClearService: {
        onPodComplete: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../../src/services/workflow/index.js', () => ({
    workflowExecutionService: {
        checkAndTriggerWorkflows: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../../src/services/telegram/telegramClientManager.js', () => ({
    telegramClientManager: {
        sendMessage: vi.fn(() => Promise.resolve({success: true})),
        setOnMessage: vi.fn(),
    },
}));

import {telegramEventService} from '../../src/services/telegram/telegramEventService.js';
import {podStore} from '../../src/services/podStore.js';
import {connectionStore} from '../../src/services/connectionStore.js';
import type {Pod} from '../../src/types/index.js';

function asMock(fn: unknown): Mock<any> {
    return fn as Mock<any>;
}

function makePod(overrides: Partial<Pod> = {}): Pod {
    return {
        id: 'pod-1',
        name: 'Test Pod',
        status: 'idle',
        workspacePath: '/workspace/pod-1',
        x: 0,
        y: 0,
        rotation: 0,
        claudeSessionId: null,
        outputStyleId: null,
        skillIds: [],
        subAgentIds: [],
        mcpServerIds: [],
        model: 'opus',
        repositoryId: null,
        commandId: null,
        autoClear: false,
        ...overrides,
    };
}

describe('TelegramEventService - findBoundPods', () => {
    const canvasId = 'canvas-1';
    const botId = 'bot-1';
    const chatId = 123456;

    beforeEach(() => {
        vi.resetAllMocks();
        asMock(connectionStore.findBySourcePodId).mockReturnValue([]);
        asMock(connectionStore.findByTargetPodId).mockReturnValue([]);
        asMock(podStore.findByTelegramBot).mockReturnValue([]);
    });

    it('群組模式：chatId 符合時回傳 Pod', () => {
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: chatId, chatType: 'group'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);

        const result = telegramEventService.findBoundPods(botId, chatId);

        expect(result).toHaveLength(1);
        expect(result[0].pod.id).toBe('pod-1');
    });

    it('群組模式：chatId 不符合時不回傳 Pod', () => {
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: 999999, chatType: 'group'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);

        const result = telegramEventService.findBoundPods(botId, chatId);

        expect(result).toHaveLength(0);
    });

    it('私人模式：fromUserId 與 telegramChatId 一致時回傳 Pod', () => {
        const userId = 111111;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: userId, chatType: 'private'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);

        const result = telegramEventService.findBoundPods(botId, userId, userId);

        expect(result).toHaveLength(1);
        expect(result[0].pod.id).toBe('pod-1');
    });

    it('私人模式：fromUserId 與 telegramChatId 不一致時不回傳 Pod', () => {
        const bindUserId = 111111;
        const otherUserId = 222222;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: bindUserId, chatType: 'private'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);

        const result = telegramEventService.findBoundPods(botId, bindUserId, otherUserId);

        expect(result).toHaveLength(0);
    });

    it('私人模式：未提供 fromUserId 時不過濾 userId（視為匹配）', () => {
        const userId = 111111;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: userId, chatType: 'private'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);

        const result = telegramEventService.findBoundPods(botId, userId);

        expect(result).toHaveLength(1);
    });

    it('無綁定 Pod 時回傳空陣列', () => {
        asMock(podStore.findByTelegramBot).mockReturnValue([]);

        const result = telegramEventService.findBoundPods(botId, chatId);

        expect(result).toHaveLength(0);
    });
});

describe('TelegramEventService - handleMessage', () => {
    const canvasId = 'canvas-1';
    const botId = 'bot-1';
    const botUsername = 'testbot';

    beforeEach(() => {
        vi.resetAllMocks();
        asMock(connectionStore.findBySourcePodId).mockReturnValue([]);
        asMock(connectionStore.findByTargetPodId).mockReturnValue([]);
        asMock(podStore.findByTelegramBot).mockReturnValue([]);
    });

    it('私人模式：來自綁定用戶的訊息應路由至 Pod', async () => {
        const userId = 111111;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: userId, chatType: 'private'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);
        asMock(podStore.getById).mockReturnValue(pod);

        await telegramEventService.handleMessage(botId, {
            message_id: 1,
            from: {id: userId, is_bot: false, first_name: 'Test', username: 'testuser'},
            chat: {id: userId, type: 'private'},
            text: '你好',
        }, botUsername);

        const {executeStreamingChat} = await import('../../src/services/claude/streamingChatExecutor.js');
        expect(executeStreamingChat).toHaveBeenCalled();
    });

    it('私人模式：來自其他用戶的訊息不應路由至 Pod', async () => {
        const bindUserId = 111111;
        const otherUserId = 222222;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: bindUserId, chatType: 'private'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);

        await telegramEventService.handleMessage(botId, {
            message_id: 1,
            from: {id: otherUserId, is_bot: false, first_name: 'Other', username: 'otheruser'},
            chat: {id: otherUserId, type: 'private'},
            text: '你好',
        }, botUsername);

        const {executeStreamingChat} = await import('../../src/services/claude/streamingChatExecutor.js');
        expect(executeStreamingChat).not.toHaveBeenCalled();
    });

    it('群組模式：@mention 訊息應路由至 Pod', async () => {
        const groupChatId = -100123456;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: groupChatId, chatType: 'group'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);
        asMock(podStore.getById).mockReturnValue(pod);

        await telegramEventService.handleMessage(botId, {
            message_id: 2,
            from: {id: 999, is_bot: false, first_name: 'User', username: 'someuser'},
            chat: {id: groupChatId, type: 'group'},
            text: `@${botUsername} 你好`,
        }, botUsername);

        const {executeStreamingChat} = await import('../../src/services/claude/streamingChatExecutor.js');
        expect(executeStreamingChat).toHaveBeenCalled();
    });

    it('群組模式：沒有 @mention 也沒有 /command 的訊息不應路由', async () => {
        const groupChatId = -100123456;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: groupChatId, chatType: 'group'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);

        await telegramEventService.handleMessage(botId, {
            message_id: 3,
            from: {id: 999, is_bot: false, first_name: 'User', username: 'someuser'},
            chat: {id: groupChatId, type: 'group'},
            text: '普通群組訊息',
        }, botUsername);

        const {executeStreamingChat} = await import('../../src/services/claude/streamingChatExecutor.js');
        expect(executeStreamingChat).not.toHaveBeenCalled();
    });

    it('Bot 自己發送的訊息不應處理', async () => {
        await telegramEventService.handleMessage(botId, {
            message_id: 4,
            from: {id: 99, is_bot: true, first_name: 'Bot'},
            chat: {id: 99, type: 'private'},
            text: '我是 Bot',
        }, botUsername);

        const {executeStreamingChat} = await import('../../src/services/claude/streamingChatExecutor.js');
        expect(executeStreamingChat).not.toHaveBeenCalled();
    });

    it('群組模式：帶有 @botUsername 的 /command 應路由至 Pod', async () => {
        const groupChatId = -100123456;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: groupChatId, chatType: 'group'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);
        asMock(podStore.getById).mockReturnValue(pod);

        await telegramEventService.handleMessage(botId, {
            message_id: 5,
            from: {id: 999, is_bot: false, first_name: 'User', username: 'someuser'},
            chat: {id: groupChatId, type: 'group'},
            text: `/start@${botUsername}`,
        }, botUsername);

        const {executeStreamingChat} = await import('../../src/services/claude/streamingChatExecutor.js');
        expect(executeStreamingChat).toHaveBeenCalled();
    });

    it('群組模式：不含 @botUsername 的 /command 不應路由至 Pod', async () => {
        const groupChatId = -100123456;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: groupChatId, chatType: 'group'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);

        await telegramEventService.handleMessage(botId, {
            message_id: 6,
            from: {id: 999, is_bot: false, first_name: 'User', username: 'someuser'},
            chat: {id: groupChatId, type: 'group'},
            text: '/start',
        }, botUsername);

        const {executeStreamingChat} = await import('../../src/services/claude/streamingChatExecutor.js');
        expect(executeStreamingChat).not.toHaveBeenCalled();
    });

    it('私人模式：不含 @botUsername 的 /command 應路由至 Pod', async () => {
        const userId = 111111;
        const pod = makePod({
            telegramBinding: {telegramBotId: botId, telegramChatId: userId, chatType: 'private'},
        });
        asMock(podStore.findByTelegramBot).mockReturnValue([{canvasId, pod}]);
        asMock(podStore.getById).mockReturnValue(pod);

        await telegramEventService.handleMessage(botId, {
            message_id: 7,
            from: {id: userId, is_bot: false, first_name: 'User', username: 'testuser'},
            chat: {id: userId, type: 'private'},
            text: '/start',
        }, botUsername);

        const {executeStreamingChat} = await import('../../src/services/claude/streamingChatExecutor.js');
        expect(executeStreamingChat).toHaveBeenCalled();
    });
});
