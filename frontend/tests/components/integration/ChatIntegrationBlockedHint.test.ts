import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

vi.mock('@/components/icons/SlackIcon.vue', () => ({
  default: { name: 'SlackIcon', template: '<svg data-provider="slack" />', props: ['size'] },
}))
vi.mock('@/components/icons/TelegramIcon.vue', () => ({
  default: { name: 'TelegramIcon', template: '<svg data-provider="telegram" />', props: ['size'] },
}))
vi.mock('@/components/icons/JiraIcon.vue', () => ({
  default: { name: 'JiraIcon', template: '<svg data-provider="jira" />', props: ['size'] },
}))

async function mountComponent(provider: string) {
  const { default: ChatIntegrationBlockedHint } = await import(
    '@/components/integration/ChatIntegrationBlockedHint.vue'
  )

  return mount(ChatIntegrationBlockedHint, {
    props: { provider },
  })
}

describe('ChatIntegrationBlockedHint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Slack provider', () => {
    it('應顯示 Slack 的封鎖提示文字', async () => {
      const wrapper = await mountComponent('slack')
      expect(wrapper.text()).toContain('此 Pod 已連接 Slack，訊息由 Slack 驅動')
    })

    it('應有正確的 data-testid', async () => {
      const wrapper = await mountComponent('slack')
      expect(wrapper.find('[data-testid="slack-blocked-hint"]').exists()).toBe(true)
    })
  })

  describe('Telegram provider', () => {
    it('應顯示 Telegram 的封鎖提示文字', async () => {
      const wrapper = await mountComponent('telegram')
      expect(wrapper.text()).toContain('此 Pod 已連接 Telegram，訊息由 Telegram 驅動')
    })

    it('應有正確的 data-testid', async () => {
      const wrapper = await mountComponent('telegram')
      expect(wrapper.find('[data-testid="telegram-blocked-hint"]').exists()).toBe(true)
    })
  })

  describe('Jira provider', () => {
    it('應顯示 Jira 的封鎖提示文字', async () => {
      const wrapper = await mountComponent('jira')
      expect(wrapper.text()).toContain('此 Pod 已連接 Jira，訊息由 Jira 驅動')
    })

    it('應有正確的 data-testid', async () => {
      const wrapper = await mountComponent('jira')
      expect(wrapper.find('[data-testid="jira-blocked-hint"]').exists()).toBe(true)
    })
  })

  describe('樣式結構', () => {
    it('應包含 border-t-2 邊框', async () => {
      const wrapper = await mountComponent('slack')
      expect(wrapper.find('.border-t-2').exists()).toBe(true)
    })

    it('應包含 border-dashed 虛線邊框', async () => {
      const wrapper = await mountComponent('slack')
      expect(wrapper.find('.border-dashed').exists()).toBe(true)
    })
  })
})
