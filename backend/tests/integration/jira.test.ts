import {v4 as uuidv4} from 'uuid';
import {
    createTestServer,
    closeTestServer,
    createSocketClient,
    disconnectSocket,
    emitAndWaitResponse,
    type TestServerInstance,
} from '../setup';
import {createPod, getCanvasId, FAKE_UUID} from '../helpers';
import {
    WebSocketRequestEvents,
    WebSocketResponseEvents,
    type JiraAppCreatePayload,
    type JiraAppDeletePayload,
    type JiraAppGetPayload,
    type JiraAppProjectsPayload,
    type JiraAppProjectsRefreshPayload,
    type PodBindJiraPayload,
    type PodUnbindJiraPayload,
} from '../../src/schemas';
import type {TestWebSocketClient} from '../setup';

const MOCK_SITE_URL = 'https://test.atlassian.net';
const MOCK_PROJECTS = [{key: 'PROJ', name: 'Test Project'}, {key: 'DEV', name: 'Dev Project'}];

vi.mock('node-fetch', () => ({default: vi.fn()}));

const originalFetch = global.fetch;

function mockAtlassianFetch(): void {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/rest/api/3/myself')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({emailAddress: 'test@example.com', displayName: 'Test User'}),
            });
        }
        if (url.includes('/rest/api/3/project')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve(MOCK_PROJECTS),
            });
        }
        // 非 Atlassian 請求轉發給實際的 fetch
        return originalFetch(url, options);
    }) as unknown as typeof fetch;
}

async function createJiraApp(
    client: TestWebSocketClient,
    overrides?: Partial<JiraAppCreatePayload>
): Promise<Record<string, any>> {
    const id = uuidv4().replace(/-/g, '').slice(0, 8);
    const payload: JiraAppCreatePayload & {requestId: string} = {
        requestId: uuidv4(),
        name: `test-jira-app-${id}`,
        siteUrl: MOCK_SITE_URL,
        email: `test-${id}@example.com`,
        apiToken: `test-api-token-${id}`,
        webhookSecret: `test-webhook-secret-${id}`,
        ...overrides,
    };

    const response = await emitAndWaitResponse<typeof payload, Record<string, any>>(
        client,
        WebSocketRequestEvents.JIRA_APP_CREATE,
        WebSocketResponseEvents.JIRA_APP_CREATED,
        payload
    );

    // initialize 是 fire-and-forget，短暫等待讓其完成
    if (response.success && response.jiraApp?.id) {
        await new Promise((r) => setTimeout(r, 150));
    }

    return response;
}

async function deleteJiraApp(
    client: TestWebSocketClient,
    jiraAppId: string
): Promise<Record<string, any>> {
    return emitAndWaitResponse<JiraAppDeletePayload & {requestId: string}, Record<string, any>>(
        client,
        WebSocketRequestEvents.JIRA_APP_DELETE,
        WebSocketResponseEvents.JIRA_APP_DELETED,
        {requestId: uuidv4(), jiraAppId}
    );
}

describe('Jira 整合', () => {
    let server: TestServerInstance;
    let client: TestWebSocketClient;

    beforeAll(async () => {
        mockAtlassianFetch();
        server = await createTestServer();
        client = await createSocketClient(server.baseUrl, server.canvasId);
    });

    afterAll(async () => {
        global.fetch = originalFetch;
        if (client?.connected) await disconnectSocket(client);
        if (server) await closeTestServer(server);
    });

    describe('Jira App CRUD', () => {
        let createdAppId: string;

        afterEach(async () => {
            if (createdAppId) {
                await deleteJiraApp(client, createdAppId);
                createdAppId = '';
            }
        });

        it('透過 WS 事件 jira:app:create 建立 Jira App', async () => {
            const response = await createJiraApp(client);

            expect(response.success).toBe(true);
            expect(response.jiraApp).toBeDefined();
            expect(response.jiraApp.name).toContain('test-jira-app-');
            expect(response.jiraApp.apiToken).toBeUndefined();
            expect(response.jiraApp.webhookSecret).toBeUndefined();

            createdAppId = response.jiraApp.id;
        });

        it('建立 Jira App 時 siteUrl 為空應失敗', async () => {
            const response = await emitAndWaitResponse<Record<string, any>, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_CREATE,
                WebSocketResponseEvents.JIRA_APP_CREATED,
                {
                    requestId: uuidv4(),
                    name: 'empty-siteUrl-app',
                    siteUrl: '',
                    email: 'test@example.com',
                    apiToken: 'token',
                    webhookSecret: 'secret',
                }
            );

            expect(response.success).toBe(false);
            expect(response.error).toBeDefined();
        });

        it('建立 Jira App 時 email 格式不正確應失敗', async () => {
            const response = await emitAndWaitResponse<Record<string, any>, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_CREATE,
                WebSocketResponseEvents.JIRA_APP_CREATED,
                {
                    requestId: uuidv4(),
                    name: 'invalid-email-app',
                    siteUrl: MOCK_SITE_URL,
                    email: 'not-an-email',
                    apiToken: 'token',
                    webhookSecret: 'secret',
                }
            );

            expect(response.success).toBe(false);
            expect(response.error).toBeDefined();
        });

        it('建立 Jira App 時 apiToken 為空應失敗', async () => {
            const response = await emitAndWaitResponse<Record<string, any>, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_CREATE,
                WebSocketResponseEvents.JIRA_APP_CREATED,
                {
                    requestId: uuidv4(),
                    name: 'empty-token-app',
                    siteUrl: MOCK_SITE_URL,
                    email: 'test@example.com',
                    apiToken: '',
                    webhookSecret: 'secret',
                }
            );

            expect(response.success).toBe(false);
            expect(response.error).toBeDefined();
        });

        it('建立 Jira App 時 webhookSecret 為空應失敗', async () => {
            const response = await emitAndWaitResponse<Record<string, any>, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_CREATE,
                WebSocketResponseEvents.JIRA_APP_CREATED,
                {
                    requestId: uuidv4(),
                    name: 'empty-secret-app',
                    siteUrl: MOCK_SITE_URL,
                    email: 'test@example.com',
                    apiToken: 'token',
                    webhookSecret: '',
                }
            );

            expect(response.success).toBe(false);
            expect(response.error).toBeDefined();
        });

        it('建立 Jira App 時名稱為空應失敗', async () => {
            const response = await emitAndWaitResponse<Record<string, any>, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_CREATE,
                WebSocketResponseEvents.JIRA_APP_CREATED,
                {
                    requestId: uuidv4(),
                    name: '',
                    siteUrl: MOCK_SITE_URL,
                    email: 'test@example.com',
                    apiToken: 'token',
                    webhookSecret: 'secret',
                }
            );

            expect(response.success).toBe(false);
            expect(response.error).toBeDefined();
        });

        it('透過 WS 事件 jira:app:list 取得 Jira App 清單', async () => {
            const createResponse = await createJiraApp(client);
            createdAppId = createResponse.jiraApp.id;

            const response = await emitAndWaitResponse<{requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_LIST,
                WebSocketResponseEvents.JIRA_APP_LIST_RESULT,
                {requestId: uuidv4()}
            );

            expect(response.success).toBe(true);
            expect(Array.isArray(response.jiraApps)).toBe(true);
            const ids = response.jiraApps.map((a: any) => a.id);
            expect(ids).toContain(createdAppId);
        });

        it('透過 WS 事件 jira:app:get 取得單一 Jira App 詳情', async () => {
            const createResponse = await createJiraApp(client);
            createdAppId = createResponse.jiraApp.id;

            const response = await emitAndWaitResponse<JiraAppGetPayload & {requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_GET,
                WebSocketResponseEvents.JIRA_APP_GET_RESULT,
                {requestId: uuidv4(), jiraAppId: createdAppId}
            );

            expect(response.success).toBe(true);
            expect(response.jiraApp.id).toBe(createdAppId);
        });

        it('透過 WS 事件 jira:app:delete 刪除 Jira App', async () => {
            const createResponse = await createJiraApp(client);
            const appId = createResponse.jiraApp.id;

            const response = await deleteJiraApp(client, appId);

            expect(response.success).toBe(true);
            expect(response.jiraAppId).toBe(appId);

            createdAppId = '';
        });

        it('刪除不存在的 Jira App 回傳錯誤', async () => {
            const response = await deleteJiraApp(client, FAKE_UUID);

            expect(response.success).toBe(false);
            expect(response.error).toContain('找不到');
        });

        it('透過 WS 事件 jira:app:projects 取得 Jira App 的 Projects 清單', async () => {
            const createResponse = await createJiraApp(client);
            createdAppId = createResponse.jiraApp.id;

            const response = await emitAndWaitResponse<JiraAppProjectsPayload & {requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_PROJECTS,
                WebSocketResponseEvents.JIRA_APP_PROJECTS_RESULT,
                {requestId: uuidv4(), jiraAppId: createdAppId}
            );

            expect(response.success).toBe(true);
            expect(response.jiraAppId).toBe(createdAppId);
            expect(Array.isArray(response.projects)).toBe(true);
        });

        it('透過 WS 事件 jira:app:projects:refresh 重新取得 Projects 清單', async () => {
            const createResponse = await createJiraApp(client);
            createdAppId = createResponse.jiraApp.id;

            const response = await emitAndWaitResponse<JiraAppProjectsRefreshPayload & {requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_PROJECTS_REFRESH,
                WebSocketResponseEvents.JIRA_APP_PROJECTS_REFRESHED,
                {requestId: uuidv4(), jiraAppId: createdAppId}
            );

            expect(response.success).toBe(true);
            expect(response.jiraAppId).toBe(createdAppId);
            expect(Array.isArray(response.projects)).toBe(true);
        });
    });

    describe('Pod 綁定 Jira', () => {
        let jiraAppId: string;

        beforeAll(async () => {
            const response = await createJiraApp(client);
            jiraAppId = response.jiraApp.id;
        });

        afterAll(async () => {
            if (jiraAppId) {
                await deleteJiraApp(client, jiraAppId);
            }
        });

        it('Pod 綁定 Jira 連線（WS 事件 pod:bind-jira）', async () => {
            const pod = await createPod(client);
            const canvasId = await getCanvasId(client);

            const response = await emitAndWaitResponse<PodBindJiraPayload & {requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.POD_BIND_JIRA,
                WebSocketResponseEvents.POD_JIRA_BOUND,
                {
                    requestId: uuidv4(),
                    canvasId,
                    podId: pod.id,
                    jiraAppId,
                    jiraProjectKey: 'PROJ',
                }
            );

            expect(response.success).toBe(true);
            expect(response.pod).toBeDefined();
            expect(response.pod.id).toBe(pod.id);
            expect(response.pod.jiraBinding).toEqual({jiraAppId, jiraProjectKey: 'PROJ'});
        });

        it('Pod 解綁 Jira 連線（WS 事件 pod:unbind-jira）', async () => {
            const pod = await createPod(client);
            const canvasId = await getCanvasId(client);

            await emitAndWaitResponse<PodBindJiraPayload & {requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.POD_BIND_JIRA,
                WebSocketResponseEvents.POD_JIRA_BOUND,
                {
                    requestId: uuidv4(),
                    canvasId,
                    podId: pod.id,
                    jiraAppId,
                    jiraProjectKey: 'PROJ',
                }
            );

            const response = await emitAndWaitResponse<PodUnbindJiraPayload & {requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.POD_UNBIND_JIRA,
                WebSocketResponseEvents.POD_JIRA_UNBOUND,
                {
                    requestId: uuidv4(),
                    canvasId,
                    podId: pod.id,
                }
            );

            expect(response.success).toBe(true);
            expect(response.pod).toBeDefined();
            expect(response.pod.id).toBe(pod.id);
            expect(response.pod.jiraBinding).toBeUndefined();
        });

        it('Pod 綁定時指定不存在的 Jira App 應失敗', async () => {
            const pod = await createPod(client);
            const canvasId = await getCanvasId(client);

            const response = await emitAndWaitResponse<PodBindJiraPayload & {requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.POD_BIND_JIRA,
                WebSocketResponseEvents.POD_JIRA_BOUND,
                {
                    requestId: uuidv4(),
                    canvasId,
                    podId: pod.id,
                    jiraAppId: FAKE_UUID,
                    jiraProjectKey: 'PROJ',
                }
            );

            expect(response.success).toBe(false);
            expect(response.error).toContain('找不到');
        });

        it('Pod 綁定時指定不存在的 Project Key 應失敗', async () => {
            const pod = await createPod(client);
            const canvasId = await getCanvasId(client);

            const response = await emitAndWaitResponse<PodBindJiraPayload & {requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.POD_BIND_JIRA,
                WebSocketResponseEvents.POD_JIRA_BOUND,
                {
                    requestId: uuidv4(),
                    canvasId,
                    podId: pod.id,
                    jiraAppId,
                    jiraProjectKey: 'NONEXISTENT',
                }
            );

            expect(response.success).toBe(false);
            expect(response.error).toContain('找不到');
        });

        it('Jira App API 驗證失敗（connectionStatus 為 error）時綁定 Pod 應失敗', async () => {
            // 建立 App，但模擬 API 驗證失敗讓 connectionStatus 為 error
            global.fetch = vi.fn().mockResolvedValue({ok: false, status: 401}) as unknown as typeof fetch;

            const failResponse = await createJiraApp(client);
            const failAppId = failResponse.jiraApp.id;

            try {
                const pod = await createPod(client);
                const canvasId = await getCanvasId(client);

                const response = await emitAndWaitResponse<PodBindJiraPayload & {requestId: string}, Record<string, any>>(
                    client,
                    WebSocketRequestEvents.POD_BIND_JIRA,
                    WebSocketResponseEvents.POD_JIRA_BOUND,
                    {
                        requestId: uuidv4(),
                        canvasId,
                        podId: pod.id,
                        jiraAppId: failAppId,
                        jiraProjectKey: 'PROJ',
                    }
                );

                expect(response.success).toBe(false);
                expect(response.code).toBe('NOT_CONNECTED');
            } finally {
                // 恢復 fetch mock 並清理
                mockAtlassianFetch();
                await deleteJiraApp(client, failAppId);
            }
        });
    });

    describe('Jira 自動清理', () => {
        it('Jira App 刪除時自動解綁所有 Pod', async () => {
            const appResponse = await createJiraApp(client);
            const appId = appResponse.jiraApp.id;
            const pod = await createPod(client);
            const canvasId = await getCanvasId(client);

            await emitAndWaitResponse<PodBindJiraPayload & {requestId: string}, Record<string, any>>(
                client,
                WebSocketRequestEvents.POD_BIND_JIRA,
                WebSocketResponseEvents.POD_JIRA_BOUND,
                {
                    requestId: uuidv4(),
                    canvasId,
                    podId: pod.id,
                    jiraAppId: appId,
                    jiraProjectKey: 'PROJ',
                }
            );

            const deleteResponse = await deleteJiraApp(client, appId);
            expect(deleteResponse.success).toBe(true);

            const {podStore} = await import('../../src/services/podStore.js');
            const updatedPod = podStore.getById(canvasId, pod.id);
            expect(updatedPod?.jiraBinding).toBeUndefined();
        });
    });
});
