export type IntegrationConnectionStatus = 'connected' | 'disconnected' | 'error';

export interface IntegrationBinding {
  provider: string;
  appId: string;
  resourceId: string;
  extra?: Record<string, unknown>;
}
