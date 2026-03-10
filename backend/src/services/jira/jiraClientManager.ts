import type {JiraApp, JiraProject} from '../../types/index.js';
import {logger} from '../../utils/logger.js';
import {getErrorMessage} from '../../utils/errorHelpers.js';
import {jiraAppStore} from './jiraAppStore.js';
import {socketService} from '../socketService.js';
import {WebSocketResponseEvents} from '../../schemas/events.js';

interface JiraClientInfo {
    authHeader: string;
    siteUrl: string;
}

class JiraClientManager {
    private clients: Map<string, JiraClientInfo> = new Map();

    async initialize(jiraApp: JiraApp): Promise<void> {
        const authHeader = `Basic ${Buffer.from(`${jiraApp.email}:${jiraApp.apiToken}`).toString('base64')}`;

        try {
            const res = await fetch(`${jiraApp.siteUrl}/rest/api/3/myself`, {
                headers: {Authorization: authHeader, Accept: 'application/json'},
            });

            if (!res.ok) {
                throw new Error(`API 驗證失敗，狀態碼：${res.status}`);
            }
        } catch (error) {
            logger.error('Jira', 'Error', `Jira App ${jiraApp.id} 初始化失敗：${getErrorMessage(error)}`);
            jiraAppStore.updateStatus(jiraApp.id, 'error');
            this.broadcastConnectionStatus(jiraApp.id);
            return;
        }

        this.clients.set(jiraApp.id, {authHeader, siteUrl: jiraApp.siteUrl});

        try {
            await this.fetchProjects(jiraApp, authHeader);
        } catch (error) {
            logger.warn('Jira', 'Warn', `Jira App ${jiraApp.id} 取得 Projects 失敗，繼續初始化：${getErrorMessage(error)}`);
        }

        jiraAppStore.updateStatus(jiraApp.id, 'connected');
        this.broadcastConnectionStatus(jiraApp.id);

        logger.log('Jira', 'Complete', `Jira App ${jiraApp.id} 初始化成功`);
    }

    remove(jiraAppId: string): void {
        this.clients.delete(jiraAppId);
        jiraAppStore.updateStatus(jiraAppId, 'disconnected');
        this.broadcastConnectionStatus(jiraAppId);
        logger.log('Jira', 'Complete', `Jira App ${jiraAppId} 已移除`);
    }

    async refreshProjects(jiraAppId: string): Promise<JiraProject[]> {
        const client = this.clients.get(jiraAppId);
        if (!client) {
            throw new Error(`Jira App ${jiraAppId} 尚未初始化`);
        }

        const jiraApp = jiraAppStore.getById(jiraAppId);
        if (!jiraApp) {
            throw new Error(`找不到 Jira App ${jiraAppId}`);
        }

        return this.fetchProjects(jiraApp, client.authHeader);
    }

    destroyAll(): void {
        this.clients.clear();
        logger.log('Jira', 'Complete', '已清除所有 Jira Client');
    }

    private async fetchProjects(jiraApp: JiraApp, authHeader: string): Promise<JiraProject[]> {
        const res = await fetch(`${jiraApp.siteUrl}/rest/api/3/project`, {
            headers: {Authorization: authHeader, Accept: 'application/json'},
        });

        if (!res.ok) {
            throw new Error(`取得 Projects 失敗，狀態碼：${res.status}`);
        }

        const data = await res.json() as Array<{key: string; name: string}>;
        const projects: JiraProject[] = data.map((p) => ({key: p.key, name: p.name}));

        jiraAppStore.updateProjects(jiraApp.id, projects);
        logger.log('Jira', 'Complete', `Jira App ${jiraApp.id} 取得 ${projects.length} 個 Projects`);

        return projects;
    }

    private broadcastConnectionStatus(jiraAppId: string): void {
        const jiraApp = jiraAppStore.getById(jiraAppId);
        if (!jiraApp) {
            return;
        }

        socketService.emitToAll(WebSocketResponseEvents.JIRA_CONNECTION_STATUS_CHANGED, {
            jiraAppId,
            connectionStatus: jiraApp.connectionStatus,
            projects: jiraApp.projects,
        });
    }
}

export const jiraClientManager = new JiraClientManager();
