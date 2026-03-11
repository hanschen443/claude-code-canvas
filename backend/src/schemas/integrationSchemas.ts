import { z } from 'zod';

export const integrationAppListSchema = z.object({
  provider: z.string().optional(),
});

export const integrationAppCreateSchema = z.object({
  provider: z.string().min(1),
  name: z.string().min(1).max(100),
  config: z.record(z.string(), z.unknown()),
});

export const integrationAppDeleteSchema = z.object({
  appId: z.string().uuid(),
});

export const integrationAppGetSchema = z.object({
  appId: z.string().uuid(),
});

export const integrationAppResourcesSchema = z.object({
  appId: z.string().uuid(),
});

export const integrationAppResourcesRefreshSchema = z.object({
  appId: z.string().uuid(),
});

export const podBindIntegrationSchema = z.object({
  canvasId: z.string().uuid(),
  podId: z.string().uuid(),
  appId: z.string().uuid(),
  resourceId: z.string().min(1),
  provider: z.string().min(1),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export const podUnbindIntegrationSchema = z.object({
  canvasId: z.string().uuid(),
  podId: z.string().uuid(),
  provider: z.string().min(1),
});

export type IntegrationAppListPayload = z.infer<typeof integrationAppListSchema>;
export type IntegrationAppCreatePayload = z.infer<typeof integrationAppCreateSchema>;
export type IntegrationAppDeletePayload = z.infer<typeof integrationAppDeleteSchema>;
export type IntegrationAppGetPayload = z.infer<typeof integrationAppGetSchema>;
export type IntegrationAppResourcesPayload = z.infer<typeof integrationAppResourcesSchema>;
export type IntegrationAppResourcesRefreshPayload = z.infer<typeof integrationAppResourcesRefreshSchema>;
export type PodBindIntegrationPayload = z.infer<typeof podBindIntegrationSchema>;
export type PodUnbindIntegrationPayload = z.infer<typeof podUnbindIntegrationSchema>;
