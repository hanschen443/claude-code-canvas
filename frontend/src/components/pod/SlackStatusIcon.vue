<script setup lang="ts">
import { computed } from 'vue'
import SlackIcon from '@/components/icons/SlackIcon.vue'
import { useSlackStore } from '@/stores/slackStore'
import type { PodSlackBinding, SlackAppConnectionStatus } from '@/types/slack'

const props = defineProps<{
  slackBinding: PodSlackBinding | null | undefined
}>()

const CONNECTION_STATUS_CONFIG: Record<SlackAppConnectionStatus, { bg: string; label: string }> = {
  connected: { bg: 'bg-white', label: '已連接' },
  disconnected: { bg: 'bg-red-100', label: '已斷線' },
  connecting: { bg: 'bg-white', label: '連線中' },
  error: { bg: 'bg-red-100', label: '錯誤' },
}

const slackStore = useSlackStore()

const slackApp = computed(() => {
  if (!props.slackBinding) return undefined
  return slackStore.getSlackAppById(props.slackBinding.slackAppId)
})

const bgClass = computed(() => {
  if (!slackApp.value) return 'bg-gray-400'
  return CONNECTION_STATUS_CONFIG[slackApp.value.connectionStatus]?.bg ?? 'bg-gray-400'
})

const tooltip = computed(() => {
  if (!slackApp.value) return 'Slack App 已移除'
  const label = CONNECTION_STATUS_CONFIG[slackApp.value.connectionStatus]?.label ?? '已斷線'
  return `Slack ${label}：${slackApp.value.name}`
})
</script>

<template>
  <div
    v-if="slackBinding"
    class="absolute w-8 h-8 rounded-full flex items-center justify-center border-2 border-black"
    :class="bgClass"
    :title="tooltip"
    style="top: -12px; right: -12px;"
  >
    <SlackIcon :size="18" />
  </div>
</template>
