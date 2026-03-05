import { defineStore } from 'pinia'
import type { TelegramBot, TelegramBotConnectionStatus, TelegramChat } from '@/types/telegram'
import type { Pod } from '@/types/pod'
import {
    createWebSocketRequest,
    WebSocketRequestEvents,
    WebSocketResponseEvents
} from '@/services/websocket'
import type {
    TelegramBotCreatePayload,
    TelegramBotDeletePayload,
    TelegramBotListPayload,
    PodBindTelegramPayload,
    PodUnbindTelegramPayload,
    TelegramBotCreatedPayload,
    TelegramBotDeletedPayload,
    TelegramBotListResultPayload,
    PodTelegramBoundPayload,
    PodTelegramUnboundPayload
} from '@/types/websocket'
import { useToast } from '@/composables/useToast'
import { useWebSocketErrorHandler } from '@/composables/useWebSocketErrorHandler'
import { useCanvasStore } from '@/stores/canvasStore'

interface TelegramStoreState {
    telegramBots: TelegramBot[]
}

export const useTelegramStore = defineStore('telegram', {
    state: (): TelegramStoreState => ({
        telegramBots: [],
    }),

    getters: {
        getTelegramBotById: (state) => (id: string): TelegramBot | undefined => {
            return state.telegramBots.find((bot) => bot.id === id)
        },

        connectedBots: (state): TelegramBot[] => {
            return state.telegramBots.filter((bot) => bot.connectionStatus === 'connected')
        },

        getTelegramBotForPod: (state) => (pod: Pod): TelegramBot | undefined => {
            if (!pod.telegramBinding) return undefined
            return state.telegramBots.find((bot) => bot.id === pod.telegramBinding!.telegramBotId)
        },
    },

    actions: {
        async loadTelegramBots(): Promise<void> {
            const response = await createWebSocketRequest<TelegramBotListPayload, TelegramBotListResultPayload>({
                requestEvent: WebSocketRequestEvents.TELEGRAM_BOT_LIST,
                responseEvent: WebSocketResponseEvents.TELEGRAM_BOT_LIST_RESULT,
                payload: {}
            })

            if (response.telegramBots) {
                this.telegramBots = response.telegramBots
            }
        },

        async createTelegramBot(name: string, botToken: string): Promise<TelegramBot | null> {
            const { showSuccessToast } = useToast()
            const { withErrorToast } = useWebSocketErrorHandler()

            const response = await withErrorToast(
                createWebSocketRequest<TelegramBotCreatePayload, TelegramBotCreatedPayload>({
                    requestEvent: WebSocketRequestEvents.TELEGRAM_BOT_CREATE,
                    responseEvent: WebSocketResponseEvents.TELEGRAM_BOT_CREATED,
                    payload: {
                        name,
                        botToken
                    }
                }),
                'Telegram',
                '建立失敗'
            )

            if (!response?.telegramBot) return null

            showSuccessToast('Telegram', '建立成功', name)
            return response.telegramBot
        },

        async deleteTelegramBot(telegramBotId: string): Promise<void> {
            const { showSuccessToast } = useToast()
            const { withErrorToast } = useWebSocketErrorHandler()

            const response = await withErrorToast(
                createWebSocketRequest<TelegramBotDeletePayload, TelegramBotDeletedPayload>({
                    requestEvent: WebSocketRequestEvents.TELEGRAM_BOT_DELETE,
                    responseEvent: WebSocketResponseEvents.TELEGRAM_BOT_DELETED,
                    payload: {
                        telegramBotId
                    }
                }),
                'Telegram',
                '刪除失敗'
            )

            if (!response) return

            showSuccessToast('Telegram', '刪除成功')
        },

        async bindTelegramToPod(podId: string, telegramBotId: string, chatId: number, chatType: 'private' | 'group'): Promise<void> {
            const { showErrorToast } = useToast()
            const { withErrorToast } = useWebSocketErrorHandler()
            const canvasStore = useCanvasStore()
            const canvasId = canvasStore.activeCanvasId

            if (!canvasId) {
                showErrorToast('Telegram', '綁定失敗', '尚未選取 Canvas')
                return
            }

            await withErrorToast(
                createWebSocketRequest<PodBindTelegramPayload, PodTelegramBoundPayload>({
                    requestEvent: WebSocketRequestEvents.POD_BIND_TELEGRAM,
                    responseEvent: WebSocketResponseEvents.POD_TELEGRAM_BOUND,
                    payload: {
                        canvasId,
                        podId,
                        telegramBotId,
                        telegramChatId: chatId,
                        chatType
                    }
                }),
                'Telegram',
                '綁定失敗'
            )
        },

        async unbindTelegramFromPod(podId: string): Promise<void> {
            const { showErrorToast } = useToast()
            const { withErrorToast } = useWebSocketErrorHandler()
            const canvasStore = useCanvasStore()
            const canvasId = canvasStore.activeCanvasId

            if (!canvasId) {
                showErrorToast('Telegram', '解除綁定失敗', '尚未選取 Canvas')
                return
            }

            await withErrorToast(
                createWebSocketRequest<PodUnbindTelegramPayload, PodTelegramUnboundPayload>({
                    requestEvent: WebSocketRequestEvents.POD_UNBIND_TELEGRAM,
                    responseEvent: WebSocketResponseEvents.POD_TELEGRAM_UNBOUND,
                    payload: {
                        canvasId,
                        podId
                    }
                }),
                'Telegram',
                '解除綁定失敗'
            )
        },

        addTelegramBotFromEvent(telegramBot: TelegramBot): void {
            this.telegramBots.push(telegramBot)
        },

        removeTelegramBotFromEvent(telegramBotId: string): void {
            this.telegramBots = this.telegramBots.filter((bot) => bot.id !== telegramBotId)
        },

        updateTelegramBotStatus(telegramBotId: string, connectionStatus: TelegramBotConnectionStatus, chats?: TelegramChat[]): void {
            const bot = this.telegramBots.find((b) => b.id === telegramBotId)
            if (!bot) return

            bot.connectionStatus = connectionStatus
            if (chats !== undefined) {
                bot.chats = chats
            }
        },
    },
})
