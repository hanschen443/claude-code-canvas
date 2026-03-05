import { describe, it, expect, vi } from 'vitest'
import { webSocketMockFactory, mockCreateWebSocketRequest } from '../helpers/mockWebSocket'
import { setupStoreTest, mockErrorSanitizerFactory } from '../helpers/testSetup'
import { createMockPod } from '../helpers/factories'
import { useTelegramStore } from '@/stores/telegramStore'
import { useCanvasStore } from '@/stores/canvasStore'
import type { TelegramBot } from '@/types/telegram'

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

function createMockTelegramBot(overrides?: Partial<TelegramBot>): TelegramBot {
  return {
    id: 'telegram-bot-1',
    name: 'Test Telegram Bot',
    connectionStatus: 'disconnected',
    chats: [],
    botUsername: 'test_bot',
    ...overrides,
  }
}

describe('telegramStore', () => {
  setupStoreTest()

  describe('初始狀態', () => {
    it('telegramBots 應為空陣列', () => {
      const store = useTelegramStore()

      expect(store.telegramBots).toEqual([])
    })
  })

  describe('getters', () => {
    describe('getTelegramBotById', () => {
      it('找到對應 ID 的 Bot 時應回傳', () => {
        const store = useTelegramStore()
        const bot = createMockTelegramBot({ id: 'bot-1', name: 'Bot 1' })
        store.telegramBots = [bot]

        const result = store.getTelegramBotById('bot-1')

        expect(result).toEqual(bot)
      })

      it('找不到對應 ID 時應回傳 undefined', () => {
        const store = useTelegramStore()
        store.telegramBots = []

        const result = store.getTelegramBotById('non-existent')

        expect(result).toBeUndefined()
      })
    })

    describe('connectedBots', () => {
      it('應只回傳 connectionStatus 為 connected 的 Bot', () => {
        const store = useTelegramStore()
        const connectedBot = createMockTelegramBot({ id: 'bot-1', connectionStatus: 'connected' })
        const disconnectedBot = createMockTelegramBot({ id: 'bot-2', connectionStatus: 'disconnected' })
        const errorBot = createMockTelegramBot({ id: 'bot-3', connectionStatus: 'error' })
        store.telegramBots = [connectedBot, disconnectedBot, errorBot]

        const result = store.connectedBots

        expect(result).toHaveLength(1)
        expect(result[0]).toEqual(connectedBot)
      })

      it('無 connected Bot 時應回傳空陣列', () => {
        const store = useTelegramStore()
        store.telegramBots = []

        expect(store.connectedBots).toEqual([])
      })
    })

    describe('getTelegramBotForPod', () => {
      it('Pod 有 telegramBinding 且找到對應 Bot 時應回傳', () => {
        const store = useTelegramStore()
        const bot = createMockTelegramBot({ id: 'bot-1' })
        store.telegramBots = [bot]
        const pod = createMockPod({ telegramBinding: { telegramBotId: 'bot-1', telegramChatId: 123, chatType: 'group' } })

        const result = store.getTelegramBotForPod(pod)

        expect(result).toEqual(bot)
      })

      it('Pod 無 telegramBinding 時應回傳 undefined', () => {
        const store = useTelegramStore()
        store.telegramBots = [createMockTelegramBot()]
        const pod = createMockPod({ telegramBinding: null })

        const result = store.getTelegramBotForPod(pod)

        expect(result).toBeUndefined()
      })

      it('Pod 有 telegramBinding 但找不到對應 Bot 時應回傳 undefined', () => {
        const store = useTelegramStore()
        store.telegramBots = []
        const pod = createMockPod({ telegramBinding: { telegramBotId: 'non-existent', telegramChatId: 123, chatType: 'group' } })

        const result = store.getTelegramBotForPod(pod)

        expect(result).toBeUndefined()
      })
    })
  })

  describe('loadTelegramBots', () => {
    it('成功時應更新 telegramBots', async () => {
      const store = useTelegramStore()
      const bots = [createMockTelegramBot({ id: 'bot-1' }), createMockTelegramBot({ id: 'bot-2' })]

      mockCreateWebSocketRequest.mockResolvedValueOnce({ telegramBots: bots })

      await store.loadTelegramBots()

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'telegram:bot:list',
        responseEvent: 'telegram:bot:list:result',
        payload: {},
      })
      expect(store.telegramBots).toEqual(bots)
    })

    it('回應無 telegramBots 時 telegramBots 應保持原樣', async () => {
      const store = useTelegramStore()
      const existingBot = createMockTelegramBot({ id: 'existing' })
      store.telegramBots = [existingBot]

      mockCreateWebSocketRequest.mockResolvedValueOnce({})

      await store.loadTelegramBots()

      expect(store.telegramBots).toEqual([existingBot])
    })
  })

  describe('createTelegramBot', () => {
    it('成功時應顯示成功 Toast 並回傳 TelegramBot', async () => {
      const store = useTelegramStore()
      const newBot = createMockTelegramBot({ id: 'new-bot', name: 'My Bot' })

      mockCreateWebSocketRequest.mockResolvedValueOnce({ telegramBot: newBot })

      const result = await store.createTelegramBot('My Bot', '123456:ABC-DEF')

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'telegram:bot:create',
        responseEvent: 'telegram:bot:created',
        payload: {
          name: 'My Bot',
          botToken: '123456:ABC-DEF',
        },
      })
      expect(mockShowSuccessToast).toHaveBeenCalledWith('Telegram', '建立成功', 'My Bot')
      expect(result).toEqual(newBot)
    })

    it('回應無 telegramBot 時應回傳 null', async () => {
      const store = useTelegramStore()

      mockCreateWebSocketRequest.mockResolvedValueOnce({})

      const result = await store.createTelegramBot('My Bot', '123456:ABC-DEF')

      expect(result).toBeNull()
      expect(mockShowSuccessToast).not.toHaveBeenCalled()
    })

    it('失敗時應顯示錯誤 Toast 並回傳 null', async () => {
      const store = useTelegramStore()
      const error = new Error('建立失敗')

      mockCreateWebSocketRequest.mockRejectedValueOnce(error)

      const result = await store.createTelegramBot('My Bot', '123456:ABC-DEF')

      expect(mockShowErrorToast).toHaveBeenCalledWith('Telegram', '建立失敗', '建立失敗')
      expect(result).toBeNull()
    })
  })

  describe('deleteTelegramBot', () => {
    it('成功時應顯示成功 Toast', async () => {
      const store = useTelegramStore()

      mockCreateWebSocketRequest.mockResolvedValueOnce({ success: true })

      await store.deleteTelegramBot('bot-1')

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'telegram:bot:delete',
        responseEvent: 'telegram:bot:deleted',
        payload: { telegramBotId: 'bot-1' },
      })
      expect(mockShowSuccessToast).toHaveBeenCalledWith('Telegram', '刪除成功')
    })

    it('失敗時應顯示錯誤 Toast', async () => {
      const store = useTelegramStore()
      const error = new Error('刪除失敗')

      mockCreateWebSocketRequest.mockRejectedValueOnce(error)

      await store.deleteTelegramBot('bot-1')

      expect(mockShowErrorToast).toHaveBeenCalledWith('Telegram', '刪除失敗', '刪除失敗')
    })
  })

  describe('bindTelegramToPod', () => {
    it('有 activeCanvasId 時應發送正確 payload', async () => {
      const store = useTelegramStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = 'canvas-1'

      mockCreateWebSocketRequest.mockResolvedValueOnce({ success: true })

      await store.bindTelegramToPod('pod-1', 'bot-1', 123456, 'group')

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'pod:bind-telegram',
        responseEvent: 'pod:telegram:bound',
        payload: {
          canvasId: 'canvas-1',
          podId: 'pod-1',
          telegramBotId: 'bot-1',
          telegramChatId: 123456,
          chatType: 'group',
        },
      })
    })

    it('無 activeCanvasId 時應顯示錯誤 Toast 且不發送請求', async () => {
      const store = useTelegramStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = null

      await store.bindTelegramToPod('pod-1', 'bot-1', 123456, 'group')

      expect(mockCreateWebSocketRequest).not.toHaveBeenCalled()
      expect(mockShowErrorToast).toHaveBeenCalledWith('Telegram', '綁定失敗', '尚未選取 Canvas')
    })

    it('發送失敗時應顯示錯誤 Toast', async () => {
      const store = useTelegramStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = 'canvas-1'
      const error = new Error('綁定錯誤')

      mockCreateWebSocketRequest.mockRejectedValueOnce(error)

      await store.bindTelegramToPod('pod-1', 'bot-1', 123456, 'group')

      expect(mockShowErrorToast).toHaveBeenCalledWith('Telegram', '綁定失敗', '綁定錯誤')
    })
  })

  describe('unbindTelegramFromPod', () => {
    it('有 activeCanvasId 時應發送正確 payload', async () => {
      const store = useTelegramStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = 'canvas-1'

      mockCreateWebSocketRequest.mockResolvedValueOnce({ success: true })

      await store.unbindTelegramFromPod('pod-1')

      expect(mockCreateWebSocketRequest).toHaveBeenCalledWith({
        requestEvent: 'pod:unbind-telegram',
        responseEvent: 'pod:telegram:unbound',
        payload: {
          canvasId: 'canvas-1',
          podId: 'pod-1',
        },
      })
    })

    it('無 activeCanvasId 時應顯示錯誤 Toast 且不發送請求', async () => {
      const store = useTelegramStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = null

      await store.unbindTelegramFromPod('pod-1')

      expect(mockCreateWebSocketRequest).not.toHaveBeenCalled()
      expect(mockShowErrorToast).toHaveBeenCalledWith('Telegram', '解除綁定失敗', '尚未選取 Canvas')
    })

    it('發送失敗時應顯示錯誤 Toast', async () => {
      const store = useTelegramStore()
      const canvasStore = useCanvasStore()
      canvasStore.activeCanvasId = 'canvas-1'
      const error = new Error('解除綁定錯誤')

      mockCreateWebSocketRequest.mockRejectedValueOnce(error)

      await store.unbindTelegramFromPod('pod-1')

      expect(mockShowErrorToast).toHaveBeenCalledWith('Telegram', '解除綁定失敗', '解除綁定錯誤')
    })
  })

  describe('addTelegramBotFromEvent', () => {
    it('應新增 TelegramBot 到列表', () => {
      const store = useTelegramStore()
      const bot = createMockTelegramBot({ id: 'bot-1' })

      store.addTelegramBotFromEvent(bot)

      expect(store.telegramBots).toHaveLength(1)
      expect(store.telegramBots[0]).toEqual(bot)
    })

    it('可新增多個 Bot', () => {
      const store = useTelegramStore()
      const bot1 = createMockTelegramBot({ id: 'bot-1' })
      const bot2 = createMockTelegramBot({ id: 'bot-2' })

      store.addTelegramBotFromEvent(bot1)
      store.addTelegramBotFromEvent(bot2)

      expect(store.telegramBots).toHaveLength(2)
    })
  })

  describe('removeTelegramBotFromEvent', () => {
    it('應移除指定 ID 的 Bot', () => {
      const store = useTelegramStore()
      const bot1 = createMockTelegramBot({ id: 'bot-1' })
      const bot2 = createMockTelegramBot({ id: 'bot-2' })
      store.telegramBots = [bot1, bot2]

      store.removeTelegramBotFromEvent('bot-1')

      expect(store.telegramBots).toHaveLength(1)
      expect(store.telegramBots[0]).toEqual(bot2)
    })

    it('ID 不存在時不應改變列表', () => {
      const store = useTelegramStore()
      const bot = createMockTelegramBot({ id: 'bot-1' })
      store.telegramBots = [bot]

      store.removeTelegramBotFromEvent('non-existent')

      expect(store.telegramBots).toHaveLength(1)
    })
  })

  describe('updateTelegramBotStatus', () => {
    it('應更新 Bot 的 connectionStatus', () => {
      const store = useTelegramStore()
      const bot = createMockTelegramBot({ id: 'bot-1', connectionStatus: 'disconnected' })
      store.telegramBots = [bot]

      store.updateTelegramBotStatus('bot-1', 'connected')

      expect(store.telegramBots[0]?.connectionStatus).toBe('connected')
    })

    it('提供 chats 時應同時更新 chats', () => {
      const store = useTelegramStore()
      const bot = createMockTelegramBot({ id: 'bot-1', chats: [] })
      store.telegramBots = [bot]
      const chats = [{ id: 123, type: 'group' as const, title: 'Test Group' }]

      store.updateTelegramBotStatus('bot-1', 'connected', chats)

      expect(store.telegramBots[0]?.chats).toEqual(chats)
      expect(store.telegramBots[0]?.connectionStatus).toBe('connected')
    })

    it('不提供 chats 時不應改變原有 chats', () => {
      const store = useTelegramStore()
      const originalChats = [{ id: 123, type: 'group' as const, title: 'Test Group' }]
      const bot = createMockTelegramBot({ id: 'bot-1', chats: originalChats })
      store.telegramBots = [bot]

      store.updateTelegramBotStatus('bot-1', 'error')

      expect(store.telegramBots[0]?.chats).toEqual(originalChats)
    })

    it('Bot 不存在時不應有任何操作', () => {
      const store = useTelegramStore()
      store.telegramBots = []

      expect(() => store.updateTelegramBotStatus('non-existent', 'connected')).not.toThrow()
    })
  })
})
