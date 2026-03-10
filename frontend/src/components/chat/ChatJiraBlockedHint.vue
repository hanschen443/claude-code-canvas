<template>
  <div class="p-4 border-t-2 border-doodle-ink">
    <div
      class="border-2 border-dashed border-doodle-ink rounded-lg"
      data-testid="jira-blocked-hint"
    >
      <div class="flex items-center justify-center gap-2 py-4">
        <JiraIcon :size="16" />
        <p class="text-sm font-mono text-muted-foreground">
          此 Pod 已連接 Jira，訊息由 Jira 驅動
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import JiraIcon from '@/components/icons/JiraIcon.vue'
</script>
