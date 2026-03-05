import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import TelegramStatusIcon from '@/components/pod/TelegramStatusIcon.vue'
import type { PodTelegramBinding } from '@/types/telegram'

vi.mock('@/components/icons/TelegramIcon.vue', () => ({
  default: { name: 'TelegramIcon', template: '<svg />', props: ['size'] },
}))

const mockTelegramBinding: PodTelegramBinding = {
  telegramBotId: 'bot-1',
  telegramChatId: 123,
  chatType: 'private',
}

function mountComponent(props: {
  telegramBinding: PodTelegramBinding | null | undefined
  hasSlackBinding?: boolean
}) {
  return mount(TelegramStatusIcon, {
    props,
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })],
    },
  })
}

describe('TelegramStatusIcon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('顯示邏輯', () => {
    it('telegramBinding 為 null 時不渲染圖示', () => {
      const wrapper = mountComponent({ telegramBinding: null })
      expect(wrapper.find('div').exists()).toBe(false)
    })

    it('telegramBinding 存在時渲染圖示', () => {
      const wrapper = mountComponent({ telegramBinding: mockTelegramBinding })
      expect(wrapper.find('div').exists()).toBe(true)
    })
  })

  describe('定位邏輯', () => {
    it('hasSlackBinding 為 false 時，right 應為 -12px（與 Slack 同位置）', () => {
      const wrapper = mountComponent({
        telegramBinding: mockTelegramBinding,
        hasSlackBinding: false,
      })
      const el = wrapper.find('div').element as HTMLElement
      expect(el.style.top).toBe('-12px')
      expect(el.style.right).toBe('-12px')
    })

    it('hasSlackBinding 未傳入時，right 應預設為 -12px', () => {
      const wrapper = mountComponent({ telegramBinding: mockTelegramBinding })
      const el = wrapper.find('div').element as HTMLElement
      expect(el.style.top).toBe('-12px')
      expect(el.style.right).toBe('-12px')
    })

    it('hasSlackBinding 為 true 時，right 應為 24px（偏左避免重疊）', () => {
      const wrapper = mountComponent({
        telegramBinding: mockTelegramBinding,
        hasSlackBinding: true,
      })
      const el = wrapper.find('div').element as HTMLElement
      expect(el.style.top).toBe('-12px')
      expect(el.style.right).toBe('24px')
    })
  })
})
