import {WebSocketRequestEvents, WebSocketResponseEvents} from '../../schemas';
import {
    integrationAppListSchema,
    integrationAppCreateSchema,
    integrationAppDeleteSchema,
    integrationAppGetSchema,
    integrationAppResourcesSchema,
    integrationAppResourcesRefreshSchema,
    podBindIntegrationSchema,
    podUnbindIntegrationSchema,
} from '../../schemas';
import {
    handleIntegrationAppCreate,
    handleIntegrationAppDelete,
    handleIntegrationAppList,
    handleIntegrationAppGet,
    handleIntegrationAppResources,
    handleIntegrationAppResourcesRefresh,
    handlePodBindIntegration,
    handlePodUnbindIntegration,
} from '../integrationHandlers.js';
import {createHandlerGroup} from './createHandlerGroup.js';

export const integrationHandlerGroup = createHandlerGroup({
    name: 'integration',
    handlers: [
        {
            event: WebSocketRequestEvents.INTEGRATION_APP_CREATE,
            handler: handleIntegrationAppCreate,
            schema: integrationAppCreateSchema,
            responseEvent: WebSocketResponseEvents.INTEGRATION_APP_CREATED,
        },
        {
            event: WebSocketRequestEvents.INTEGRATION_APP_DELETE,
            handler: handleIntegrationAppDelete,
            schema: integrationAppDeleteSchema,
            responseEvent: WebSocketResponseEvents.INTEGRATION_APP_DELETED,
        },
        {
            event: WebSocketRequestEvents.INTEGRATION_APP_LIST,
            handler: handleIntegrationAppList,
            schema: integrationAppListSchema,
            responseEvent: WebSocketResponseEvents.INTEGRATION_APP_LIST_RESULT,
        },
        {
            event: WebSocketRequestEvents.INTEGRATION_APP_GET,
            handler: handleIntegrationAppGet,
            schema: integrationAppGetSchema,
            responseEvent: WebSocketResponseEvents.INTEGRATION_APP_GET_RESULT,
        },
        {
            event: WebSocketRequestEvents.INTEGRATION_APP_RESOURCES,
            handler: handleIntegrationAppResources,
            schema: integrationAppResourcesSchema,
            responseEvent: WebSocketResponseEvents.INTEGRATION_APP_RESOURCES_RESULT,
        },
        {
            event: WebSocketRequestEvents.INTEGRATION_APP_RESOURCES_REFRESH,
            handler: handleIntegrationAppResourcesRefresh,
            schema: integrationAppResourcesRefreshSchema,
            responseEvent: WebSocketResponseEvents.INTEGRATION_APP_RESOURCES_REFRESHED,
        },
        {
            event: WebSocketRequestEvents.POD_BIND_INTEGRATION,
            handler: handlePodBindIntegration,
            schema: podBindIntegrationSchema,
            responseEvent: WebSocketResponseEvents.POD_INTEGRATION_BOUND,
        },
        {
            event: WebSocketRequestEvents.POD_UNBIND_INTEGRATION,
            handler: handlePodUnbindIntegration,
            schema: podUnbindIntegrationSchema,
            responseEvent: WebSocketResponseEvents.POD_INTEGRATION_UNBOUND,
        },
    ],
});
