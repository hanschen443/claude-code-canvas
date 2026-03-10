// 注意：後端會 sanitize 敏感欄位（apiToken、webhookSecret），前端的 JiraApp 只包含去敏感化後的欄位
export type JiraAppConnectionStatus = 'connected' | 'disconnected' | 'error'

export interface JiraProject {
  key: string
  name: string
}

export interface JiraApp {
  id: string
  name: string
  siteUrl: string
  email: string
  connectionStatus: JiraAppConnectionStatus
  projects: JiraProject[]
}

export interface PodJiraBinding {
  jiraAppId: string
  jiraProjectKey: string
}
