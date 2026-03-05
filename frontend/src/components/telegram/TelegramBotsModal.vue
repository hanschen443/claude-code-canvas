<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Plus } from 'lucide-vue-next'
import { useTelegramStore } from '@/stores/telegramStore'
import { connectionStatusClass } from '@/utils/telegramUtils'
import type { TelegramChat } from '@/types/telegram'

interface Props {
  open: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const telegramStore = useTelegramStore()

const showAddForm = ref(false)
const botName = ref('')
const botToken = ref('')
const isSubmitting = ref(false)

const nameError = computed(() => {
  if (botName.value === '') return '名稱不可為空'
  return ''
})

const botTokenError = computed(() => {
  if (botToken.value === '') return 'Bot Token 不可為空'
  return ''
})

const isFormValid = computed(() => {
  return !nameError.value && !botTokenError.value
})

const isDirty = computed(() => {
  return botName.value !== '' || botToken.value !== ''
})

const getChatDisplayName = (chat: TelegramChat): string => {
  if (chat.type === 'private') return `@${chat.username ?? ''}`
  return chat.title ?? ''
}

const handleClose = (): void => {
  emit('update:open', false)
}

const handleOpenAddForm = (): void => {
  showAddForm.value = true
}

const handleCancelAddForm = (): void => {
  showAddForm.value = false
  resetForm()
}

const resetForm = (): void => {
  botName.value = ''
  botToken.value = ''
}

const handleConfirmAdd = async (): Promise<void> => {
  if (!isFormValid.value) return

  isSubmitting.value = true

  const result = await telegramStore.createTelegramBot(botName.value, botToken.value)

  isSubmitting.value = false

  if (!result) return

  showAddForm.value = false
  resetForm()
}

const handleDeleteBot = async (botId: string): Promise<void> => {
  await telegramStore.deleteTelegramBot(botId)
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="handleClose"
  >
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Telegram Bots 管理</DialogTitle>
        <DialogDescription>管理已註冊的 Telegram Bot 與連線狀態</DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <div
          v-if="telegramStore.telegramBots.length === 0 && !showAddForm"
          class="py-6 text-center text-sm text-muted-foreground"
        >
          尚未註冊任何 Telegram Bot
        </div>

        <div
          v-for="bot in telegramStore.telegramBots"
          :key="bot.id"
          class="flex items-center gap-3 rounded-md border px-4 py-3"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="connectionStatusClass(bot)"
          />

          <div class="flex flex-1 flex-col gap-1 overflow-hidden">
            <span class="font-semibold">{{ bot.name }}</span>

            <div
              v-if="bot.chats.length > 0"
              class="flex flex-wrap gap-1"
            >
              <span
                v-for="chat in bot.chats"
                :key="chat.id"
                class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {{ getChatDisplayName(chat) }}
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0 text-destructive hover:text-destructive"
            @click="handleDeleteBot(bot.id)"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>

        <div
          v-if="showAddForm"
          class="space-y-3 rounded-md border px-4 py-3"
        >
          <div class="space-y-1">
            <Input
              v-model="botName"
              placeholder="例如：My Telegram Bot"
            />
            <p
              v-if="isDirty && nameError"
              class="text-xs text-red-500"
            >
              {{ nameError }}
            </p>
          </div>

          <div class="space-y-1">
            <Input
              v-model="botToken"
              type="password"
              placeholder="123456:ABC-DEF..."
            />
            <p
              v-if="isDirty && botTokenError"
              class="text-xs text-red-500"
            >
              {{ botTokenError }}
            </p>
          </div>

          <div class="flex justify-end gap-2">
            <Button
              variant="outline"
              @click="handleCancelAddForm"
            >
              取消
            </Button>
            <Button
              variant="default"
              :disabled="isSubmitting || !isFormValid"
              @click="handleConfirmAdd"
            >
              {{ isSubmitting ? '連線中...' : '確認新增' }}
            </Button>
          </div>
        </div>

        <Button
          v-if="!showAddForm"
          variant="outline"
          class="w-full"
          @click="handleOpenAddForm"
        >
          <Plus class="size-4" />
          新增 Bot
        </Button>
      </div>

      <DialogFooter />
    </DialogContent>
  </Dialog>
</template>
