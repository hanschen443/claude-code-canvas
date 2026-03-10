import {createHmac, timingSafeEqual} from 'crypto';
import {z} from 'zod';
import {jiraAppStore} from './jiraAppStore.js';
import {jiraEventService} from './jiraEventService.js';
import {logger} from '../../utils/logger.js';
import type {JiraApp} from '../../types/index.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_BODY_SIZE = 1_000_000;
const MAX_DEDUP_MAP_SIZE = 10000;

const SUPPORTED_EVENTS = new Set(['jira:issue_created', 'jira:issue_updated', 'jira:issue_deleted']);

const processedEventIds = new Map<string, number>();

const jiraIssueSchema = z.object({
    key: z.string(),
    fields: z.object({
        summary: z.string().optional(),
    }).optional(),
});

const jiraUserSchema = z.object({
    displayName: z.string().optional(),
    emailAddress: z.string().optional(),
});

const jiraChangelogItemSchema = z.object({
    field: z.string(),
    fromString: z.string().nullable().optional(),
    toString: z.string().nullable().optional(),
});

const jiraChangelogSchema = z.object({
    items: z.array(jiraChangelogItemSchema).optional(),
});

const jiraWebhookPayloadSchema = z.object({
    webhookEvent: z.string(),
    timestamp: z.number(),
    user: jiraUserSchema.optional(),
    issue: jiraIssueSchema.optional(),
    changelog: jiraChangelogSchema.optional(),
});

export type JiraWebhookPayload = z.infer<typeof jiraWebhookPayloadSchema>;

function verifyJiraSignature(webhookSecret: string, rawBody: string, signatureHeader: string): boolean {
    const prefix = 'sha256=';
    if (!signatureHeader.startsWith(prefix)) {
        return false;
    }

    const expectedHex = signatureHeader.slice(prefix.length);
    const hmac = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

    try {
        return timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHex, 'hex'));
    } catch {
        return false;
    }
}

function findMatchedApp(rawBody: string, signature: string, apps: JiraApp[]): JiraApp | null {
    return apps.find((app) => verifyJiraSignature(app.webhookSecret, rawBody, signature)) ?? null;
}

function cleanupExpiredEventIds(): void {
    const now = Date.now();
    for (const [id, ts] of processedEventIds.entries()) {
        if (now - ts >= FIVE_MINUTES_MS) {
            processedEventIds.delete(id);
        }
    }
}

function isDuplicateEvent(eventKey: string): boolean {
    cleanupExpiredEventIds();

    if (processedEventIds.has(eventKey)) {
        return true;
    }

    if (processedEventIds.size >= MAX_DEDUP_MAP_SIZE) {
        const firstKey = processedEventIds.keys().next().value;
        if (firstKey) processedEventIds.delete(firstKey);
    }

    processedEventIds.set(eventKey, Date.now());
    return false;
}

export async function handleJiraWebhook(req: Request): Promise<Response> {
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_BODY_SIZE) {
        return new Response('Payload Too Large', {status: 413});
    }

    const rawBody = await req.text();

    if (rawBody.length > MAX_BODY_SIZE) {
        return new Response('Payload Too Large', {status: 413});
    }

    const signatureHeader = req.headers.get('X-Hub-Signature');
    if (!signatureHeader) {
        logger.warn('Jira', 'Error', '缺少 X-Hub-Signature header');
        return new Response('Forbidden', {status: 403});
    }

    const matchedApp = findMatchedApp(rawBody, signatureHeader, jiraAppStore.list());
    if (!matchedApp) {
        logger.warn('Jira', 'Error', 'Jira 簽名驗證失敗');
        return new Response('Forbidden', {status: 403});
    }

    let rawPayload: unknown;
    try {
        rawPayload = JSON.parse(rawBody);
    } catch {
        return new Response('無效的 JSON body', {status: 400});
    }

    const parsed = jiraWebhookPayloadSchema.safeParse(rawPayload);
    if (!parsed.success) {
        logger.warn('Jira', 'Error', `無效的 Webhook payload：${parsed.error.message}`);
        return new Response('OK', {status: 200});
    }

    const webhookPayload = parsed.data;
    const {webhookEvent, timestamp} = webhookPayload;

    if (Date.now() - timestamp > FIVE_MINUTES_MS) {
        logger.warn('Jira', 'Error', `Jira Webhook timestamp 已過期：${timestamp}`);
        return new Response('Forbidden', {status: 403});
    }

    if (!SUPPORTED_EVENTS.has(webhookEvent)) {
        logger.log('Jira', 'Complete', `收到不支援的 Jira 事件類型：${webhookEvent}，略過`);
        return new Response('OK', {status: 200});
    }

    const issueKey = webhookPayload.issue?.key ?? 'unknown';
    const dedupKey = `${webhookEvent}:${issueKey}:${timestamp}`;

    if (isDuplicateEvent(dedupKey)) {
        logger.log('Jira', 'Complete', `重複的事件 ${webhookEvent}:${issueKey}，略過處理`);
        return new Response('OK', {status: 200});
    }

    // Jira 要求快速回應，使用 fire-and-forget 非同步處理
    jiraEventService.handleIssueEvent(matchedApp.id, webhookEvent, webhookPayload).catch((error) => {
        logger.error('Jira', 'Error', `處理 Jira 事件 ${webhookEvent}:${issueKey} 失敗`, error);
    });

    return new Response('OK', {status: 200});
}
