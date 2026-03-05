<script setup lang="ts">
import { computed } from 'vue'
import TelegramIcon from '@/components/icons/TelegramIcon.vue'
import { useTelegramStore } from '@/stores/telegramStore'
import { TELEGRAM_CONNECTION_STATUS_CONFIG } from '@/utils/telegramUtils'
import type { PodTelegramBinding } from '@/types/telegram'

const props = defineProps<{
  telegramBinding: PodTelegramBinding | null | undefined
  hasSlackBinding?: boolean
}>()

const telegramStore = useTelegramStore()

const telegramBot = computed(() => {
  if (!props.telegramBinding) return undefined
  return telegramStore.getTelegramBotById(props.telegramBinding.telegramBotId)
})

const positionStyle = computed(() => ({
  top: '-12px',
  right: props.hasSlackBinding ? '24px' : '-12px',
}))

const bgClass = computed(() => {
  if (!telegramBot.value) return 'bg-gray-400'
  return TELEGRAM_CONNECTION_STATUS_CONFIG[telegramBot.value.connectionStatus]?.bg ?? 'bg-gray-400'
})

const tooltip = computed(() => {
  if (!telegramBot.value) return 'Telegram Bot 已移除'
  const label = TELEGRAM_CONNECTION_STATUS_CONFIG[telegramBot.value.connectionStatus]?.label ?? '已斷線'
  return `Telegram ${label}：${telegramBot.value.name}`
})
</script>

<template>
  <div
    v-if="telegramBinding"
    class="absolute w-8 h-8 rounded-full flex items-center justify-center border-2 border-black"
    :class="bgClass"
    :title="tooltip"
    :style="positionStyle"
  >
    <TelegramIcon :size="18" />
  </div>
</template>
