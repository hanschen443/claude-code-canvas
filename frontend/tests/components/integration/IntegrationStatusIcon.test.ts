import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import type { IntegrationBinding, IntegrationApp } from '@/types/integration'

vi.mock('@/components/icons/SlackIcon.vue', () => ({
  default: { name: 'SlackIcon', template: '<svg data-testid="slack-icon" />', props: ['size'] },
}))
vi.mock('@/components/icons/TelegramIcon.vue', () => ({
  default: { name: 'TelegramIcon', template: '<svg data-testid="telegram-icon" />', props: ['size'] },
}))
vi.mock('@/components/icons/JiraIcon.vue', () => ({
  default: { name: 'JiraIcon', template: '<svg data-testid="jira-icon" />', props: ['size'] },
}))

function createMockBinding(provider: string, appId: string): IntegrationBinding {
  return {
    provider,
    appId,
    resourceId: 'res-1',
    extra: {},
  }
}

function createMockApp(provider: string, id: string, status: IntegrationApp['connectionStatus'] = 'connected'): IntegrationApp {
  return {
    id,
    name: `${provider} App`,
    connectionStatus: status,
    provider,
    resources: [],
    raw: {},
  }
}

async function mountComponent(bindings: IntegrationBinding[]) {
  const { default: IntegrationStatusIcon } = await import('@/components/integration/IntegrationStatusIcon.vue')

  return mount(IntegrationStatusIcon, {
    props: { bindings },
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
        }),
      ],
    },
  })
}

describe('IntegrationStatusIcon', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('渲染', () => {
    it('bindings 為空時不應渲染任何圖標', async () => {
      const wrapper = await mountComponent([])
      expect(wrapper.findAll('div')).toHaveLength(0)
    })

    it('單一 binding 應渲染一個圖標', async () => {
      const wrapper = await mountComponent([createMockBinding('slack', 'app-1')])
      const integrationStore = (await import('@/stores/integrationStore')).useIntegrationStore()
      integrationStore.apps['slack'] = [createMockApp('slack', 'app-1')]

      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('div')).toHaveLength(1)
    })

    it('多個 bindings 應渲染對應數量的圖標', async () => {
      const bindings = [
        createMockBinding('slack', 'app-1'),
        createMockBinding('telegram', 'app-2'),
      ]
      const wrapper = await mountComponent(bindings)
      const integrationStore = (await import('@/stores/integrationStore')).useIntegrationStore()
      integrationStore.apps['slack'] = [createMockApp('slack', 'app-1')]
      integrationStore.apps['telegram'] = [createMockApp('telegram', 'app-2')]

      await wrapper.vm.$nextTick()

      expect(wrapper.findAll('div')).toHaveLength(2)
    })
  })

  describe('位置計算', () => {
    it('第一個 binding 的 right 應為 -12px', async () => {
      const wrapper = await mountComponent([createMockBinding('slack', 'app-1')])
      const integrationStore = (await import('@/stores/integrationStore')).useIntegrationStore()
      integrationStore.apps['slack'] = [createMockApp('slack', 'app-1')]

      await wrapper.vm.$nextTick()

      const el = wrapper.find('div').element as HTMLElement
      expect(el.style.right).toBe('-12px')
      expect(el.style.top).toBe('-12px')
    })

    it('第二個 binding 的 right 應為 24px（-12 + 1 * 36）', async () => {
      const bindings = [
        createMockBinding('slack', 'app-1'),
        createMockBinding('telegram', 'app-2'),
      ]
      const wrapper = await mountComponent(bindings)
      const integrationStore = (await import('@/stores/integrationStore')).useIntegrationStore()
      integrationStore.apps['slack'] = [createMockApp('slack', 'app-1')]
      integrationStore.apps['telegram'] = [createMockApp('telegram', 'app-2')]

      await wrapper.vm.$nextTick()

      const divs = wrapper.findAll('div')
      const secondEl = divs[1]?.element as HTMLElement | undefined
      expect(secondEl?.style.right).toBe('24px')
    })

    it('第三個 binding 的 right 應為 60px（-12 + 2 * 36）', async () => {
      const bindings = [
        createMockBinding('slack', 'app-1'),
        createMockBinding('telegram', 'app-2'),
        createMockBinding('jira', 'app-3'),
      ]
      const wrapper = await mountComponent(bindings)
      const integrationStore = (await import('@/stores/integrationStore')).useIntegrationStore()
      integrationStore.apps['slack'] = [createMockApp('slack', 'app-1')]
      integrationStore.apps['telegram'] = [createMockApp('telegram', 'app-2')]
      integrationStore.apps['jira'] = [createMockApp('jira', 'app-3')]

      await wrapper.vm.$nextTick()

      const divs = wrapper.findAll('div')
      const thirdEl = divs[2]?.element as HTMLElement | undefined
      expect(thirdEl?.style.right).toBe('60px')
    })
  })

  describe('背景色', () => {
    it('App 已連接時應使用 connected 背景色', async () => {
      const wrapper = await mountComponent([createMockBinding('slack', 'app-1')])
      const integrationStore = (await import('@/stores/integrationStore')).useIntegrationStore()
      integrationStore.apps['slack'] = [createMockApp('slack', 'app-1', 'connected')]

      await wrapper.vm.$nextTick()

      const el = wrapper.find('div')
      expect(el.classes()).toContain('bg-white')
    })

    it('App 已斷線時應使用 disconnected 背景色', async () => {
      const wrapper = await mountComponent([createMockBinding('slack', 'app-1')])
      const integrationStore = (await import('@/stores/integrationStore')).useIntegrationStore()
      integrationStore.apps['slack'] = [createMockApp('slack', 'app-1', 'disconnected')]

      await wrapper.vm.$nextTick()

      const el = wrapper.find('div')
      expect(el.classes()).toContain('bg-red-100')
    })

    it('App 不存在時應使用 bg-gray-400', async () => {
      const wrapper = await mountComponent([createMockBinding('slack', 'non-existent')])

      await wrapper.vm.$nextTick()

      const el = wrapper.find('div')
      expect(el.classes()).toContain('bg-gray-400')
    })
  })

  describe('tooltip', () => {
    it('App 存在時 tooltip 應包含 provider label、狀態和 App 名稱', async () => {
      const wrapper = await mountComponent([createMockBinding('slack', 'app-1')])
      const integrationStore = (await import('@/stores/integrationStore')).useIntegrationStore()
      integrationStore.apps['slack'] = [createMockApp('slack', 'app-1', 'connected')]

      await wrapper.vm.$nextTick()

      const el = wrapper.find('div')
      expect(el.attributes('title')).toContain('Slack')
      expect(el.attributes('title')).toContain('已連接')
      expect(el.attributes('title')).toContain('slack App')
    })

    it('App 不存在時 tooltip 應顯示已移除提示', async () => {
      const wrapper = await mountComponent([createMockBinding('slack', 'non-existent')])

      await wrapper.vm.$nextTick()

      const el = wrapper.find('div')
      expect(el.attributes('title')).toContain('Slack App 已移除')
    })
  })
})
