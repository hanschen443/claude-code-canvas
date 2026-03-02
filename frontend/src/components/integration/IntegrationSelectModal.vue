<script setup lang="ts">
import { type Component } from 'vue'
import SlackIcon from '@/components/icons/SlackIcon.vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface IntegrationCategory {
  id: string
  name: string
  description: string
  icon: Component
}

interface Props {
  open: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [category: string]
}>()

const categories: IntegrationCategory[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: '管理 Slack App 連線與設定',
    icon: SlackIcon,
  },
]

const handleSelect = (categoryId: string): void => {
  emit('update:open', false)
  emit('select', categoryId)
}

const handleClose = (): void => {
  emit('update:open', false)
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="handleClose"
  >
    <DialogContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>整合服務</DialogTitle>
        <DialogDescription>選擇要管理的整合服務</DialogDescription>
      </DialogHeader>

      <div class="space-y-2 py-2">
        <button
          v-for="category in categories"
          :key="category.id"
          class="flex w-full cursor-pointer items-center gap-4 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-accent"
          @click="handleSelect(category.id)"
        >
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted">
            <component
              :is="category.icon"
              class="h-5 w-5"
            />
          </span>
          <div class="flex flex-col gap-0.5 text-left">
            <span class="text-sm font-semibold">{{ category.name }}</span>
            <span class="text-xs text-muted-foreground">{{ category.description }}</span>
          </div>
        </button>
      </div>
    </DialogContent>
  </Dialog>
</template>
