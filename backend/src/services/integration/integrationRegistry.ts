import type { IntegrationProvider } from './types.js';

export class IntegrationRegistry {
  private providers: Map<string, IntegrationProvider> = new Map();

  register(provider: IntegrationProvider): void {
    if (this.providers.has(provider.name)) {
      throw new Error(`Integration Provider「${provider.name}」已經註冊過了`);
    }
    this.providers.set(provider.name, provider);
  }

  get(name: string): IntegrationProvider | undefined {
    return this.providers.get(name);
  }

  getOrThrow(name: string): IntegrationProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`找不到 Integration Provider「${name}」`);
    }
    return provider;
  }

  list(): IntegrationProvider[] {
    return Array.from(this.providers.values());
  }

  getWebhookRoutes(): Array<{ path: string; provider: IntegrationProvider }> {
    return Array.from(this.providers.values())
      .filter((p) => p.webhookPath !== undefined)
      .map((p) => ({ path: p.webhookPath as string, provider: p }));
  }
}

export const integrationRegistry = new IntegrationRegistry();
