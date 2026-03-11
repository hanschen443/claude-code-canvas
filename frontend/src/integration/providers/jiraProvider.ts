import type { IntegrationApp, IntegrationProviderConfig, IntegrationResource } from '@/types/integration'
import JiraIcon from '@/components/icons/JiraIcon.vue'

const CONNECTION_STATUS_CONFIG: IntegrationProviderConfig['connectionStatusConfig'] = {
  connected: { dotClass: 'bg-green-500', bg: 'bg-white', label: '已連接' },
  disconnected: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '已斷線' },
  error: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '錯誤' },
}

function transformApp(rawApp: Record<string, unknown>): IntegrationApp {
  const rawResources = (rawApp.resources as Array<{ id: string; name: string }> | undefined) ?? []
  const resources: IntegrationResource[] = rawResources.map((r) => ({
    id: r.id,
    label: r.id + ' - ' + r.name,
  }))

  return {
    id: String(rawApp.id ?? ''),
    name: String(rawApp.name ?? ''),
    connectionStatus: (rawApp.connectionStatus as IntegrationApp['connectionStatus']) ?? 'disconnected',
    provider: 'jira',
    resources,
    raw: rawApp,
  }
}

export const jiraProviderConfig: IntegrationProviderConfig = {
  name: 'jira',
  label: 'Jira',
  icon: JiraIcon,
  description: '管理 Jira App 連線與設定',

  createFormFields: [
    {
      key: 'name',
      label: '名稱',
      placeholder: '例如：My Jira App',
      type: 'text',
      validate: (v) => (v === '' ? '名稱不可為空' : ''),
    },
    {
      key: 'siteUrl',
      label: 'Site URL',
      placeholder: 'https://your-domain.atlassian.net',
      type: 'text',
      validate: (v): string => {
        if (v === '') return 'Site URL 不可為空'
        if (!v.startsWith('https://')) return 'Site URL 必須以 https:// 開頭'
        return ''
      },
    },
    {
      key: 'email',
      label: 'Email',
      placeholder: 'your-email@example.com',
      type: 'text',
      validate: (v) => (v === '' ? 'Email 不可為空' : ''),
    },
    {
      key: 'apiToken',
      label: 'API Token',
      placeholder: 'Jira API Token',
      type: 'password',
      validate: (v) => (v === '' ? 'API Token 不可為空' : ''),
    },
    {
      key: 'webhookSecret',
      label: 'Webhook Secret',
      placeholder: 'Webhook Secret',
      type: 'password',
      validate: (v) => (v === '' ? 'Webhook Secret 不可為空' : ''),
    },
  ],

  resourceLabel: 'Project',
  emptyResourceHint: '此 App 尚無可用 Project',
  emptyAppHint: '尚未註冊任何 Jira App',
  bindingExtraFields: undefined,

  connectionStatusConfig: CONNECTION_STATUS_CONFIG,

  transformApp,

  getResources: (app) => app.resources,

  buildCreatePayload: (formValues) => ({
    name: formValues.name,
    config: {
      siteUrl: formValues.siteUrl,
      email: formValues.email,
      apiToken: formValues.apiToken,
      webhookSecret: formValues.webhookSecret,
    },
  }),

  buildDeletePayload: (appId) => ({ appId }),

  buildBindPayload: (appId, resourceId) => ({ appId, resourceId }),
}
