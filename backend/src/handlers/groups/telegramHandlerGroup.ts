import { WebSocketRequestEvents, WebSocketResponseEvents } from '../../schemas';
import {
    telegramBotListSchema,
    telegramBotCreateSchema,
    telegramBotDeleteSchema,
    telegramBotGetSchema,
    telegramBotChatsSchema,
    podBindTelegramSchema,
    podUnbindTelegramSchema,
} from '../../schemas';
import {
    handleTelegramBotCreate,
    handleTelegramBotDelete,
    handleTelegramBotList,
    handleTelegramBotGet,
    handleTelegramBotChats,
    handlePodBindTelegram,
    handlePodUnbindTelegram,
} from '../telegramHandlers.js';
import { createHandlerGroup } from './createHandlerGroup.js';

export const telegramHandlerGroup = createHandlerGroup({
    name: 'telegram',
    handlers: [
        {
            event: WebSocketRequestEvents.TELEGRAM_BOT_CREATE,
            handler: handleTelegramBotCreate,
            schema: telegramBotCreateSchema,
            responseEvent: WebSocketResponseEvents.TELEGRAM_BOT_CREATED,
        },
        {
            event: WebSocketRequestEvents.TELEGRAM_BOT_DELETE,
            handler: handleTelegramBotDelete,
            schema: telegramBotDeleteSchema,
            responseEvent: WebSocketResponseEvents.TELEGRAM_BOT_DELETED,
        },
        {
            event: WebSocketRequestEvents.TELEGRAM_BOT_LIST,
            handler: handleTelegramBotList,
            schema: telegramBotListSchema,
            responseEvent: WebSocketResponseEvents.TELEGRAM_BOT_LIST_RESULT,
        },
        {
            event: WebSocketRequestEvents.TELEGRAM_BOT_GET,
            handler: handleTelegramBotGet,
            schema: telegramBotGetSchema,
            responseEvent: WebSocketResponseEvents.TELEGRAM_BOT_GET_RESULT,
        },
        {
            event: WebSocketRequestEvents.TELEGRAM_BOT_CHATS,
            handler: handleTelegramBotChats,
            schema: telegramBotChatsSchema,
            responseEvent: WebSocketResponseEvents.TELEGRAM_BOT_CHATS_RESULT,
        },
        {
            event: WebSocketRequestEvents.POD_BIND_TELEGRAM,
            handler: handlePodBindTelegram,
            schema: podBindTelegramSchema,
            responseEvent: WebSocketResponseEvents.POD_TELEGRAM_BOUND,
        },
        {
            event: WebSocketRequestEvents.POD_UNBIND_TELEGRAM,
            handler: handlePodUnbindTelegram,
            schema: podUnbindTelegramSchema,
            responseEvent: WebSocketResponseEvents.POD_TELEGRAM_UNBOUND,
        },
    ],
});
