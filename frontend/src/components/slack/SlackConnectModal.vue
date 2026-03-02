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
import { useSlackStore } from '@/stores/slackStore'
import { usePodStore } from '@/stores'
import { connectionStatusClass } from '@/utils/slackUtils'
import type { SlackApp } from '@/types/slack'

interface Props {
  open: boolean
  podId: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const slackStore = useSlackStore()
const podStore = usePodStore()

const selectedAppId = ref<string | null>(null)
const selectedChannelId = ref<string | null>(null)

const selectedApp = computed<SlackApp | undefined>(() =>
  selectedAppId.value ? slackStore.getSlackAppById(selectedAppId.value) : undefined
)

const isConfirmDisabled = computed<boolean>(() =>
  slackStore.slackApps.length === 0 || !selectedAppId.value || !selectedChannelId.value
)

watch(
  () => props.open,
  (newOpen) => {
    if (!newOpen) {
      selectedAppId.value = null
      selectedChannelId.value = null
      return
    }

    const pod = podStore.getPodById(props.podId)
    if (pod?.slackBinding) {
      selectedAppId.value = pod.slackBinding.slackAppId
      selectedChannelId.value = pod.slackBinding.slackChannelId
    } else {
      selectedAppId.value = null
      selectedChannelId.value = null
    }
  }
)

watch(selectedAppId, () => {
  selectedChannelId.value = null
})

const handleConfirm = async (): Promise<void> => {
  if (!selectedAppId.value || !selectedChannelId.value) return

  await slackStore.bindSlackToPod(props.podId, selectedAppId.value, selectedChannelId.value)
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
        <DialogTitle>連接 Slack</DialogTitle>
        <DialogDescription>選擇要與此 Pod 連接的 Slack App 和頻道</DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div
          v-if="slackStore.slackApps.length === 0"
          class="py-4 text-sm text-muted-foreground"
        >
          尚未有可用的 Slack App，請先前往管理介面新增
        </div>

        <template v-else>
          <div class="space-y-2">
            <Label>選擇 App</Label>
            <RadioGroup
              v-model="selectedAppId"
              class="space-y-2"
            >
              <div
                v-for="app in slackStore.slackApps"
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
            <Label>選擇頻道</Label>
            <div
              v-if="selectedApp.channels.length === 0"
              class="text-sm text-muted-foreground"
            >
              此 App 尚無可用頻道
            </div>
            <RadioGroup
              v-else
              v-model="selectedChannelId"
              class="space-y-2"
            >
              <div
                v-for="channel in selectedApp.channels"
                :key="channel.id"
                class="flex items-center gap-3"
              >
                <RadioGroupItem
                  :id="`channel-${channel.id}`"
                  :value="channel.id"
                />
                <Label
                  :for="`channel-${channel.id}`"
                  class="font-normal cursor-pointer"
                >
                  #{{ channel.name }}
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
