export type JiraAppConnectionStatus = 'connected' | 'disconnected' | 'error';

export interface JiraProject {
  key: string;
  name: string;
}

export interface JiraApp {
  id: string;
  name: string;
  siteUrl: string;
  email: string;
  apiToken: string;
  webhookSecret: string;
  connectionStatus: JiraAppConnectionStatus;
  projects: JiraProject[];
}

export interface PodJiraBinding {
  jiraAppId: string;
  jiraProjectKey: string;
}

export interface JiraMessage {
  id: string;
  jiraAppId: string;
  projectKey: string;
  issueKey: string;
  eventType: string;
  userName: string;
  text: string;
}

export interface JiraChangelogItem {
  field: string;
  fromString?: string | null;
  toString?: string | null;
}

export interface JiraWebhookPayloadLite {
  webhookEvent: string;
  timestamp: number;
  user?: {displayName?: string; emailAddress?: string};
  issue?: {key: string; fields?: {summary?: string}};
  changelog?: {items?: JiraChangelogItem[]};
}

export type SanitizedJiraApp = Omit<JiraApp, 'apiToken' | 'webhookSecret'>;

export interface JiraAppCreatedResponse {
  jiraApp: SanitizedJiraApp;
}

export interface JiraAppDeletedResponse {
  jiraAppId: string;
}
