import { integrationRegistry } from './integrationRegistry.js';
import type { IntegrationProvider } from './types.js';

let webhookRoutes: Map<string, IntegrationProvider> | null = null;

export function buildWebhookRoutes(): Map<string, IntegrationProvider> {
  if (webhookRoutes) return webhookRoutes;

  webhookRoutes = new Map();
  for (const { path, provider } of integrationRegistry.getWebhookRoutes()) {
    webhookRoutes.set(path, provider);
  }

  return webhookRoutes;
}

export async function handleIntegrationWebhook(req: Request, pathname: string): Promise<Response | null> {
  const routes = buildWebhookRoutes();
  const provider = routes.get(pathname);

  if (!provider || !provider.handleWebhookRequest) return null;

  return provider.handleWebhookRequest(req);
}
