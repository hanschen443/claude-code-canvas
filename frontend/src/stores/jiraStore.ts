import { defineStore } from 'pinia'
import type { JiraApp, JiraAppConnectionStatus, JiraProject } from '@/types/jira'
import type { Pod } from '@/types/pod'
import {
    createWebSocketRequest,
    WebSocketRequestEvents,
    WebSocketResponseEvents
} from '@/services/websocket'
import type {
    JiraAppCreatePayload,
    JiraAppDeletePayload,
    JiraAppListPayload,
    PodBindJiraPayload,
    PodUnbindJiraPayload,
} from '@/types/websocket/requests'
import type {
    JiraAppCreatedPayload,
    JiraAppDeletedPayload,
    JiraAppListResultPayload,
    PodJiraBoundPayload,
    PodJiraUnboundPayload,
} from '@/types/websocket/responses'
import { useToast } from '@/composables/useToast'
import { useWebSocketErrorHandler } from '@/composables/useWebSocketErrorHandler'
import { useCanvasStore } from '@/stores/canvasStore'

interface JiraStoreState {
    jiraApps: JiraApp[]
}

export const useJiraStore = defineStore('jira', {
    state: (): JiraStoreState => ({
        jiraApps: [],
    }),

    getters: {
        getJiraAppById: (state) => (id: string): JiraApp | undefined => {
            return state.jiraApps.find((app) => app.id === id)
        },

        connectedApps: (state): JiraApp[] => {
            return state.jiraApps.filter((app) => app.connectionStatus === 'connected')
        },

        getJiraAppForPod: (state) => (pod: Pod): JiraApp | undefined => {
            if (!pod.jiraBinding) return undefined
            return state.jiraApps.find((app) => app.id === pod.jiraBinding!.jiraAppId)
        },
    },

    actions: {
        async loadJiraApps(): Promise<void> {
            const response = await createWebSocketRequest<JiraAppListPayload, JiraAppListResultPayload>({
                requestEvent: WebSocketRequestEvents.JIRA_APP_LIST,
                responseEvent: WebSocketResponseEvents.JIRA_APP_LIST_RESULT,
                payload: {}
            })

            if (response.jiraApps) {
                this.jiraApps = response.jiraApps
            }
        },

        async createJiraApp(
            name: string,
            siteUrl: string,
            email: string,
            apiToken: string,
            webhookSecret: string
        ): Promise<JiraApp | null> {
            const { showSuccessToast } = useToast()
            const { withErrorToast } = useWebSocketErrorHandler()

            const response = await withErrorToast(
                createWebSocketRequest<JiraAppCreatePayload, JiraAppCreatedPayload>({
                    requestEvent: WebSocketRequestEvents.JIRA_APP_CREATE,
                    responseEvent: WebSocketResponseEvents.JIRA_APP_CREATED,
                    payload: {
                        name,
                        siteUrl,
                        email,
                        apiToken,
                        webhookSecret
                    }
                }),
                'Jira',
                '建立失敗'
            )

            if (!response?.jiraApp) return null

            showSuccessToast('Jira', '建立成功', name)
            return response.jiraApp
        },

        async deleteJiraApp(jiraAppId: string): Promise<void> {
            const { showSuccessToast } = useToast()
            const { withErrorToast } = useWebSocketErrorHandler()

            const response = await withErrorToast(
                createWebSocketRequest<JiraAppDeletePayload, JiraAppDeletedPayload>({
                    requestEvent: WebSocketRequestEvents.JIRA_APP_DELETE,
                    responseEvent: WebSocketResponseEvents.JIRA_APP_DELETED,
                    payload: {
                        jiraAppId
                    }
                }),
                'Jira',
                '刪除失敗'
            )

            if (!response) return

            showSuccessToast('Jira', '刪除成功')
        },

        async bindJiraToPod(podId: string, jiraAppId: string, jiraProjectKey: string): Promise<void> {
            const { showErrorToast } = useToast()
            const { withErrorToast } = useWebSocketErrorHandler()
            const canvasStore = useCanvasStore()
            const canvasId = canvasStore.activeCanvasId

            if (!canvasId) {
                showErrorToast('Jira', '綁定失敗', '尚未選取 Canvas')
                return
            }

            await withErrorToast(
                createWebSocketRequest<PodBindJiraPayload, PodJiraBoundPayload>({
                    requestEvent: WebSocketRequestEvents.POD_BIND_JIRA,
                    responseEvent: WebSocketResponseEvents.POD_JIRA_BOUND,
                    payload: {
                        canvasId,
                        podId,
                        jiraAppId,
                        jiraProjectKey
                    }
                }),
                'Jira',
                '綁定失敗'
            )
        },

        async unbindJiraFromPod(podId: string): Promise<void> {
            const { showErrorToast } = useToast()
            const { withErrorToast } = useWebSocketErrorHandler()
            const canvasStore = useCanvasStore()
            const canvasId = canvasStore.activeCanvasId

            if (!canvasId) {
                showErrorToast('Jira', '解除綁定失敗', '尚未選取 Canvas')
                return
            }

            await withErrorToast(
                createWebSocketRequest<PodUnbindJiraPayload, PodJiraUnboundPayload>({
                    requestEvent: WebSocketRequestEvents.POD_UNBIND_JIRA,
                    responseEvent: WebSocketResponseEvents.POD_JIRA_UNBOUND,
                    payload: {
                        canvasId,
                        podId
                    }
                }),
                'Jira',
                '解除綁定失敗'
            )
        },

        addJiraAppFromEvent(jiraApp: JiraApp): void {
            this.jiraApps.push(jiraApp)
        },

        removeJiraAppFromEvent(jiraAppId: string): void {
            this.jiraApps = this.jiraApps.filter((app) => app.id !== jiraAppId)
        },

        updateJiraAppStatus(jiraAppId: string, connectionStatus: JiraAppConnectionStatus, projects?: JiraProject[]): void {
            const app = this.jiraApps.find((a) => a.id === jiraAppId)
            if (!app) return

            app.connectionStatus = connectionStatus
            if (projects !== undefined) {
                app.projects = projects
            }
        },
    },
})
