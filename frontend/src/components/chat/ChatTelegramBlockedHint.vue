<template>
  <div class="p-4 border-t-2 border-doodle-ink">
    <div
      class="border-2 border-dashed border-doodle-ink rounded-lg"
      data-testid="telegram-blocked-hint"
    >
      <div class="flex items-center justify-center gap-2 py-4">
        <TelegramIcon :size="16" />
        <p class="text-sm font-mono text-muted-foreground">
          此 Pod 已連接 Telegram，訊息由 Telegram 驅動
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import TelegramIcon from '@/components/icons/TelegramIcon.vue'
</script>
