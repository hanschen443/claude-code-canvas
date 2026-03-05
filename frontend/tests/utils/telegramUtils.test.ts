import { describe, it, expect } from 'vitest'
import { connectionStatusClass } from '@/utils/telegramUtils'
import type { TelegramBot } from '@/types/telegram'

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

describe('telegramUtils', () => {
  describe('connectionStatusClass', () => {
    it('connected 狀態應回傳 bg-green-500', () => {
      const bot = createMockTelegramBot({ connectionStatus: 'connected' })
      expect(connectionStatusClass(bot)).toBe('bg-green-500')
    })

    it('disconnected 狀態應回傳 bg-red-500', () => {
      const bot = createMockTelegramBot({ connectionStatus: 'disconnected' })
      expect(connectionStatusClass(bot)).toBe('bg-red-500')
    })

    it('error 狀態應回傳 bg-red-500', () => {
      const bot = createMockTelegramBot({ connectionStatus: 'error' })
      expect(connectionStatusClass(bot)).toBe('bg-red-500')
    })
  })
})
