import { WebSocketRequestEvents, WebSocketResponseEvents } from '../../schemas';
import {
    slackAppListSchema,
    slackAppCreateSchema,
    slackAppDeleteSchema,
    slackAppGetSchema,
    slackAppChannelsSchema,
    slackAppChannelsRefreshSchema,
    podBindSlackSchema,
    podUnbindSlackSchema,
} from '../../schemas';
import {
    handleSlackAppCreate,
    handleSlackAppDelete,
    handleSlackAppList,
    handleSlackAppGet,
    handleSlackAppChannels,
    handleSlackAppChannelsRefresh,
    handlePodBindSlack,
    handlePodUnbindSlack,
} from '../slackHandlers.js';
import { createHandlerGroup } from './createHandlerGroup.js';

export const slackHandlerGroup = createHandlerGroup({
    name: 'slack',
    handlers: [
        {
            event: WebSocketRequestEvents.SLACK_APP_CREATE,
            handler: handleSlackAppCreate,
            schema: slackAppCreateSchema,
            responseEvent: WebSocketResponseEvents.SLACK_APP_CREATED,
        },
        {
            event: WebSocketRequestEvents.SLACK_APP_DELETE,
            handler: handleSlackAppDelete,
            schema: slackAppDeleteSchema,
            responseEvent: WebSocketResponseEvents.SLACK_APP_DELETED,
        },
        {
            event: WebSocketRequestEvents.SLACK_APP_LIST,
            handler: handleSlackAppList,
            schema: slackAppListSchema,
            responseEvent: WebSocketResponseEvents.SLACK_APP_LIST_RESULT,
        },
        {
            event: WebSocketRequestEvents.SLACK_APP_GET,
            handler: handleSlackAppGet,
            schema: slackAppGetSchema,
            responseEvent: WebSocketResponseEvents.SLACK_APP_GET_RESULT,
        },
        {
            event: WebSocketRequestEvents.SLACK_APP_CHANNELS,
            handler: handleSlackAppChannels,
            schema: slackAppChannelsSchema,
            responseEvent: WebSocketResponseEvents.SLACK_APP_CHANNELS_RESULT,
        },
        {
            event: WebSocketRequestEvents.SLACK_APP_CHANNELS_REFRESH,
            handler: handleSlackAppChannelsRefresh,
            schema: slackAppChannelsRefreshSchema,
            responseEvent: WebSocketResponseEvents.SLACK_APP_CHANNELS_REFRESHED,
        },
        {
            event: WebSocketRequestEvents.POD_BIND_SLACK,
            handler: handlePodBindSlack,
            schema: podBindSlackSchema,
            responseEvent: WebSocketResponseEvents.POD_SLACK_BOUND,
        },
        {
            event: WebSocketRequestEvents.POD_UNBIND_SLACK,
            handler: handlePodUnbindSlack,
            schema: podUnbindSlackSchema,
            responseEvent: WebSocketResponseEvents.POD_SLACK_UNBOUND,
        },
    ],
});
