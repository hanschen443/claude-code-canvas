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
import { useJiraStore } from '@/stores/jiraStore'
import { connectionStatusClass } from '@/utils/jiraUtils'

interface Props {
  open: boolean
}

defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const jiraStore = useJiraStore()

const showAddForm = ref(false)
const appName = ref('')
const siteUrl = ref('')
const email = ref('')
const apiToken = ref('')
const webhookSecret = ref('')
const isSubmitting = ref(false)
const submitError = ref('')

const nameError = computed(() => {
  if (appName.value === '') return '名稱不可為空'
  return ''
})

const siteUrlError = computed(() => {
  if (siteUrl.value === '') return 'Site URL 不可為空'
  if (!siteUrl.value.startsWith('https://')) return 'Site URL 必須以 https:// 開頭'
  return ''
})

const emailError = computed(() => {
  if (email.value === '') return 'Email 不可為空'
  return ''
})

const apiTokenError = computed(() => {
  if (apiToken.value === '') return 'API Token 不可為空'
  return ''
})

const webhookSecretError = computed(() => {
  if (webhookSecret.value === '') return 'Webhook Secret 不可為空'
  return ''
})

const isFormValid = computed(() => {
  return !nameError.value && !siteUrlError.value && !emailError.value && !apiTokenError.value && !webhookSecretError.value
})

const isDirty = computed(() => {
  return appName.value !== '' || siteUrl.value !== '' || email.value !== '' || apiToken.value !== '' || webhookSecret.value !== ''
})

const handleClose = (): void => {
  emit('update:open', false)
}

const handleOpenAddForm = (): void => {
  showAddForm.value = true
  submitError.value = ''
}

const handleCancelAddForm = (): void => {
  showAddForm.value = false
  resetForm()
}

const resetForm = (): void => {
  appName.value = ''
  siteUrl.value = ''
  email.value = ''
  apiToken.value = ''
  webhookSecret.value = ''
  submitError.value = ''
}

const handleConfirmAdd = async (): Promise<void> => {
  if (!isFormValid.value) return

  isSubmitting.value = true
  submitError.value = ''

  const result = await jiraStore.createJiraApp(
    appName.value,
    siteUrl.value,
    email.value,
    apiToken.value,
    webhookSecret.value
  )

  isSubmitting.value = false

  if (!result) return

  showAddForm.value = false
  resetForm()
}

const handleDeleteApp = async (appId: string): Promise<void> => {
  await jiraStore.deleteJiraApp(appId)
}
</script>

<template>
  <Dialog
    :open="open"
    @update:open="handleClose"
  >
    <DialogContent class="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Jira Apps 管理</DialogTitle>
        <DialogDescription>管理已註冊的 Jira App 與連線狀態</DialogDescription>
      </DialogHeader>

      <div class="space-y-3">
        <div
          v-if="jiraStore.jiraApps.length === 0 && !showAddForm"
          class="py-6 text-center text-sm text-muted-foreground"
        >
          尚未註冊任何 Jira App
        </div>

        <div
          v-for="app in jiraStore.jiraApps"
          :key="app.id"
          class="flex items-center gap-3 rounded-md border px-4 py-3"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="connectionStatusClass(app)"
          />

          <div class="flex flex-1 flex-col gap-1 overflow-hidden">
            <span class="font-semibold">{{ app.name }}</span>

            <div
              v-if="app.projects.length > 0"
              class="flex flex-wrap gap-1"
            >
              <span
                v-for="project in app.projects"
                :key="project.key"
                class="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
              >
                {{ project.key }}
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            class="shrink-0 text-destructive hover:text-destructive"
            @click="handleDeleteApp(app.id)"
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
              v-model="appName"
              placeholder="例如：My Jira App"
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
              v-model="siteUrl"
              placeholder="https://your-domain.atlassian.net"
            />
            <p
              v-if="isDirty && siteUrlError"
              class="text-xs text-red-500"
            >
              {{ siteUrlError }}
            </p>
          </div>

          <div class="space-y-1">
            <Input
              v-model="email"
              placeholder="your-email@example.com"
            />
            <p
              v-if="isDirty && emailError"
              class="text-xs text-red-500"
            >
              {{ emailError }}
            </p>
          </div>

          <div class="space-y-1">
            <Input
              v-model="apiToken"
              type="password"
              placeholder="Jira API Token"
            />
            <p
              v-if="isDirty && apiTokenError"
              class="text-xs text-red-500"
            >
              {{ apiTokenError }}
            </p>
          </div>

          <div class="space-y-1">
            <Input
              v-model="webhookSecret"
              type="password"
              placeholder="Webhook Secret"
            />
            <p
              v-if="isDirty && webhookSecretError"
              class="text-xs text-red-500"
            >
              {{ webhookSecretError }}
            </p>
          </div>

          <p
            v-if="submitError"
            class="text-xs text-red-500"
          >
            {{ submitError }}
          </p>

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
          新增 App
        </Button>
      </div>

      <DialogFooter />
    </DialogContent>
  </Dialog>
</template>
