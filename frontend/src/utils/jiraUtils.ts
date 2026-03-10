import type { JiraApp, JiraAppConnectionStatus } from '@/types/jira'

export const JIRA_CONNECTION_STATUS_CONFIG: Record<JiraAppConnectionStatus, { dotClass: string; bg: string; label: string }> = {
  connected: { dotClass: 'bg-green-500', bg: 'bg-white', label: '已連接' },
  disconnected: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '已斷線' },
  error: { dotClass: 'bg-red-500', bg: 'bg-red-100', label: '錯誤' },
}

export function connectionStatusClass(app: JiraApp): string {
  return JIRA_CONNECTION_STATUS_CONFIG[app.connectionStatus]?.dotClass ?? 'bg-red-500'
}
