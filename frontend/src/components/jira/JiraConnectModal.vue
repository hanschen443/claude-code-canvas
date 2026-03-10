<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { useJiraStore } from '@/stores/jiraStore'
import { usePodStore } from '@/stores'
import { connectionStatusClass } from '@/utils/jiraUtils'
import type { JiraApp } from '@/types/jira'

interface Props {
  open: boolean
  podId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const jiraStore = useJiraStore()
const podStore = usePodStore()

const selectedAppId = ref<string | null>(null)
const selectedProjectKey = ref<string | null>(null)

const selectedApp = computed<JiraApp | undefined>(() =>
  selectedAppId.value ? jiraStore.getJiraAppById(selectedAppId.value) : undefined
)

const isConfirmDisabled = computed<boolean>(() =>
  jiraStore.jiraApps.length === 0 || !selectedAppId.value || !selectedProjectKey.value
)

watch(
  () => props.open,
  (newOpen) => {
    if (!newOpen) {
      selectedAppId.value = null
      selectedProjectKey.value = null
      return
    }

    const pod = podStore.getPodById(props.podId)
    if (pod?.jiraBinding) {
      selectedAppId.value = pod.jiraBinding.jiraAppId
      selectedProjectKey.value = pod.jiraBinding.jiraProjectKey
    } else {
      selectedAppId.value = null
      selectedProjectKey.value = null
    }
  }
)

watch(selectedAppId, () => {
  selectedProjectKey.value = null
})

const handleConfirm = async (): Promise<void> => {
  if (!selectedAppId.value || !selectedProjectKey.value) return

  await jiraStore.bindJiraToPod(props.podId, selectedAppId.value, selectedProjectKey.value)
  emit('update:open', false)
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
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>連接 Jira</DialogTitle>
        <DialogDescription>選擇要與此 Pod 連接的 Jira App 和 Project</DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div
          v-if="jiraStore.jiraApps.length === 0"
          class="py-4 text-sm text-muted-foreground"
        >
          尚未有可用的 Jira App，請先前往管理介面新增
        </div>

        <template v-else>
          <div class="space-y-2">
            <Label>選擇 App</Label>
            <RadioGroup
              v-model="selectedAppId"
              class="space-y-2"
            >
              <div
                v-for="app in jiraStore.jiraApps"
                :key="app.id"
                class="flex items-center gap-3"
              >
                <RadioGroupItem
                  :id="`app-${app.id}`"
                  :value="app.id"
                />
                <Label
                  :for="`app-${app.id}`"
                  class="flex items-center gap-2 font-normal cursor-pointer"
                >
                  <span
                    class="size-2 shrink-0 rounded-full"
                    :class="connectionStatusClass(app)"
                  />
                  {{ app.name }}
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div
            v-if="selectedApp"
            class="space-y-2"
          >
            <Label>選擇 Project</Label>
            <div
              v-if="selectedApp.projects.length === 0"
              class="text-sm text-muted-foreground"
            >
              此 App 尚無可用 Project
            </div>
            <RadioGroup
              v-else
              v-model="selectedProjectKey"
              class="space-y-2"
            >
              <div
                v-for="project in selectedApp.projects"
                :key="project.key"
                class="flex items-center gap-3"
              >
                <RadioGroupItem
                  :id="`project-${project.key}`"
                  :value="project.key"
                />
                <Label
                  :for="`project-${project.key}`"
                  class="font-normal cursor-pointer"
                >
                  {{ project.key }} - {{ project.name }}
                </Label>
              </div>
            </RadioGroup>
          </div>
        </template>
      </div>

      <DialogFooter>
        <Button
          variant="outline"
          @click="handleClose"
        >
          取消
        </Button>
        <Button
          variant="default"
          :disabled="isConfirmDisabled"
          @click="handleConfirm"
        >
          確認
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
