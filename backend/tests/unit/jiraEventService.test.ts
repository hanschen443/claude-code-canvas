import type {Mock} from 'vitest';

vi.mock('../../src/services/podStore.js', () => ({
    podStore: {
        getById: vi.fn(),
        setStatus: vi.fn(),
        findByJiraApp: vi.fn(() => []),
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

import {jiraEventService} from '../../src/services/jira/jiraEventService.js';
import {podStore} from '../../src/services/podStore.js';
import {messageStore} from '../../src/services/messageStore.js';
import {socketService} from '../../src/services/socketService.js';
import {connectionStore} from '../../src/services/connectionStore.js';
import {executeStreamingChat} from '../../src/services/claude/streamingChatExecutor.js';
import {autoClearService} from '../../src/services/autoClear/index.js';
import {workflowExecutionService} from '../../src/services/workflow/index.js';
import {WebSocketResponseEvents} from '../../src/schemas/events.js';
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

function makeWebhookPayload(overrides: Record<string, any> = {}) {
    return {
        webhookEvent: 'jira:issue_created',
        user: {displayName: 'Test User', emailAddress: 'user@example.com'},
        issue: {
            key: 'PROJ-123',
            fields: {summary: 'Test Issue'},
        },
        ...overrides,
    };
}

describe('JiraEventService', () => {
    const canvasId = 'canvas-1';
    const podId = 'pod-1';

    beforeEach(() => {
        vi.resetAllMocks();
        asMock(podStore.findByJiraApp).mockReturnValue([]);
        asMock(messageStore.addMessage).mockResolvedValue({success: true, data: {id: 'msg-1'}});
        asMock(connectionStore.findBySourcePodId).mockReturnValue([]);
        asMock(connectionStore.findByTargetPodId).mockReturnValue([]);
        asMock(executeStreamingChat).mockResolvedValue({messageId: 'stream-1', content: '回覆', hasContent: true, aborted: false});
        asMock(autoClearService.onPodComplete).mockResolvedValue(undefined);
        asMock(workflowExecutionService.checkAndTriggerWorkflows).mockResolvedValue(undefined);
    });

    describe('findBoundPods', () => {
        it('找到綁定的 Pod', () => {
            const pod = makePod({
                jiraBinding: {jiraAppId: 'app-1', jiraProjectKey: 'PROJ'},
            });
            asMock(podStore.findByJiraApp).mockReturnValue([{canvasId, pod}]);

            const result = jiraEventService.findBoundPods('app-1', 'PROJ');

            expect(result).toHaveLength(1);
            expect(result[0].pod.id).toBe('pod-1');
        });

        it('projectKey 不符合時不回傳 Pod', () => {
            const pod = makePod({
                jiraBinding: {jiraAppId: 'app-1', jiraProjectKey: 'OTHER'},
            });
            asMock(podStore.findByJiraApp).mockReturnValue([{canvasId, pod}]);

            const result = jiraEventService.findBoundPods('app-1', 'PROJ');

            expect(result).toHaveLength(0);
        });

        it('無綁定 Pod 時回傳空陣列', () => {
            asMock(podStore.findByJiraApp).mockReturnValue([]);

            const result = jiraEventService.findBoundPods('app-1', 'PROJ');

            expect(result).toHaveLength(0);
        });
    });

    describe('handleIssueEvent', () => {
        it('找到綁定的 Pod 並注入訊息', async () => {
            const pod = makePod({
                jiraBinding: {jiraAppId: 'app-1', jiraProjectKey: 'PROJ'},
            });
            asMock(podStore.findByJiraApp).mockReturnValue([{canvasId, pod}]);
            asMock(podStore.getById).mockReturnValue(pod);

            await jiraEventService.handleIssueEvent('app-1', 'jira:issue_created', makeWebhookPayload());

            expect(messageStore.addMessage).toHaveBeenCalledWith(
                canvasId,
                podId,
                'user',
                expect.stringContaining('建立了 Issue PROJ-123')
            );
        });

        it('找不到綁定的 Pod 時不觸發對話', async () => {
            asMock(podStore.findByJiraApp).mockReturnValue([]);

            await jiraEventService.handleIssueEvent('app-1', 'jira:issue_created', makeWebhookPayload());

            expect(executeStreamingChat).not.toHaveBeenCalled();
        });

        it('Pod 忙碌時跳過注入', async () => {
            const pod = makePod({
                status: 'chatting',
                jiraBinding: {jiraAppId: 'app-1', jiraProjectKey: 'PROJ'},
            });
            asMock(podStore.findByJiraApp).mockReturnValue([{canvasId, pod}]);

            await jiraEventService.handleIssueEvent('app-1', 'jira:issue_created', makeWebhookPayload());

            expect(executeStreamingChat).not.toHaveBeenCalled();
        });

        it('issue_updated 事件包含 changelog 資訊', async () => {
            const pod = makePod({
                jiraBinding: {jiraAppId: 'app-1', jiraProjectKey: 'PROJ'},
            });
            asMock(podStore.findByJiraApp).mockReturnValue([{canvasId, pod}]);
            asMock(podStore.getById).mockReturnValue(pod);

            const payload = makeWebhookPayload({
                webhookEvent: 'jira:issue_updated',
                changelog: {
                    items: [{field: 'status', fromString: 'Open', toString: 'In Progress'}],
                },
            });

            await jiraEventService.handleIssueEvent('app-1', 'jira:issue_updated', payload);

            expect(messageStore.addMessage).toHaveBeenCalledWith(
                canvasId,
                podId,
                'user',
                expect.stringContaining('變更:')
            );
        });
    });

    describe('injectJiraMessage', () => {
        it('設定 Pod 狀態為 chatting', async () => {
            const pod = makePod();
            asMock(podStore.getById).mockReturnValue(pod);

            await jiraEventService.injectJiraMessage(canvasId, podId, {
                id: 'msg-1',
                jiraAppId: 'app-1',
                projectKey: 'PROJ',
                issueKey: 'PROJ-123',
                eventType: 'jira:issue_created',
                userName: 'Test User',
                text: '[Jira: Test User] <user_data>建立了 Issue PROJ-123: Test</user_data>',
            });

            expect(podStore.setStatus).toHaveBeenCalledWith(canvasId, podId, 'chatting');
        });

        it('廣播 POD_CHAT_USER_MESSAGE 事件至前端', async () => {
            const pod = makePod();
            asMock(podStore.getById).mockReturnValue(pod);
            const text = '[Jira: Test User] <user_data>建立了 Issue PROJ-123: Test</user_data>';

            await jiraEventService.injectJiraMessage(canvasId, podId, {
                id: 'msg-1',
                jiraAppId: 'app-1',
                projectKey: 'PROJ',
                issueKey: 'PROJ-123',
                eventType: 'jira:issue_created',
                userName: 'Test User',
                text,
            });

            expect(socketService.emitToCanvas).toHaveBeenCalledWith(
                canvasId,
                WebSocketResponseEvents.POD_CHAT_USER_MESSAGE,
                expect.objectContaining({canvasId, podId, content: text})
            );
        });

        it('Pod 在二次確認時已變為 chatting 應跳過注入', async () => {
            const pod = makePod({status: 'chatting'});
            asMock(podStore.getById).mockReturnValue(pod);

            await jiraEventService.injectJiraMessage(canvasId, podId, {
                id: 'msg-1',
                jiraAppId: 'app-1',
                projectKey: 'PROJ',
                issueKey: 'PROJ-123',
                eventType: 'jira:issue_created',
                userName: 'Test User',
                text: 'test',
            });

            expect(executeStreamingChat).not.toHaveBeenCalled();
            expect(podStore.setStatus).not.toHaveBeenCalled();
        });

        it('完成後應觸發 autoClear 和 workflow', async () => {
            const pod = makePod();
            asMock(podStore.getById).mockReturnValue(pod);

            asMock(executeStreamingChat).mockImplementationOnce(async (_params, options) => {
                if (options?.onComplete) {
                    await options.onComplete(canvasId, podId);
                }
                return {messageId: 'stream-1', content: '回覆', hasContent: true, aborted: false};
            });

            await jiraEventService.injectJiraMessage(canvasId, podId, {
                id: 'msg-1',
                jiraAppId: 'app-1',
                projectKey: 'PROJ',
                issueKey: 'PROJ-123',
                eventType: 'jira:issue_created',
                userName: 'Test User',
                text: 'test',
            });

            await vi.waitFor(() => {
                expect(autoClearService.onPodComplete).toHaveBeenCalledWith(canvasId, podId);
                expect(workflowExecutionService.checkAndTriggerWorkflows).toHaveBeenCalledWith(canvasId, podId);
            });
        });

        it('inject 失敗時 Pod 狀態應從 chatting 變為 error', async () => {
            const pod = makePod();
            asMock(podStore.getById).mockReturnValue(pod);
            asMock(executeStreamingChat).mockRejectedValue(new Error('串流錯誤'));

            await expect(
                jiraEventService.injectJiraMessage(canvasId, podId, {
                    id: 'msg-1',
                    jiraAppId: 'app-1',
                    projectKey: 'PROJ',
                    issueKey: 'PROJ-123',
                    eventType: 'jira:issue_created',
                    userName: 'Test User',
                    text: 'test',
                })
            ).rejects.toThrow('串流錯誤');

            expect(podStore.setStatus).toHaveBeenCalledWith(canvasId, podId, 'error');
        });
    });

    describe('Pod error 狀態自動重置', () => {
        it('Pod 狀態為 error 時收到 Jira 事件應先重置為 idle 再注入訊息', async () => {
            const pod = makePod({
                status: 'error',
                jiraBinding: {jiraAppId: 'app-1', jiraProjectKey: 'PROJ'},
            });
            asMock(podStore.findByJiraApp).mockReturnValue([{canvasId, pod}]);
            asMock(podStore.getById).mockReturnValue({...pod, status: 'idle'});

            await jiraEventService.handleIssueEvent('app-1', 'jira:issue_created', makeWebhookPayload());

            expect(podStore.setStatus).toHaveBeenCalledWith(canvasId, podId, 'idle');
            expect(executeStreamingChat).toHaveBeenCalled();
        });
    });

    describe('Workflow Chain 忙碌情境', () => {
        it('綁定的 Pod 在 Workflow Chain 中且鄰近 Pod 為 chatting 時應視為忙碌並 skip', async () => {
            const pod = makePod({
                id: 'pod-1',
                status: 'idle',
                jiraBinding: {jiraAppId: 'app-1', jiraProjectKey: 'PROJ'},
            });
            const adjacentPod = makePod({id: 'pod-2', status: 'chatting'});

            asMock(podStore.findByJiraApp).mockReturnValue([{canvasId, pod}]);
            asMock(connectionStore.findBySourcePodId).mockReturnValue([{sourcePodId: 'pod-1', targetPodId: 'pod-2'}]);
            asMock(connectionStore.findByTargetPodId).mockReturnValue([]);
            asMock(podStore.getById).mockImplementation((_cId: string, id: string) => {
                if (id === 'pod-1') return pod;
                if (id === 'pod-2') return adjacentPod;
                return undefined;
            });

            await jiraEventService.handleIssueEvent('app-1', 'jira:issue_created', makeWebhookPayload());

            expect(executeStreamingChat).not.toHaveBeenCalled();
        });
    });
});
