import { z } from 'zod';

const PRIVATE_IP_PATTERN = /^(127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|localhost)/i;

function isPrivateUrl(url: string): boolean {
    try {
        const {hostname} = new URL(url);
        return PRIVATE_IP_PATTERN.test(hostname) || isPrivate172Range(hostname);
    } catch {
        return false;
    }
}

function isPrivate172Range(hostname: string): boolean {
    const match = hostname.match(/^172\.(\d+)\./);
    if (!match) return false;
    const second = parseInt(match[1], 10);
    return second >= 16 && second <= 31;
}

export const jiraAppListSchema = z.object({});

export const jiraAppCreateSchema = z.object({
  name: z.string().min(1).max(100),
  siteUrl: z
    .string()
    .url('siteUrl 必須為合法 URL')
    .refine((url) => url.startsWith('https://'), 'siteUrl 必須使用 https://')
    .refine((url) => !isPrivateUrl(url), 'siteUrl 不可指向私有 IP 或 localhost')
    .transform((url) => url.replace(/\/$/, '')),
  email: z.string().email('email 格式不正確'),
  apiToken: z.string().min(1),
  webhookSecret: z.string().min(1),
});

const jiraAppIdOnlySchema = z.object({
  jiraAppId: z.string().uuid(),
});

export const jiraAppDeleteSchema = jiraAppIdOnlySchema;
export const jiraAppGetSchema = jiraAppIdOnlySchema;
export const jiraAppProjectsSchema = jiraAppIdOnlySchema;
export const jiraAppProjectsRefreshSchema = jiraAppIdOnlySchema;

export const podBindJiraSchema = z.object({
  canvasId: z.string().uuid(),
  podId: z.string().uuid(),
  jiraAppId: z.string().uuid(),
  jiraProjectKey: z.string().min(1),
});

export const podUnbindJiraSchema = z.object({
  canvasId: z.string().uuid(),
  podId: z.string().uuid(),
});

export type JiraAppListPayload = z.infer<typeof jiraAppListSchema>;
export type JiraAppCreatePayload = z.infer<typeof jiraAppCreateSchema>;
export type JiraAppDeletePayload = z.infer<typeof jiraAppDeleteSchema>;
export type JiraAppGetPayload = z.infer<typeof jiraAppGetSchema>;
export type JiraAppProjectsPayload = z.infer<typeof jiraAppProjectsSchema>;
export type JiraAppProjectsRefreshPayload = z.infer<typeof jiraAppProjectsRefreshSchema>;
export type PodBindJiraPayload = z.infer<typeof podBindJiraSchema>;
export type PodUnbindJiraPayload = z.infer<typeof podUnbindJiraSchema>;
