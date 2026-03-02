import { defineStore } from 'pinia'
import type { SlackApp, SlackAppConnectionStatus, SlackChannel } from '@/types/slack'
import type { Pod } from '@/types/pod'
import {
    createWebSocketRequest,
    WebSocketRequestEvents,
    WebSocketResponseEvents
} from '@/services/websocket'
import type {
    SlackAppCreatePayload,
    SlackAppDeletePayload,
    SlackAppListPayload,
    PodBindSlackPayload,
    PodUnbindSlackPayload
} from '@/types/websocket'
import type {
    SlackAppCreatedPayload,
    SlackAppDeletedPayload,
    SlackAppListResultPayload,
    PodSlackBoundPayload,
    PodSlackUnboundPayload
} from '@/types/websocket'
import { useToast } from '@/composables/useToast'
import { sanitizeErrorForUser } from '@/utils/errorSanitizer'
import { useCanvasStore } from '@/stores/canvasStore'

interface SlackStoreState {
    slackApps: SlackApp[]
}

export const useSlackStore = defineStore('slack', {
    state: (): SlackStoreState => ({
        slackApps: [],
    }),

    getters: {
        getSlackAppById: (state) => (id: string): SlackApp | undefined => {
            return state.slackApps.find((app) => app.id === id)
        },

        connectedApps: (state): SlackApp[] => {
            return state.slackApps.filter((app) => app.connectionStatus === 'connected')
        },

        getSlackAppForPod: (state) => (pod: Pod): SlackApp | undefined => {
            if (!pod.slackBinding) return undefined
            return state.slackApps.find((app) => app.id === pod.slackBinding!.slackAppId)
        },
    },

    actions: {
        async loadSlackApps(): Promise<void> {
            const response = await createWebSocketRequest<SlackAppListPayload, SlackAppListResultPayload>({
                requestEvent: WebSocketRequestEvents.SLACK_APP_LIST,
                responseEvent: WebSocketResponseEvents.SLACK_APP_LIST_RESULT,
                payload: {}
            })

            if (response.slackApps) {
                this.slackApps = response.slackApps
            }
        },

        async createSlackApp(name: string, botToken: string, appToken: string): Promise<SlackApp | null> {
            const { showSuccessToast, showErrorToast } = useToast()

            try {
                const response = await createWebSocketRequest<SlackAppCreatePayload, SlackAppCreatedPayload>({
                    requestEvent: WebSocketRequestEvents.SLACK_APP_CREATE,
                    responseEvent: WebSocketResponseEvents.SLACK_APP_CREATED,
                    payload: {
                        name,
                        botToken,
                        appToken
                    }
                })

                if (!response.slackApp) return null

                showSuccessToast('Slack', '建立成功', name)
                return response.slackApp
            } catch (error) {
                const message = sanitizeErrorForUser(error)
                showErrorToast('Slack', '建立失敗', message)
                return null
            }
        },

        async deleteSlackApp(slackAppId: string): Promise<void> {
            const { showSuccessToast, showErrorToast } = useToast()

            try {
                await createWebSocketRequest<SlackAppDeletePayload, SlackAppDeletedPayload>({
                    requestEvent: WebSocketRequestEvents.SLACK_APP_DELETE,
                    responseEvent: WebSocketResponseEvents.SLACK_APP_DELETED,
                    payload: {
                        slackAppId
                    }
                })

                showSuccessToast('Slack', '刪除成功')
            } catch (error) {
                const message = sanitizeErrorForUser(error)
                showErrorToast('Slack', '刪除失敗', message)
            }
        },

        async bindSlackToPod(podId: string, slackAppId: string, channelId: string): Promise<void> {
            const { showErrorToast } = useToast()
            const canvasStore = useCanvasStore()
            const canvasId = canvasStore.activeCanvasId

            if (!canvasId) {
                showErrorToast('Slack', '綁定失敗', '尚未選取 Canvas')
                return
            }

            try {
                await createWebSocketRequest<PodBindSlackPayload, PodSlackBoundPayload>({
                    requestEvent: WebSocketRequestEvents.POD_BIND_SLACK,
                    responseEvent: WebSocketResponseEvents.POD_SLACK_BOUND,
                    payload: {
                        canvasId,
                        podId,
                        slackAppId,
                        slackChannelId: channelId
                    }
                })
            } catch (error) {
                const message = sanitizeErrorForUser(error)
                showErrorToast('Slack', '綁定失敗', message)
            }
        },

        async unbindSlackFromPod(podId: string): Promise<void> {
            const { showErrorToast } = useToast()
            const canvasStore = useCanvasStore()
            const canvasId = canvasStore.activeCanvasId

            if (!canvasId) {
                showErrorToast('Slack', '解除綁定失敗', '尚未選取 Canvas')
                return
            }

            try {
                await createWebSocketRequest<PodUnbindSlackPayload, PodSlackUnboundPayload>({
                    requestEvent: WebSocketRequestEvents.POD_UNBIND_SLACK,
                    responseEvent: WebSocketResponseEvents.POD_SLACK_UNBOUND,
                    payload: {
                        canvasId,
                        podId
                    }
                })
            } catch (error) {
                const message = sanitizeErrorForUser(error)
                showErrorToast('Slack', '解除綁定失敗', message)
            }
        },

        addSlackAppFromEvent(slackApp: SlackApp): void {
            this.slackApps.push(slackApp)
        },

        removeSlackAppFromEvent(slackAppId: string): void {
            this.slackApps = this.slackApps.filter((app) => app.id !== slackAppId)
        },

        updateSlackAppStatus(slackAppId: string, connectionStatus: SlackAppConnectionStatus, channels?: SlackChannel[]): void {
            const app = this.slackApps.find((a) => a.id === slackAppId)
            if (!app) return

            app.connectionStatus = connectionStatus
            if (channels !== undefined) {
                app.channels = channels
            }
        },
    },
})
