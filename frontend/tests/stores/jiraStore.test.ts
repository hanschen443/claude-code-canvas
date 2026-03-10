import { describe, it, expect, vi } from 'vitest'
import { webSocketMockFactory, mockCreateWebSocketRequest } from '../helpers/mockWebSocket'
import { setupStoreTest, mockErrorSanitizerFactory } from '../helpers/testSetup'
import { createMockPod } from '../helpers/factories'
import { useJiraStore } from '@/stores/jiraStore'
import { useCanvasStore } from '@/stores/canvasStore'
import type { JiraApp } from '@/types/jira'

vi.mock('@/services/websocket', () => webSocketMockFactory())

const mockShowSuccessToast = vi.fn()
const mockShowErrorToast = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    showSuccessToast: mockShowSuccessToast,
    showErrorToast: mockShowErrorToast,
  }),
}))

vi.mock('@/utils/errorSanitizer', () => mockErrorSanitizerFactory())

function createMockJiraApp(overrides?: Partial<JiraApp>): JiraApp {
  return {
    id: 'jira-app-1',
    name: 'Test Jira App',
    siteUrl: 'https://test.atlassian.net',
    email: 'test@example.com',
    connectionStatus: 'disconnected',
    projects: [],
    ...overrides,
  }
}

describe('jiraStore', () => {
  setupStoreTest()

  describe('loadJiraApps', () => {
    it('應透過 WebSocket 載入 Jira Apps 清單並寫入 state', async () => {
      const store = useJiraStore()
      const apps = [createMockJiraApp({ id: 'app-1' }), createMockJiraApp({ id: 'app-2' })]

      mockCreateWebSocketRequest.mockResolvedValueOnce({ jiraApps: apps })

      await store.loadJiraApps()

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'jira:app:list',
        responseEvent: 'jira:app:list:result',
        payload: {},
      })
      expect(store.jiraApps).toEqual(apps)
    })

    it('回應無 jiraApps 時 jiraApps 應保持原樣', async () => {
      const store = useJiraStore()
      const existingApp = createMockJiraApp({ id: 'existing' })
      store.jiraApps = [existingApp]

      mockCreateWebSocketRequest.mockResolvedValueOnce({})

      await store.loadJiraApps()

      expect(store.jiraApps).toEqual([existingApp])
    })
  })

  describe('createJiraApp', () => {
    it('應發送建立請求並回傳建立的 JiraApp', async () => {
      const store = useJiraStore()
      const newApp = createMockJiraApp({ id: 'new-app', name: 'My Jira App' })

      mockCreateWebSocketRequest.mockResolvedValueOnce({ jiraApp: newApp })

      const result = await store.createJiraApp(
        'My Jira App',
        'https://test.atlassian.net',
        'test@example.com',
        'api-token',
        'webhook-secret'
      )

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'jira:app:create',
        responseEvent: 'jira:app:created',
        payload: {
          name: 'My Jira App',
          siteUrl: 'https://test.atlassian.net',
          email: 'test@example.com',
          apiToken: 'api-token',
          webhookSecret: 'webhook-secret',
        },
      })
      expect(mockShowSuccessToast).toHaveBeenCalledWith('Jira', '建立成功', 'My Jira App')
      expect(result).toEqual(newApp)
    })

    it('建立失敗時應回傳 null', async () => {
      const store = useJiraStore()

      mockCreateWebSocketRequest.mockResolvedValueOnce({})

      const result = await store.createJiraApp(
        'My Jira App',
        'https://test.atlassian.net',
        'test@example.com',
        'api-token',
        'webhook-secret'
      )

      expect(result).toBeNull()
      expect(mockShowSuccessToast).not.toHaveBeenCalled()
    })
  })

  describe('deleteJiraApp', () => {
    it('應發送刪除請求', async () => {
      const store = useJiraStore()

      mockCreateWebSocketRequest.mockResolvedValueOnce({ success: true })

      await store.deleteJiraApp('app-1')

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'jira:app:delete',
        responseEvent: 'jira:app:deleted',
        payload: { jiraAppId: 'app-1' },
      })
      expect(mockShowSuccessToast).toHaveBeenCalledWith('Jira', '刪除成功')
    })

    it('刪除失敗時不應 crash', async () => {
      const store = useJiraStore()
      const error = new Error('刪除失敗')

      mockCreateWebSocketRequest.mockRejectedValueOnce(error)

      await expect(store.deleteJiraApp('app-1')).resolves.not.toThrow()
      expect(mockShowErrorToast).toHaveBeenCalledWith('Jira', '刪除失敗', '刪除失敗')
    })
  })

  describe('bindJiraToPod', () => {
    it('應發送綁定請求（含 canvasId, podId, jiraAppId, jiraProjectKey）', async () => {
      const store = useJiraStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = 'canvas-1'

      mockCreateWebSocketRequest.mockResolvedValueOnce({ success: true })

      await store.bindJiraToPod('pod-1', 'app-1', 'PROJ')

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'pod:bind-jira',
        responseEvent: 'pod:jira:bound',
        payload: {
          canvasId: 'canvas-1',
          podId: 'pod-1',
          jiraAppId: 'app-1',
          jiraProjectKey: 'PROJ',
        },
      })
    })

    it('無 canvasId 時應顯示錯誤 toast', async () => {
      const store = useJiraStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = null

      await store.bindJiraToPod('pod-1', 'app-1', 'PROJ')

      expect(mockCreateWebSocketRequest).not.toHaveBeenCalled()
      expect(mockShowErrorToast).toHaveBeenCalledWith('Jira', '綁定失敗', '尚未選取 Canvas')
    })
  })

  describe('unbindJiraFromPod', () => {
    it('應發送解綁請求', async () => {
      const store = useJiraStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = 'canvas-1'

      mockCreateWebSocketRequest.mockResolvedValueOnce({ success: true })

      await store.unbindJiraFromPod('pod-1')

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'pod:unbind-jira',
        responseEvent: 'pod:jira:unbound',
        payload: {
          canvasId: 'canvas-1',
          podId: 'pod-1',
        },
      })
    })

    it('無 canvasId 時應顯示錯誤 toast', async () => {
      const store = useJiraStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = null

      await store.unbindJiraFromPod('pod-1')

      expect(mockCreateWebSocketRequest).not.toHaveBeenCalled()
      expect(mockShowErrorToast).toHaveBeenCalledWith('Jira', '解除綁定失敗', '尚未選取 Canvas')
    })
  })

  describe('addJiraAppFromEvent', () => {
    it('應新增 JiraApp 到 state', () => {
      const store = useJiraStore()
      const app = createMockJiraApp({ id: 'app-1' })

      store.addJiraAppFromEvent(app)

      expect(store.jiraApps).toHaveLength(1)
      expect(store.jiraApps[0]).toEqual(app)
    })
  })

  describe('removeJiraAppFromEvent', () => {
    it('應從 state 移除指定 JiraApp', () => {
      const store = useJiraStore()
      const app1 = createMockJiraApp({ id: 'app-1' })
      const app2 = createMockJiraApp({ id: 'app-2' })
      store.jiraApps = [app1, app2]

      store.removeJiraAppFromEvent('app-1')

      expect(store.jiraApps).toHaveLength(1)
      expect(store.jiraApps[0]).toEqual(app2)
    })
  })

  describe('updateJiraAppStatus', () => {
    it('應更新連線狀態與 projects', () => {
      const store = useJiraStore()
      const app = createMockJiraApp({ id: 'app-1', connectionStatus: 'disconnected', projects: [] })
      store.jiraApps = [app]
      const projects = [{ key: 'PROJ', name: 'My Project' }]

      store.updateJiraAppStatus('app-1', 'connected', projects)

      expect(store.jiraApps[0]?.connectionStatus).toBe('connected')
      expect(store.jiraApps[0]?.projects).toEqual(projects)
    })

    it('不提供 projects 時不應改變原有 projects', () => {
      const store = useJiraStore()
      const originalProjects = [{ key: 'PROJ', name: 'My Project' }]
      const app = createMockJiraApp({ id: 'app-1', projects: originalProjects })
      store.jiraApps = [app]

      store.updateJiraAppStatus('app-1', 'error')

      expect(store.jiraApps[0]?.projects).toEqual(originalProjects)
    })
  })

  describe('getters', () => {
    describe('getJiraAppById', () => {
      it('應回傳指定 id 的 JiraApp', () => {
        const store = useJiraStore()
        const app = createMockJiraApp({ id: 'app-1', name: 'App 1' })
        store.jiraApps = [app]

        const result = store.getJiraAppById('app-1')

        expect(result).toEqual(app)
      })

      it('找不到時應回傳 undefined', () => {
        const store = useJiraStore()
        store.jiraApps = []

        const result = store.getJiraAppById('non-existent')

        expect(result).toBeUndefined()
      })
    })

    describe('connectedApps', () => {
      it('應只回傳 connectionStatus 為 connected 的 Apps', () => {
        const store = useJiraStore()
        const connectedApp = createMockJiraApp({ id: 'app-1', connectionStatus: 'connected' })
        const disconnectedApp = createMockJiraApp({ id: 'app-2', connectionStatus: 'disconnected' })
        const errorApp = createMockJiraApp({ id: 'app-3', connectionStatus: 'error' })
        store.jiraApps = [connectedApp, disconnectedApp, errorApp]

        const result = store.connectedApps

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual(connectedApp)
      })
    })

    describe('getJiraAppForPod', () => {
      it('應依據 Pod 的 jiraBinding 回傳對應 JiraApp', () => {
        const store = useJiraStore()
        const app = createMockJiraApp({ id: 'app-1' })
        store.jiraApps = [app]
        const pod = createMockPod({ jiraBinding: { jiraAppId: 'app-1', jiraProjectKey: 'PROJ' } })

        const result = store.getJiraAppForPod(pod)

        expect(result).toEqual(app)
      })

      it('Pod 無 jiraBinding 時應回傳 undefined', () => {
        const store = useJiraStore()
        store.jiraApps = [createMockJiraApp()]
        const pod = createMockPod({ jiraBinding: null })

        const result = store.getJiraAppForPod(pod)

        expect(result).toBeUndefined()
      })

      it('Pod 有 jiraBinding 但找不到對應 App 時應回傳 undefined', () => {
        const store = useJiraStore()
        store.jiraApps = []
        const pod = createMockPod({ jiraBinding: { jiraAppId: 'non-existent', jiraProjectKey: 'PROJ' } })

        const result = store.getJiraAppForPod(pod)

        expect(result).toBeUndefined()
      })
    })
  })
})
