import type { IntegrationApp, IntegrationProviderConfig } from '@/types/integration'
import TelegramIcon from '@/components/icons/TelegramIcon.vue'

const CONNECTION_STATUS_CONFIG: IntegrationProviderConfig['connectionStatusConfig'] = {
  connected: { dotClass: 'bg-green-500', bg: 'bg-white', label: '已連接' },
  disconnected: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '已斷線' },
  error: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '錯誤' },
}

function transformApp(rawApp: Record<string, unknown>): IntegrationApp {
  return {
    id: String(rawApp.id ?? ''),
    name: String(rawApp.name ?? ''),
    connectionStatus: (rawApp.connectionStatus as IntegrationApp['connectionStatus']) ?? 'disconnected',
    provider: 'telegram',
    resources: [],
    raw: {
      botUsername: rawApp.botUsername,
    },
  }
}

export const telegramProviderConfig: IntegrationProviderConfig = {
  name: 'telegram',
  label: 'Telegram',
  icon: TelegramIcon,
  description: '管理 Telegram Bot 連線與設定',

  createFormFields: [
    {
      key: 'name',
      label: '名稱',
      placeholder: '例如：My Telegram Bot',
      type: 'text',
      validate: (v) => (v === '' ? '名稱不可為空' : ''),
    },
    {
      key: 'botToken',
      label: 'Bot Token',
      placeholder: '123456:ABC-DEF...',
      type: 'password',
      validate: (v) => (v === '' ? 'Bot Token 不可為空' : ''),
    },
  ],

  resourceLabel: 'User ID',
  emptyResourceHint: '',
  emptyAppHint: '尚未註冊任何 Telegram Bot',

  bindingExtraFields: [],

  hasManualResourceInput: () => true,

  manualResourceInputConfig: {
    label: 'Telegram User ID',
    placeholder: '請輸入 User ID',
    hint: '請輸入 Telegram User ID（可透過 @userinfobot 查詢）',
    validate: (v) => {
      const n = parseInt(v, 10)
      return !v || isNaN(n) || n <= 0 ? 'User ID 必須為正整數' : ''
    },
  },

  connectionStatusConfig: CONNECTION_STATUS_CONFIG,

  transformApp,

  getResources: () => [],

  buildCreatePayload: (formValues) => ({
    name: formValues.name,
    config: {
      botToken: formValues.botToken,
    },
  }),

  buildDeletePayload: (appId) => ({ appId }),

  buildBindPayload: (appId, resourceId) => ({
    appId,
    resourceId,
    extra: { chatType: 'private' },
  }),
}
