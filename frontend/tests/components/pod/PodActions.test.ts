import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import { Eraser } from 'lucide-vue-next'
import PodActions from '@/components/pod/PodActions.vue'

vi.mock('@/components/ui/dialog', () => ({
  Dialog: { name: 'Dialog', template: '<div><slot /></div>', props: ['open'] },
  DialogContent: { name: 'DialogContent', template: '<div><slot /></div>' },
  DialogHeader: { name: 'DialogHeader', template: '<div><slot /></div>' },
  DialogTitle: { name: 'DialogTitle', template: '<div><slot /></div>' },
  DialogDescription: { name: 'DialogDescription', template: '<div><slot /></div>' },
  DialogFooter: { name: 'DialogFooter', template: '<div><slot /></div>' },
}))

vi.mock('@/components/ui/button', () => ({
  Button: { name: 'Button', template: '<button><slot /></button>', props: ['variant', 'disabled'] },
}))

const defaultProps = {
  podId: 'pod-1',
  podName: '測試 Pod',
  isSourcePod: true,
  showScheduleButton: false,
  isMultiInstanceEnabled: false,
  isLoadingDownstream: false,
  isClearing: false,
  isWorkflowRunning: false,
  downstreamPods: [],
  showClearDialog: false,
  showDeleteDialog: false,
  hasSchedule: false,
  scheduleEnabled: false,
  scheduleTooltip: '',
}

function mountPodActions(propsOverrides: Partial<typeof defaultProps> = {}) {
  return mount(PodActions, {
    props: { ...defaultProps, ...propsOverrides },
    global: {
      plugins: [
        createTestingPinia({ createSpy: vi.fn, stubActions: true }),
      ],
    },
    attachTo: document.body,
  })
}

function findEraserButton(wrapper: ReturnType<typeof mountPodActions>) {
  return wrapper.find('.workflow-clear-button-in-group')
}

describe('PodActions Eraser 按鈕顯示邏輯', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('isMultiInstanceEnabled=false + isSourcePod=true 時顯示 Eraser 圖標', () => {
    const wrapper = mountPodActions({ isMultiInstanceEnabled: false, isSourcePod: true })
    const eraser = findEraserButton(wrapper)

    expect(eraser.exists()).toBe(true)
    expect(wrapper.findComponent(Eraser).exists()).toBe(true)
    expect(wrapper.find('.multi-instance-icon-m').exists()).toBe(false)
    wrapper.unmount()
  })

  it('isMultiInstanceEnabled=true + isSourcePod=true 時顯示 M 字母', () => {
    const wrapper = mountPodActions({ isMultiInstanceEnabled: true, isSourcePod: true })
    const iconM = wrapper.find('.multi-instance-icon-m')

    expect(iconM.exists()).toBe(true)
    expect(iconM.text()).toBe('M')
    expect(wrapper.findComponent(Eraser).exists()).toBe(false)
    wrapper.unmount()
  })

  it('isMultiInstanceEnabled=true 時 eraser 按鈕應帶有 multi-instance-enabled class', () => {
    const wrapper = mountPodActions({ isMultiInstanceEnabled: true, isSourcePod: true })
    const eraser = findEraserButton(wrapper)

    expect(eraser.classes()).toContain('multi-instance-enabled')
    wrapper.unmount()
  })

  it('isMultiInstanceEnabled=false 時 eraser 按鈕不應帶有 multi-instance-enabled class', () => {
    const wrapper = mountPodActions({ isMultiInstanceEnabled: false, isSourcePod: true })
    const eraser = findEraserButton(wrapper)

    expect(eraser.classes()).not.toContain('multi-instance-enabled')
    wrapper.unmount()
  })

  it('isSourcePod=false 時不應出現 .workflow-clear-button-in-group 按鈕', () => {
    const wrapper = mountPodActions({ isSourcePod: false })
    const eraser = findEraserButton(wrapper)

    expect(eraser.exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('PodActions 橡皮擦按鈕 isWorkflowRunning 行為', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('[High] isWorkflowRunning=true 時橡皮擦按鈕應被禁用', () => {
    it('isWorkflowRunning=true 時橡皮擦按鈕應有 disabled attribute', () => {
      const wrapper = mountPodActions({ isWorkflowRunning: true })
      const eraser = findEraserButton(wrapper)

      expect(eraser.attributes('disabled')).toBeDefined()
      wrapper.unmount()
    })

    it('isWorkflowRunning=true 時按下橡皮擦不應 emit clear-workflow', async () => {
      const wrapper = mountPodActions({ isWorkflowRunning: true })
      const eraser = findEraserButton(wrapper)

      await eraser.trigger('mousedown', { clientX: 0, clientY: 0 })
      await eraser.trigger('mouseup')

      expect(wrapper.emitted('clear-workflow')).toBeFalsy()
      wrapper.unmount()
    })

    it('isWorkflowRunning=true 時長按橡皮擦不應 emit toggle-multi-instance', async () => {
      vi.useFakeTimers()
      const wrapper = mountPodActions({ isWorkflowRunning: true })
      const eraser = findEraserButton(wrapper)

      await eraser.trigger('mousedown', { clientX: 0, clientY: 0 })
      vi.advanceTimersByTime(600)
      await wrapper.vm.$nextTick()

      expect(wrapper.emitted('toggle-multi-instance')).toBeFalsy()

      vi.useRealTimers()
      wrapper.unmount()
    })
  })

  describe('[High] isWorkflowRunning=false 時橡皮擦按鈕正常可用', () => {
    it('isWorkflowRunning=false 時橡皮擦按鈕不應被 disabled', () => {
      const wrapper = mountPodActions({ isWorkflowRunning: false })
      const eraser = findEraserButton(wrapper)

      expect(eraser.attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    })
  })

  describe('[Medium] isWorkflowRunning 狀態變化', () => {
    it('isWorkflowRunning 從 true 變為 false 後橡皮擦應恢復可用', async () => {
      const wrapper = mountPodActions({ isWorkflowRunning: true })
      const eraser = findEraserButton(wrapper)

      expect(eraser.attributes('disabled')).toBeDefined()

      await wrapper.setProps({ isWorkflowRunning: false })

      expect(eraser.attributes('disabled')).toBeUndefined()
      wrapper.unmount()
    })
  })
})
