import {WebSocketRequestEvents, WebSocketResponseEvents} from '../../schemas';
import {
    jiraAppListSchema,
    jiraAppCreateSchema,
    jiraAppDeleteSchema,
    jiraAppGetSchema,
    jiraAppProjectsSchema,
    jiraAppProjectsRefreshSchema,
    podBindJiraSchema,
    podUnbindJiraSchema,
} from '../../schemas';
import {
    handleJiraAppCreate,
    handleJiraAppDelete,
    handleJiraAppList,
    handleJiraAppGet,
    handleJiraAppProjects,
    handleJiraAppProjectsRefresh,
    handlePodBindJira,
    handlePodUnbindJira,
} from '../jiraHandlers.js';
import {createHandlerGroup} from './createHandlerGroup.js';

export const jiraHandlerGroup = createHandlerGroup({
    name: 'jira',
    handlers: [
        {
            event: WebSocketRequestEvents.JIRA_APP_CREATE,
            handler: handleJiraAppCreate,
            schema: jiraAppCreateSchema,
            responseEvent: WebSocketResponseEvents.JIRA_APP_CREATED,
        },
        {
            event: WebSocketRequestEvents.JIRA_APP_DELETE,
            handler: handleJiraAppDelete,
            schema: jiraAppDeleteSchema,
            responseEvent: WebSocketResponseEvents.JIRA_APP_DELETED,
        },
        {
            event: WebSocketRequestEvents.JIRA_APP_LIST,
            handler: handleJiraAppList,
            schema: jiraAppListSchema,
            responseEvent: WebSocketResponseEvents.JIRA_APP_LIST_RESULT,
        },
        {
            event: WebSocketRequestEvents.JIRA_APP_GET,
            handler: handleJiraAppGet,
            schema: jiraAppGetSchema,
            responseEvent: WebSocketResponseEvents.JIRA_APP_GET_RESULT,
        },
        {
            event: WebSocketRequestEvents.JIRA_APP_PROJECTS,
            handler: handleJiraAppProjects,
            schema: jiraAppProjectsSchema,
            responseEvent: WebSocketResponseEvents.JIRA_APP_PROJECTS_RESULT,
        },
        {
            event: WebSocketRequestEvents.JIRA_APP_PROJECTS_REFRESH,
            handler: handleJiraAppProjectsRefresh,
            schema: jiraAppProjectsRefreshSchema,
            responseEvent: WebSocketResponseEvents.JIRA_APP_PROJECTS_REFRESHED,
        },
        {
            event: WebSocketRequestEvents.POD_BIND_JIRA,
            handler: handlePodBindJira,
            schema: podBindJiraSchema,
            responseEvent: WebSocketResponseEvents.POD_JIRA_BOUND,
        },
        {
            event: WebSocketRequestEvents.POD_UNBIND_JIRA,
            handler: handlePodUnbindJira,
            schema: podUnbindJiraSchema,
            responseEvent: WebSocketResponseEvents.POD_JIRA_UNBOUND,
        },
    ],
});
