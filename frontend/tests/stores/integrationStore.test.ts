import { describe, it, expect, vi, beforeEach } from 'vitest'
import { webSocketMockFactory, mockCreateWebSocketRequest } from '../helpers/mockWebSocket'
import { setupStoreTest, mockErrorSanitizerFactory } from '../helpers/testSetup'
import type { IntegrationApp, IntegrationBinding } from '@/types/integration'

// Mock WebSocket
vi.mock('@/services/websocket', () => webSocketMockFactory())

// Mock useToast
const mockShowSuccessToast = vi.fn()
const mockShowErrorToast = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    showSuccessToast: mockShowSuccessToast,
    showErrorToast: mockShowErrorToast,
  }),
}))

// Mock sanitizeErrorForUser
vi.mock('@/utils/errorSanitizer', () => mockErrorSanitizerFactory())

// Mock providerRegistry
const mockTransformApp = vi.fn()
const mockBuildCreatePayload = vi.fn()
const mockBuildDeletePayload = vi.fn()
const mockBuildBindPayload = vi.fn()
const mockGetProvider = vi.fn()

vi.mock('@/integration/providerRegistry', () => ({
  getProvider: (name: string) => mockGetProvider(name),
  getAllProviders: vi.fn(() => []),
  registerProvider: vi.fn(),
}))

function createMockIntegrationApp(overrides?: Partial<IntegrationApp>): IntegrationApp {
  return {
    id: 'app-1',
    name: 'Test App',
    connectionStatus: 'disconnected',
    provider: 'slack',
    resources: [],
    raw: {},
    ...overrides,
  }
}

function createMockBinding(overrides?: Partial<IntegrationBinding>): IntegrationBinding {
  return {
    provider: 'slack',
    appId: 'app-1',
    resourceId: 'channel-1',
    extra: {},
    ...overrides,
  }
}

describe('integrationStore', () => {
  let useIntegrationStore: typeof import('@/stores/integrationStore').useIntegrationStore
  let useCanvasStore: typeof import('@/stores/canvasStore').useCanvasStore

  setupStoreTest()

  beforeEach(async () => {
    const integrationStoreModule = await import('@/stores/integrationStore')
    const canvasStoreModule = await import('@/stores/canvasStore')
    useIntegrationStore = integrationStoreModule.useIntegrationStore
    useCanvasStore = canvasStoreModule.useCanvasStore

    mockGetProvider.mockReturnValue({
      name: 'slack',
      label: 'Slack',
      transformApp: mockTransformApp,
      buildCreatePayload: mockBuildCreatePayload,
      buildDeletePayload: mockBuildDeletePayload,
      buildBindPayload: mockBuildBindPayload,
    })

    mockTransformApp.mockImplementation((raw: Record<string, unknown>) => {
      const resources = Array.isArray(raw.resources)
        ? (raw.resources as Array<{ id: string; name: string }>).map((r) => ({ id: r.id, label: '#' + r.name }))
        : []
      return createMockIntegrationApp({
        id: String(raw.id ?? 'app-1'),
        name: String(raw.name ?? 'Test App'),
        connectionStatus: (raw.connectionStatus as IntegrationApp['connectionStatus']) ?? 'disconnected',
        resources,
      })
    })
  })

  describe('初始狀態', () => {
    it('apps 應為空物件', () => {
      const store = useIntegrationStore()

      expect(store.apps).toEqual({})
    })
  })

  describe('getters', () => {
    describe('getAppsByProvider', () => {
      it('有資料時應回傳對應 provider 的 apps', () => {
        const store = useIntegrationStore()
        const app = createMockIntegrationApp({ provider: 'slack' })
        store.apps['slack'] = [app]

        const result = store.getAppsByProvider('slack')

        expect(result).toEqual([app])
      })

      it('無資料時應回傳空陣列', () => {
        const store = useIntegrationStore()

        const result = store.getAppsByProvider('slack')

        expect(result).toEqual([])
      })
    })

    describe('getAppById', () => {
      it('找到對應 ID 的 App 時應回傳', () => {
        const store = useIntegrationStore()
        const app = createMockIntegrationApp({ id: 'app-123', provider: 'slack' })
        store.apps['slack'] = [app]

        const result = store.getAppById('slack', 'app-123')

        expect(result).toEqual(app)
      })

      it('找不到對應 ID 時應回傳 undefined', () => {
        const store = useIntegrationStore()
        store.apps['slack'] = []

        const result = store.getAppById('slack', 'nonexistent')

        expect(result).toBeUndefined()
      })

      it('provider 不存在時應回傳 undefined', () => {
        const store = useIntegrationStore()

        const result = store.getAppById('unknown', 'app-1')

        expect(result).toBeUndefined()
      })
    })

    describe('connectedAppsByProvider', () => {
      it('應過濾出 connectionStatus 為 connected 的 apps', () => {
        const store = useIntegrationStore()
        const connectedApp = createMockIntegrationApp({ id: 'app-1', connectionStatus: 'connected' })
        const disconnectedApp = createMockIntegrationApp({ id: 'app-2', connectionStatus: 'disconnected' })
        const errorApp = createMockIntegrationApp({ id: 'app-3', connectionStatus: 'error' })
        store.apps['slack'] = [connectedApp, disconnectedApp, errorApp]

        const result = store.connectedAppsByProvider('slack')

        expect(result).toEqual([connectedApp])
      })

      it('無資料時應回傳空陣列', () => {
        const store = useIntegrationStore()

        const result = store.connectedAppsByProvider('slack')

        expect(result).toEqual([])
      })
    })

    describe('getAppForPodBinding', () => {
      it('應依 binding 的 provider 和 appId 找到對應 app', () => {
        const store = useIntegrationStore()
        const app = createMockIntegrationApp({ id: 'app-1', provider: 'slack' })
        store.apps['slack'] = [app]
        const binding = createMockBinding({ provider: 'slack', appId: 'app-1' })

        const result = store.getAppForPodBinding(binding)

        expect(result).toEqual(app)
      })

      it('找不到對應 app 時應回傳 undefined', () => {
        const store = useIntegrationStore()
        store.apps['slack'] = []
        const binding = createMockBinding({ provider: 'slack', appId: 'nonexistent' })

        const result = store.getAppForPodBinding(binding)

        expect(result).toBeUndefined()
      })
    })
  })

  describe('actions', () => {
    describe('loadApps', () => {
      it('應呼叫 INTEGRATION_APP_LIST 並用 transformApp 轉換 apps', async () => {
        const store = useIntegrationStore()
        const rawApps = [
          { id: 'app-1', name: 'App One' },
          { id: 'app-2', name: 'App Two' },
        ]
        mockCreateWebSocketRequest.mockResolvedValueOnce({
          success: true,
          provider: 'slack',
          apps: rawApps,
        })

        await store.loadApps('slack')

        expect(mockCreateWebSocketRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            requestEvent: 'integration:app:list',
            responseEvent: 'integration:app:list:result',
            payload: { provider: 'slack' },
          })
        )
        expect(mockTransformApp).toHaveBeenCalledTimes(2)
        expect(store.apps['slack']).toHaveLength(2)
      })

      it('response 無 apps 時不應更新 state', async () => {
        const store = useIntegrationStore()
        store.apps['slack'] = [createMockIntegrationApp()]
        mockCreateWebSocketRequest.mockResolvedValueOnce({
          success: true,
          provider: 'slack',
        })

        await store.loadApps('slack')

        expect(store.apps['slack']).toHaveLength(1)
      })
    })

    describe('createApp', () => {
      it('應呼叫 INTEGRATION_APP_CREATE 並回傳轉換後的 app', async () => {
        const store = useIntegrationStore()
        const rawApp = { id: 'new-app', name: 'New App' }
        const transformedApp = createMockIntegrationApp({ id: 'new-app', name: 'New App' })
        mockBuildCreatePayload.mockReturnValueOnce({ name: 'New App', botToken: 'xoxb-test', signingSecret: 'secret' })
        mockTransformApp.mockReturnValueOnce(transformedApp)
        mockCreateWebSocketRequest.mockResolvedValueOnce({
          success: true,
          provider: 'slack',
          app: rawApp,
        })

        const result = await store.createApp('slack', { name: 'New App', botToken: 'xoxb-test', signingSecret: 'secret' })

        expect(mockCreateWebSocketRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            requestEvent: 'integration:app:create',
            responseEvent: 'integration:app:created',
            payload: expect.objectContaining({ provider: 'slack' }),
          })
        )
        expect(result).toEqual(transformedApp)
        expect(mockShowSuccessToast).toHaveBeenCalledWith('Integration', '建立成功', 'New App')
      })

      it('請求失敗時應回傳 null 並顯示錯誤 toast', async () => {
        const store = useIntegrationStore()
        mockBuildCreatePayload.mockReturnValueOnce({ name: 'New App' })
        mockCreateWebSocketRequest.mockRejectedValueOnce(new Error('建立失敗'))

        const result = await store.createApp('slack', { name: 'New App' })

        expect(result).toBeNull()
        expect(mockShowErrorToast).toHaveBeenCalledWith('Integration', '建立失敗', expect.any(String))
      })

      it('response 無 app 時應回傳 null', async () => {
        const store = useIntegrationStore()
        mockBuildCreatePayload.mockReturnValueOnce({ name: 'New App' })
        mockCreateWebSocketRequest.mockResolvedValueOnce({
          success: true,
          provider: 'slack',
        })

        const result = await store.createApp('slack', { name: 'New App' })

        expect(result).toBeNull()
      })
    })

    describe('deleteApp', () => {
      it('應呼叫 INTEGRATION_APP_DELETE 並顯示成功 toast', async () => {
        const store = useIntegrationStore()
        mockBuildDeletePayload.mockReturnValueOnce({ appId: 'app-1' })
        mockCreateWebSocketRequest.mockResolvedValueOnce({
          success: true,
          provider: 'slack',
          appId: 'app-1',
        })

        await store.deleteApp('slack', 'app-1')

        expect(mockCreateWebSocketRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            requestEvent: 'integration:app:delete',
            responseEvent: 'integration:app:deleted',
            payload: expect.objectContaining({ provider: 'slack', appId: 'app-1' }),
          })
        )
        expect(mockShowSuccessToast).toHaveBeenCalledWith('Integration', '刪除成功')
      })

      it('請求失敗時應顯示錯誤 toast', async () => {
        const store = useIntegrationStore()
        mockBuildDeletePayload.mockReturnValueOnce({ appId: 'app-1' })
        mockCreateWebSocketRequest.mockRejectedValueOnce(new Error('刪除失敗'))

        await store.deleteApp('slack', 'app-1')

        expect(mockShowErrorToast).toHaveBeenCalledWith('Integration', '刪除失敗', expect.any(String))
      })
    })

    describe('bindToPod', () => {
      it('應呼叫 POD_BIND_INTEGRATION 並帶正確 payload', async () => {
        const canvasStore = useCanvasStore()
        canvasStore.activeCanvasId = 'canvas-1'
        const store = useIntegrationStore()
        mockBuildBindPayload.mockReturnValueOnce({ appId: 'app-1', resourceId: 'channel-1' })
        mockCreateWebSocketRequest.mockResolvedValueOnce({
          success: true,
          provider: 'slack',
        })

        await store.bindToPod('slack', 'pod-1', 'app-1', 'channel-1')

        expect(mockCreateWebSocketRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            requestEvent: 'pod:bind-integration',
            responseEvent: 'pod:integration:bound',
            payload: expect.objectContaining({
              canvasId: 'canvas-1',
              podId: 'pod-1',
              provider: 'slack',
              appId: 'app-1',
              resourceId: 'channel-1',
            }),
          })
        )
      })

      it('無 canvasId 時應顯示錯誤 toast 並提早返回', async () => {
        const canvasStore = useCanvasStore()
        canvasStore.activeCanvasId = null
        const store = useIntegrationStore()

        await store.bindToPod('slack', 'pod-1', 'app-1', 'channel-1')

        expect(mockCreateWebSocketRequest).not.toHaveBeenCalled()
        expect(mockShowErrorToast).toHaveBeenCalledWith('Integration', '綁定失敗', '尚未選取 Canvas')
      })

      it('帶 extra 參數時應傳遞到 buildBindPayload', async () => {
        const canvasStore = useCanvasStore()
        canvasStore.activeCanvasId = 'canvas-1'
        const store = useIntegrationStore()
        const extra = { chatType: 'private' }
        mockBuildBindPayload.mockReturnValueOnce({ appId: 'app-1', resourceId: 'user-123', extra: { chatType: 'private' } })
        mockCreateWebSocketRequest.mockResolvedValueOnce({ success: true, provider: 'telegram' })

        await store.bindToPod('telegram', 'pod-1', 'app-1', 'user-123', extra)

        expect(mockBuildBindPayload).toHaveBeenCalledWith('app-1', 'user-123', extra)
      })
    })

    describe('unbindFromPod', () => {
      it('應呼叫 POD_UNBIND_INTEGRATION 並帶正確 payload', async () => {
        const canvasStore = useCanvasStore()
        canvasStore.activeCanvasId = 'canvas-1'
        const store = useIntegrationStore()
        mockCreateWebSocketRequest.mockResolvedValueOnce({
          success: true,
          provider: 'slack',
        })

        await store.unbindFromPod('slack', 'pod-1')

        expect(mockCreateWebSocketRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            requestEvent: 'pod:unbind-integration',
            responseEvent: 'pod:integration:unbound',
            payload: { canvasId: 'canvas-1', podId: 'pod-1', provider: 'slack' },
          })
        )
      })

      it('無 canvasId 時應顯示錯誤 toast 並提早返回', async () => {
        const canvasStore = useCanvasStore()
        canvasStore.activeCanvasId = null
        const store = useIntegrationStore()

        await store.unbindFromPod('slack', 'pod-1')

        expect(mockCreateWebSocketRequest).not.toHaveBeenCalled()
        expect(mockShowErrorToast).toHaveBeenCalledWith('Integration', '解除綁定失敗', '尚未選取 Canvas')
      })
    })

    describe('addAppFromEvent', () => {
      it('應透過 transformApp 轉換並新增 app 到對應 provider', () => {
        const store = useIntegrationStore()
        const rawApp = { id: 'new-app', name: 'New App From Event' }
        const transformedApp = createMockIntegrationApp({ id: 'new-app', name: 'New App From Event' })
        mockTransformApp.mockReturnValueOnce(transformedApp)

        store.addAppFromEvent('slack', rawApp)

        expect(store.apps['slack']).toEqual([transformedApp])
      })

      it('provider 尚無資料時應初始化並新增', () => {
        const store = useIntegrationStore()
        const rawApp = { id: 'app-1', name: 'App' }
        const transformedApp = createMockIntegrationApp()
        mockTransformApp.mockReturnValueOnce(transformedApp)

        store.addAppFromEvent('telegram', rawApp)

        expect(store.apps['telegram']).toHaveLength(1)
      })

      it('已有既有 apps 時應 push 而非覆蓋', () => {
        const store = useIntegrationStore()
        const existingApp = createMockIntegrationApp({ id: 'existing' })
        store.apps['slack'] = [existingApp]
        const newApp = createMockIntegrationApp({ id: 'new-app' })
        mockTransformApp.mockReturnValueOnce(newApp)

        store.addAppFromEvent('slack', { id: 'new-app' })

        expect(store.apps['slack']).toHaveLength(2)
      })
    })

    describe('removeAppFromEvent', () => {
      it('應從對應 provider 移除指定 appId 的 app', () => {
        const store = useIntegrationStore()
        const app1 = createMockIntegrationApp({ id: 'app-1' })
        const app2 = createMockIntegrationApp({ id: 'app-2' })
        store.apps['slack'] = [app1, app2]

        store.removeAppFromEvent('slack', 'app-1')

        expect(store.apps['slack']).toEqual([app2])
      })

      it('provider 不存在時不應拋出錯誤', () => {
        const store = useIntegrationStore()

        expect(() => store.removeAppFromEvent('unknown', 'app-1')).not.toThrow()
      })

      it('app 不存在時應保持原有資料不變', () => {
        const store = useIntegrationStore()
        const app = createMockIntegrationApp({ id: 'app-1' })
        store.apps['slack'] = [app]

        store.removeAppFromEvent('slack', 'nonexistent')

        expect(store.apps['slack']).toHaveLength(1)
      })
    })

    describe('refreshAppResources', () => {
      it('成功時應更新 app 的 resources', async () => {
        const store = useIntegrationStore()
        store.apps['slack'] = [createMockIntegrationApp({ id: 'app-1', connectionStatus: 'connected', raw: { id: 'app-1', name: 'Test App' } })]

        mockCreateWebSocketRequest.mockResolvedValueOnce({
          requestId: 'req-1',
          success: true,
          appId: 'app-1',
          resources: [
            { id: 'ch-1', name: 'general' },
            { id: 'ch-2', name: 'dev' },
          ],
        })

        await store.refreshAppResources('slack', 'app-1')

        expect(store.apps['slack']?.[0]?.resources).toEqual([
          { id: 'ch-1', label: '#general' },
          { id: 'ch-2', label: '#dev' },
        ])
      })

      it('回應無 resources 時不應更新', async () => {
        const store = useIntegrationStore()
        const originalResources = [{ id: 'ch-1', label: '#general' }]
        store.apps['slack'] = [createMockIntegrationApp({ id: 'app-1', resources: originalResources })]

        mockCreateWebSocketRequest.mockResolvedValueOnce({
          requestId: 'req-1',
          success: true,
          appId: 'app-1',
        })

        await store.refreshAppResources('slack', 'app-1')

        expect(store.apps['slack']?.[0]?.resources).toEqual(originalResources)
      })

      it('app 不存在時不應拋出錯誤', async () => {
        const store = useIntegrationStore()
        store.apps['slack'] = []

        mockCreateWebSocketRequest.mockResolvedValueOnce({
          requestId: 'req-1',
          success: true,
          appId: 'app-999',
          resources: [{ id: 'ch-1', name: 'general' }],
        })

        await expect(store.refreshAppResources('slack', 'app-999')).resolves.not.toThrow()
      })

      it('應使用正確的 WebSocket 事件和 payload 發送請求', async () => {
        const store = useIntegrationStore()
        store.apps['slack'] = [createMockIntegrationApp({ id: 'app-1' })]

        mockCreateWebSocketRequest.mockResolvedValueOnce({
          requestId: 'req-1',
          success: true,
          appId: 'app-1',
          resources: [],
        })

        await store.refreshAppResources('slack', 'app-1')

        expect(mockCreateWebSocketRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            requestEvent: 'integration:app:resources:refresh',
            responseEvent: 'integration:app:resources:refreshed',
            payload: { appId: 'app-1' },
          })
        )
      })
    })

    describe('updateAppStatus', () => {
      it('應更新對應 app 的 connectionStatus', () => {
        const store = useIntegrationStore()
        const app = createMockIntegrationApp({ id: 'app-1', connectionStatus: 'disconnected' })
        store.apps['slack'] = [app]

        store.updateAppStatus('slack', 'app-1', 'connected')

        expect(store.getAppsByProvider('slack')[0]?.connectionStatus).toBe('connected')
      })

      it('傳入 resources 時應同時更新 resources', () => {
        const store = useIntegrationStore()
        const app = createMockIntegrationApp({ id: 'app-1', resources: [] })
        store.apps['slack'] = [app]
        const rawResources = [{ id: 'ch-1', name: 'general' }]

        store.updateAppStatus('slack', 'app-1', 'connected', rawResources)

        expect(store.getAppsByProvider('slack')[0]?.resources).toEqual([{ id: 'ch-1', label: '#general' }])
      })

      it('不傳入 resources 時不應更新 resources', () => {
        const store = useIntegrationStore()
        const originalResources = [{ id: 'ch-1', label: '#general' }]
        const app = createMockIntegrationApp({ id: 'app-1', resources: originalResources })
        store.apps['slack'] = [app]

        store.updateAppStatus('slack', 'app-1', 'error')

        expect(store.getAppsByProvider('slack')[0]?.resources).toEqual(originalResources)
      })

      it('找不到 app 時不應拋出錯誤', () => {
        const store = useIntegrationStore()
        store.apps['slack'] = []

        expect(() => store.updateAppStatus('slack', 'nonexistent', 'connected')).not.toThrow()
      })

      it('provider 不存在時不應拋出錯誤', () => {
        const store = useIntegrationStore()

        expect(() => store.updateAppStatus('unknown', 'app-1', 'connected')).not.toThrow()
      })
    })
  })
})
