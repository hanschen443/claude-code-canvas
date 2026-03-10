import {createHmac} from 'crypto';
import type {Mock} from 'vitest';

vi.mock('../../src/services/jira/jiraAppStore.js', () => ({
    jiraAppStore: {
        list: vi.fn(() => []),
        getById: vi.fn(),
    },
}));

vi.mock('../../src/services/jira/jiraEventService.js', () => ({
    jiraEventService: {
        handleIssueEvent: vi.fn(() => Promise.resolve()),
    },
}));

vi.mock('../../src/utils/logger.js', () => ({
    logger: {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import {handleJiraWebhook} from '../../src/services/jira/jiraWebhookHandler.js';
import {jiraAppStore} from '../../src/services/jira/jiraAppStore.js';
import {jiraEventService} from '../../src/services/jira/jiraEventService.js';

function asMock(fn: unknown): Mock<any> {
    return fn as Mock<any>;
}

const TEST_WEBHOOK_SECRET = 'test-webhook-secret';

function buildSignature(webhookSecret: string, body: string): string {
    const hmac = createHmac('sha256', webhookSecret).update(body).digest('hex');
    return `sha256=${hmac}`;
}

function makeRequest(body: unknown, overrides: {signature?: string; webhookSecret?: string} = {}): Request {
    const rawBody = JSON.stringify(body);
    const secret = overrides.webhookSecret ?? TEST_WEBHOOK_SECRET;
    const signature = overrides.signature ?? buildSignature(secret, rawBody);

    return new Request('http://localhost/jira/events', {
        method: 'POST',
        body: rawBody,
        headers: {
            'content-type': 'application/json',
            'X-Hub-Signature': signature,
        },
    });
}

function makeApp(overrides: {id?: string; webhookSecret?: string} = {}) {
    return {
        id: overrides.id ?? 'app-1',
        name: 'Test Jira App',
        siteUrl: 'https://test.atlassian.net',
        email: 'test@example.com',
        apiToken: 'test-token',
        webhookSecret: overrides.webhookSecret ?? TEST_WEBHOOK_SECRET,
        connectionStatus: 'connected' as const,
        projects: [],
    };
}

function makeIssueCreatedPayload(overrides: Partial<{issueKey: string; webhookEvent: string; timestamp: number}> = {}) {
    return {
        webhookEvent: overrides.webhookEvent ?? 'jira:issue_created',
        timestamp: overrides.timestamp ?? Date.now(),
        user: {displayName: 'Test User', emailAddress: 'user@example.com'},
        issue: {
            key: overrides.issueKey ?? 'PROJ-123',
            fields: {summary: 'Test Issue'},
        },
    };
}

describe('JiraWebhookHandler', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Body Size 限制', () => {
        it('Payload 超過大小限制回傳 413', async () => {
            const req = new Request('http://localhost/jira/events', {
                method: 'POST',
                body: 'x',
                headers: {
                    'content-type': 'application/json',
                    'content-length': '1000001',
                    'X-Hub-Signature': 'sha256=anything',
                },
            });

            const res = await handleJiraWebhook(req);

            expect(res.status).toBe(413);
        });
    });

    describe('HMAC-SHA256 簽章驗證', () => {
        it('HMAC-SHA256 簽章驗證正確時通過', async () => {
            const app = makeApp();
            asMock(jiraAppStore.list).mockReturnValue([app]);

            const payload = makeIssueCreatedPayload({issueKey: `PROJ-${Date.now()}`});
            const req = makeRequest(payload);

            const res = await handleJiraWebhook(req);

            expect(res.status).toBe(200);
        });

        it('HMAC-SHA256 簽章不正確時拒絕', async () => {
            const app = makeApp();
            asMock(jiraAppStore.list).mockReturnValue([app]);

            const payload = makeIssueCreatedPayload();
            const req = makeRequest(payload, {signature: 'sha256=invalidsignature'});

            const res = await handleJiraWebhook(req);

            expect(res.status).toBe(403);
        });

        it('缺少 X-Hub-Signature header 回傳 403', async () => {
            const payload = makeIssueCreatedPayload();
            const req = new Request('http://localhost/jira/events', {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: {'content-type': 'application/json'},
            });

            const res = await handleJiraWebhook(req);

            expect(res.status).toBe(403);
        });

        it('所有 JiraApp 簽章都不符回傳 403', async () => {
            const app = makeApp({webhookSecret: 'wrong-secret'});
            asMock(jiraAppStore.list).mockReturnValue([app]);

            const payload = makeIssueCreatedPayload();
            const req = makeRequest(payload);

            const res = await handleJiraWebhook(req);

            expect(res.status).toBe(403);
        });
    });

    describe('Payload 解析', () => {
        it('無效 JSON body 在簽名驗證通過後回傳 400', async () => {
            const app = makeApp();
            asMock(jiraAppStore.list).mockReturnValue([app]);

            const rawBody = 'not-json';
            const signature = buildSignature(TEST_WEBHOOK_SECRET, rawBody);

            const req = new Request('http://localhost/jira/events', {
                method: 'POST',
                body: rawBody,
                headers: {
                    'content-type': 'application/json',
                    'X-Hub-Signature': signature,
                },
            });

            const res = await handleJiraWebhook(req);

            expect(res.status).toBe(400);
        });

        it('未知的 webhookEvent 類型回傳 200（忽略）', async () => {
            const app = makeApp();
            asMock(jiraAppStore.list).mockReturnValue([app]);

            const payload = {webhookEvent: 'jira:unknown_event', timestamp: Date.now(), issue: {key: 'PROJ-1'}};
            const req = makeRequest(payload);

            const res = await handleJiraWebhook(req);

            expect(res.status).toBe(200);
            await new Promise((r) => setTimeout(r, 10));
            expect(jiraEventService.handleIssueEvent).not.toHaveBeenCalled();
        });
    });

    describe('Issue 事件處理', () => {
        it('合法 issue_created 事件呼叫 jiraEventService.handleIssueEvent', async () => {
            const app = makeApp();
            asMock(jiraAppStore.list).mockReturnValue([app]);

            const payload = makeIssueCreatedPayload({issueKey: `PROJ-${Date.now()}-handler`});
            const req = makeRequest(payload);

            const res = await handleJiraWebhook(req);

            expect(res.status).toBe(200);
            await new Promise((r) => setTimeout(r, 10));
            expect(jiraEventService.handleIssueEvent).toHaveBeenCalledWith('app-1', 'jira:issue_created', expect.objectContaining({webhookEvent: 'jira:issue_created'}));
        });

        it('重複事件去重回傳 200 但不重複處理', async () => {
            const app = makeApp();
            asMock(jiraAppStore.list).mockReturnValue([app]);

            const payload = makeIssueCreatedPayload({issueKey: 'PROJ-DEDUP-UNIT'});
            const req1 = makeRequest(payload);
            const req2 = makeRequest(payload);

            await handleJiraWebhook(req1);
            await handleJiraWebhook(req2);
            await new Promise((r) => setTimeout(r, 10));

            expect(jiraEventService.handleIssueEvent).toHaveBeenCalledTimes(1);
        });
    });
});
