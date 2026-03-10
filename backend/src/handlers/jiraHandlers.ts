import {WebSocketResponseEvents} from '../schemas';
import type {
    JiraAppCreatePayload,
    JiraAppDeletePayload,
    JiraAppGetPayload,
    JiraAppProjectsPayload,
    JiraAppProjectsRefreshPayload,
    PodBindJiraPayload,
    PodUnbindJiraPayload,
} from '../schemas';
import type {JiraApp, SanitizedJiraApp} from '../types/index.js';
import {jiraAppStore} from '../services/jira/jiraAppStore.js';
import {jiraClientManager} from '../services/jira/jiraClientManager.js';
import {podStore} from '../services/podStore.js';
import {socketService} from '../services/socketService.js';
import {emitError, emitNotFound, emitSuccess} from '../utils/websocketResponse.js';
import {logger} from '../utils/logger.js';
import {fireAndForget} from '../utils/operationHelpers.js';
import {emitPodUpdated, handleResultError, getPodDisplayName, validatePod, withCanvasId} from '../utils/handlerHelpers.js';

function sanitizeJiraApp(app: JiraApp): SanitizedJiraApp {
    return {id: app.id, name: app.name, siteUrl: app.siteUrl, email: app.email, connectionStatus: app.connectionStatus, projects: app.projects};
}

function getJiraAppOrEmitError(connectionId: string, jiraAppId: string, responseEvent: WebSocketResponseEvents, requestId: string): JiraApp | null {
    const app = jiraAppStore.getById(jiraAppId);
    if (!app) {
        emitNotFound(connectionId, responseEvent, 'Jira App', jiraAppId, requestId);
        return null;
    }
    return app;
}

export async function handleJiraAppCreate(
    connectionId: string,
    payload: JiraAppCreatePayload,
    requestId: string
): Promise<void> {
    const {name, siteUrl, email, apiToken, webhookSecret} = payload;

    const result = jiraAppStore.create(name, siteUrl, email, apiToken, webhookSecret);
    if (handleResultError(result, connectionId, WebSocketResponseEvents.JIRA_APP_CREATED, requestId, '建立 Jira App 失敗')) return;

    const app = result.data;

    logger.log('Jira', 'Create', `建立 Jira App「${app.name}」`);

    fireAndForget(
        jiraClientManager.initialize(app),
        'Jira',
        `Jira App「${app.name}」初始化失敗`
    );

    socketService.emitToAll(WebSocketResponseEvents.JIRA_APP_CREATED, {
        requestId,
        success: true,
        jiraApp: sanitizeJiraApp(app),
    });
}

export async function handleJiraAppDelete(
    connectionId: string,
    payload: JiraAppDeletePayload,
    requestId: string
): Promise<void> {
    const {jiraAppId} = payload;

    const app = getJiraAppOrEmitError(connectionId, jiraAppId, WebSocketResponseEvents.JIRA_APP_DELETED, requestId);
    if (!app) return;

    jiraClientManager.remove(jiraAppId);

    const boundPods = podStore.findByJiraApp(jiraAppId);
    for (const {canvasId, pod} of boundPods) {
        podStore.setJiraBinding(canvasId, pod.id, null);
        socketService.emitToCanvas(canvasId, WebSocketResponseEvents.POD_JIRA_UNBOUND, {
            canvasId,
            podId: pod.id,
        });
        logger.log('Jira', 'Delete', `清除 Pod「${pod.name}」的 Jira 綁定`);
    }

    jiraAppStore.delete(jiraAppId);

    logger.log('Jira', 'Delete', `已刪除 Jira App「${app.name}」`);

    socketService.emitToAll(WebSocketResponseEvents.JIRA_APP_DELETED, {
        requestId,
        success: true,
        jiraAppId,
    });
}

export async function handleJiraAppList(
    connectionId: string,
    _payload: unknown,
    requestId: string
): Promise<void> {
    const apps = jiraAppStore.list();
    emitSuccess(connectionId, WebSocketResponseEvents.JIRA_APP_LIST_RESULT, {
        requestId,
        success: true,
        jiraApps: apps.map(sanitizeJiraApp),
    });
}

export async function handleJiraAppGet(
    connectionId: string,
    payload: JiraAppGetPayload,
    requestId: string
): Promise<void> {
    const {jiraAppId} = payload;

    const app = getJiraAppOrEmitError(connectionId, jiraAppId, WebSocketResponseEvents.JIRA_APP_GET_RESULT, requestId);
    if (!app) return;

    emitSuccess(connectionId, WebSocketResponseEvents.JIRA_APP_GET_RESULT, {
        requestId,
        success: true,
        jiraApp: sanitizeJiraApp(app),
    });
}

export async function handleJiraAppProjects(
    connectionId: string,
    payload: JiraAppProjectsPayload,
    requestId: string
): Promise<void> {
    const {jiraAppId} = payload;

    const app = getJiraAppOrEmitError(connectionId, jiraAppId, WebSocketResponseEvents.JIRA_APP_PROJECTS_RESULT, requestId);
    if (!app) return;

    emitSuccess(connectionId, WebSocketResponseEvents.JIRA_APP_PROJECTS_RESULT, {
        requestId,
        success: true,
        jiraAppId,
        projects: app.projects,
    });
}

export async function handleJiraAppProjectsRefresh(
    connectionId: string,
    payload: JiraAppProjectsRefreshPayload,
    requestId: string
): Promise<void> {
    const {jiraAppId} = payload;

    const app = getJiraAppOrEmitError(connectionId, jiraAppId, WebSocketResponseEvents.JIRA_APP_PROJECTS_REFRESHED, requestId);
    if (!app) return;

    let projects;
    try {
        projects = await jiraClientManager.refreshProjects(jiraAppId);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        emitError(connectionId, WebSocketResponseEvents.JIRA_APP_PROJECTS_REFRESHED, `重新取得 Projects 失敗：${message}`, requestId);
        return;
    }

    logger.log('Jira', 'Complete', `Jira App「${app.name}」Projects 已重新整理`);

    emitSuccess(connectionId, WebSocketResponseEvents.JIRA_APP_PROJECTS_REFRESHED, {
        requestId,
        success: true,
        jiraAppId,
        projects,
    });
}

export const handlePodBindJira = withCanvasId<PodBindJiraPayload>(
    WebSocketResponseEvents.POD_JIRA_BOUND,
    async (connectionId: string, canvasId: string, payload: PodBindJiraPayload, requestId: string): Promise<void> => {
        const {podId, jiraAppId, jiraProjectKey} = payload;

        const pod = validatePod(connectionId, podId, WebSocketResponseEvents.POD_JIRA_BOUND, requestId);
        if (!pod) return;

        const app = jiraAppStore.getById(jiraAppId);
        if (!app) {
            emitNotFound(connectionId, WebSocketResponseEvents.POD_JIRA_BOUND, 'Jira App', jiraAppId, requestId);
            return;
        }

        if (app.connectionStatus !== 'connected') {
            emitError(connectionId, WebSocketResponseEvents.POD_JIRA_BOUND, `Jira App「${app.name}」尚未連線`, requestId, undefined, 'NOT_CONNECTED');
            return;
        }

        const project = app.projects.find((p) => p.key === jiraProjectKey);
        if (!project) {
            emitNotFound(connectionId, WebSocketResponseEvents.POD_JIRA_BOUND, 'Project', jiraProjectKey, requestId);
            return;
        }

        podStore.setJiraBinding(canvasId, podId, {jiraAppId, jiraProjectKey});

        logger.log('Jira', 'Create', `Pod「${pod.name}」已綁定 Jira App「${app.name}」Project「${project.name}」`);

        emitPodUpdated(canvasId, podId, requestId, WebSocketResponseEvents.POD_JIRA_BOUND);
    }
);

export const handlePodUnbindJira = withCanvasId<PodUnbindJiraPayload>(
    WebSocketResponseEvents.POD_JIRA_UNBOUND,
    async (connectionId: string, canvasId: string, payload: PodUnbindJiraPayload, requestId: string): Promise<void> => {
        const {podId} = payload;

        const pod = validatePod(connectionId, podId, WebSocketResponseEvents.POD_JIRA_UNBOUND, requestId);
        if (!pod) return;

        if (!pod.jiraBinding) {
            emitError(connectionId, WebSocketResponseEvents.POD_JIRA_UNBOUND, `Pod「${getPodDisplayName(canvasId, podId)}」尚未綁定 Jira`, requestId, undefined, 'NOT_BOUND');
            return;
        }

        podStore.setJiraBinding(canvasId, podId, null);

        logger.log('Jira', 'Delete', `Pod「${getPodDisplayName(canvasId, podId)}」已解除 Jira 綁定`);

        emitPodUpdated(canvasId, podId, requestId, WebSocketResponseEvents.POD_JIRA_UNBOUND);
    }
);
