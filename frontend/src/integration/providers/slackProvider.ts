import type { IntegrationApp, IntegrationProviderConfig, IntegrationResource } from '@/types/integration'
import SlackIcon from '@/components/icons/SlackIcon.vue'

const CONNECTION_STATUS_CONFIG: IntegrationProviderConfig['connectionStatusConfig'] = {
  connected: { dotClass: 'bg-green-500', bg: 'bg-white', label: '已連接' },
  disconnected: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '已斷線' },
  error: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '錯誤' },
}

function transformApp(rawApp: Record<string, unknown>): IntegrationApp {
  const rawResources = (rawApp.resources as Array<{ id: string; name: string }> | undefined) ?? []
  const resources: IntegrationResource[] = rawResources.map((r) => ({
    id: r.id,
    label: '#' + r.name,
  }))

  return {
    id: String(rawApp.id ?? ''),
    name: String(rawApp.name ?? ''),
    connectionStatus: (rawApp.connectionStatus as IntegrationApp['connectionStatus']) ?? 'disconnected',
    provider: 'slack',
    resources,
    raw: rawApp,
  }
}

export const slackProviderConfig: IntegrationProviderConfig = {
  name: 'slack',
  label: 'Slack',
  icon: SlackIcon,
  description: '管理 Slack App 連線與設定',

  createFormFields: [
    {
      key: 'name',
      label: '名稱',
      placeholder: '例如：My Slack Bot',
      type: 'text',
      validate: (v) => (v === '' ? '名稱不可為空' : ''),
    },
    {
      key: 'botToken',
      label: 'Bot Token',
      placeholder: 'xoxb-...',
      type: 'password',
      validate: (v): string => {
        if (v === '') return 'Bot Token 不可為空'
        if (!v.startsWith('xoxb-')) return 'Bot Token 必須以 xoxb- 開頭'
        return ''
      },
    },
    {
      key: 'signingSecret',
      label: 'Signing Secret',
      placeholder: 'Signing Secret',
      type: 'password',
      validate: (v) => (v === '' ? 'Signing Secret 不可為空' : ''),
    },
  ],

  resourceLabel: '頻道',
  emptyResourceHint: '此 App 尚無可用頻道',
  emptyAppHint: '尚未註冊任何 Slack App',
  bindingExtraFields: undefined,

  connectionStatusConfig: CONNECTION_STATUS_CONFIG,

  transformApp,

  getResources: (app) => app.resources,

  buildCreatePayload: (formValues) => ({
    name: formValues.name,
    config: {
      botToken: formValues.botToken,
      signingSecret: formValues.signingSecret,
    },
  }),

  buildDeletePayload: (appId) => ({ appId }),

  buildBindPayload: (appId, resourceId) => ({ appId, resourceId }),
}
