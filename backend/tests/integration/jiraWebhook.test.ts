import {createHmac} from 'crypto';
import {v4 as uuidv4} from 'uuid';
import {
    createTestServer,
    closeTestServer,
    createSocketClient,
    disconnectSocket,
    emitAndWaitResponse,
    type TestServerInstance,
} from '../setup';
import {WebSocketRequestEvents, WebSocketResponseEvents} from '../../src/schemas';
import type {TestWebSocketClient} from '../setup';
import type {JiraAppCreatePayload} from '../../src/schemas';

const MOCK_SITE_URL = 'https://test.atlassian.net';

const originalFetch = global.fetch;

function mockAtlassianFetch(): void {
    global.fetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
        if (url.includes('/rest/api/3/myself')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({emailAddress: 'test@example.com'}),
            });
        }
        if (url.includes('/rest/api/3/project')) {
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve([{key: 'PROJ', name: 'Test Project'}]),
            });
        }
        // 非 Atlassian 請求轉發給實際的 fetch
        return originalFetch(url, options);
    }) as unknown as typeof fetch;
}

function buildJiraSignature(webhookSecret: string, body: string): string {
    const hmac = createHmac('sha256', webhookSecret).update(body).digest('hex');
    return `sha256=${hmac}`;
}

function makeJiraIssueCreatedEvent(overrides: Record<string, any> = {}): Record<string, any> {
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

describe('Jira Webhook 整合測試', () => {
    let server: TestServerInstance;
    let client: TestWebSocketClient;
    let baseUrl: string;

    beforeAll(async () => {
        mockAtlassianFetch();
        server = await createTestServer();
        client = await createSocketClient(server.baseUrl, server.canvasId);
        baseUrl = server.baseUrl;
    });

    afterAll(async () => {
        global.fetch = originalFetch;
        if (client?.connected) await disconnectSocket(client);
        if (server) await closeTestServer(server);
    });

    describe('POST /jira/events 簽章驗證', () => {
        let webhookSecret: string;
        let jiraAppId: string;

        beforeAll(async () => {
            const id = uuidv4().replace(/-/g, '').slice(0, 8);
            webhookSecret = `webhook-secret-${id}`;

            const payload: JiraAppCreatePayload & {requestId: string} = {
                requestId: uuidv4(),
                name: `jira-webhook-test-${id}`,
                siteUrl: MOCK_SITE_URL,
                email: `jira-${id}@example.com`,
                apiToken: `api-token-${id}`,
                webhookSecret,
            };

            const response = await emitAndWaitResponse<typeof payload, Record<string, any>>(
                client,
                WebSocketRequestEvents.JIRA_APP_CREATE,
                WebSocketResponseEvents.JIRA_APP_CREATED,
                payload
            );

            jiraAppId = response.jiraApp.id;
            await new Promise((r) => setTimeout(r, 150));
        });

        afterAll(async () => {
            if (jiraAppId) {
                await emitAndWaitResponse(
                    client,
                    WebSocketRequestEvents.JIRA_APP_DELETE,
                    WebSocketResponseEvents.JIRA_APP_DELETED,
                    {requestId: uuidv4(), jiraAppId}
                );
            }
        });

        it('合法簽章的 jira:issue_created 事件回傳 200', async () => {
            const body = JSON.stringify(makeJiraIssueCreatedEvent());
            const signature = buildJiraSignature(webhookSecret, body);

            const res = await fetch(`${baseUrl}/jira/events`, {
                method: 'POST',
                body,
                headers: {
                    'content-type': 'application/json',
                    'X-Hub-Signature': signature,
                },
            });

            expect(res.status).toBe(200);
        });

        it('合法簽章的 jira:issue_updated 事件回傳 200', async () => {
            const body = JSON.stringify({
                webhookEvent: 'jira:issue_updated',
                user: {displayName: 'Test User'},
                issue: {key: 'PROJ-123', fields: {summary: 'Updated Issue'}},
                changelog: {items: [{field: 'status', fromString: 'Open', toString: 'In Progress'}]},
            });
            const signature = buildJiraSignature(webhookSecret, body);

            const res = await fetch(`${baseUrl}/jira/events`, {
                method: 'POST',
                body,
                headers: {
                    'content-type': 'application/json',
                    'X-Hub-Signature': signature,
                },
            });

            expect(res.status).toBe(200);
        });

        it('合法簽章的 jira:issue_deleted 事件回傳 200', async () => {
            const body = JSON.stringify({
                webhookEvent: 'jira:issue_deleted',
                user: {displayName: 'Test User'},
                issue: {key: 'PROJ-124', fields: {summary: 'Deleted Issue'}},
            });
            const signature = buildJiraSignature(webhookSecret, body);

            const res = await fetch(`${baseUrl}/jira/events`, {
                method: 'POST',
                body,
                headers: {
                    'content-type': 'application/json',
                    'X-Hub-Signature': signature,
                },
            });

            expect(res.status).toBe(200);
        });

        it('重複 webhookEvent timestamp+issueKey 回傳 200（去重）', async () => {
            const body = JSON.stringify(makeJiraIssueCreatedEvent({
                issue: {key: 'PROJ-999', fields: {summary: 'Dedup Test'}},
            }));
            const signature = buildJiraSignature(webhookSecret, body);

            const headers = {
                'content-type': 'application/json',
                'X-Hub-Signature': signature,
            };

            const res1 = await fetch(`${baseUrl}/jira/events`, {method: 'POST', body, headers});
            const res2 = await fetch(`${baseUrl}/jira/events`, {method: 'POST', body, headers});

            expect(res1.status).toBe(200);
            expect(res2.status).toBe(200);
        });

        it('簽章不合法回傳 403', async () => {
            const body = JSON.stringify(makeJiraIssueCreatedEvent());

            const res = await fetch(`${baseUrl}/jira/events`, {
                method: 'POST',
                body,
                headers: {
                    'content-type': 'application/json',
                    'X-Hub-Signature': 'sha256=invalidsignature',
                },
            });

            expect(res.status).toBe(403);
        });

        it('缺少 X-Hub-Signature header 回傳 403', async () => {
            const body = JSON.stringify(makeJiraIssueCreatedEvent());

            const res = await fetch(`${baseUrl}/jira/events`, {
                method: 'POST',
                body,
                headers: {'content-type': 'application/json'},
            });

            expect(res.status).toBe(403);
        });
    });

    describe('GET /jira/events', () => {
        it('回傳 404（只接受 POST）', async () => {
            const res = await fetch(`${baseUrl}/jira/events`, {method: 'GET'});

            expect(res.status).toBe(404);
        });
    });
});
