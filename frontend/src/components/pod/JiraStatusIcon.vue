<script setup lang="ts">
import { computed } from 'vue'
import JiraIcon from '@/components/icons/JiraIcon.vue'
import { useJiraStore } from '@/stores/jiraStore'
import { JIRA_CONNECTION_STATUS_CONFIG } from '@/utils/jiraUtils'
import type { PodJiraBinding } from '@/types/jira'

const props = defineProps<{
  jiraBinding: PodJiraBinding | null | undefined
  hasSlackBinding?: boolean
  hasTelegramBinding?: boolean
}>()

const jiraStore = useJiraStore()

const jiraApp = computed(() => {
  if (!props.jiraBinding) return undefined
  return jiraStore.getJiraAppById(props.jiraBinding.jiraAppId)
})

const positionStyle = computed(() => {
  const bindingsBefore = (props.hasSlackBinding ? 1 : 0) + (props.hasTelegramBinding ? 1 : 0)
  const rightPx = bindingsBefore === 0 ? -12 : -12 + bindingsBefore * 36
  return {
    top: '-12px',
    right: `${rightPx}px`,
  }
})

const bgClass = computed(() => {
  if (!jiraApp.value) return 'bg-gray-400'
  return JIRA_CONNECTION_STATUS_CONFIG[jiraApp.value.connectionStatus]?.bg ?? 'bg-gray-400'
})

const tooltip = computed(() => {
  if (!jiraApp.value) return 'Jira App 已移除'
  const label = JIRA_CONNECTION_STATUS_CONFIG[jiraApp.value.connectionStatus]?.label ?? '已斷線'
  return `Jira ${label}：${jiraApp.value.name}`
})
</script>

<template>
  <div
    v-if="jiraBinding"
    class="absolute w-8 h-8 rounded-full flex items-center justify-center border-2 border-black"
    :class="bgClass"
    :title="tooltip"
    :style="positionStyle"
  >
    <JiraIcon :size="18" />
  </div>
</template>
