import { ref } from 'vue'
import { websocketClient, WebSocketResponseEvents } from '@/services/websocket'
import { getPodEventListeners, handlePodChatUserMessage } from './eventHandlers/podEventHandlers'
import { getConnectionEventListeners } from './eventHandlers/connectionEventHandlers'
import { getNoteEventListeners } from './eventHandlers/noteEventHandlers'
import { getCanvasEventListeners } from './eventHandlers/canvasEventHandlers'
import { getIntegrationEventListeners, handleIntegrationConnectionStatusChanged } from './eventHandlers/integrationEventHandlers'

const isListenerRegistered = ref(false)

export const listeners = [
  ...getPodEventListeners(),
  ...getConnectionEventListeners(),
  ...getNoteEventListeners(),
  ...getCanvasEventListeners(),
  ...getIntegrationEventListeners(),
]

// 這兩個事件的 payload 不含 canvasId / requestId，無法套用 createUnifiedHandler 機制
// （不需要 Canvas 過濾、不需要 Toast、不需要 pending request 解析），因此維持獨立註冊。
// 測試也明確以 listeners.length + 2 驗證此分離設計，不應將其納入 listeners 陣列。
const standaloneListeners: Array<{ event: string; handler: (payload: unknown) => void }> = [
  { event: WebSocketResponseEvents.POD_CHAT_USER_MESSAGE, handler: handlePodChatUserMessage as (payload: unknown) => void },
  { event: WebSocketResponseEvents.INTEGRATION_CONNECTION_STATUS_CHANGED, handler: handleIntegrationConnectionStatusChanged as (payload: unknown) => void },
]

export function registerUnifiedListeners(): void {
  if (isListenerRegistered.value) return
  isListenerRegistered.value = true

  for (const { event, handler } of listeners) {
    websocketClient.on(event, handler)
  }

  for (const { event, handler } of standaloneListeners) {
    websocketClient.on(event, handler)
  }
}

export function unregisterUnifiedListeners(): void {
  if (!isListenerRegistered.value) return
  isListenerRegistered.value = false

  for (const { event, handler } of listeners) {
    websocketClient.off(event, handler)
  }

  for (const { event, handler } of standaloneListeners) {
    websocketClient.off(event, handler)
  }
}

export const useUnifiedEventListeners = (): {
  registerUnifiedListeners: () => void
  unregisterUnifiedListeners: () => void
} => {
  return {
    registerUnifiedListeners,
    unregisterUnifiedListeners,
  }
}
