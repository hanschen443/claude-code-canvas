<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { PodProvider } from "@/types/pod";

const props = defineProps<{
  podId: string;
  podRotation: number;
  activeCount: number;
  provider: PodProvider;
  /** 僅 capability gate：當前 provider 完全不支援 plugin 才為 true。
   *  Pod busy 不影響 notch click — busy 鎖只在 popover 內 Toggle 層級。
   *  目前兩個 provider plugin: true，故實際恆為 false，保留欄位以利擴充。 */
  capabilityDisabled: boolean;
  disabledTooltip: string;
}>();

const emit = defineEmits<{
  (e: "click", event: MouseEvent): void;
}>();

const { t } = useI18n();

const handleClick = (event: MouseEvent): void => {
  if (props.capabilityDisabled) return;
  emit("click", event);
};

/**
 * 僅 codex 走唯讀 label（不顯示數字，有啟用就算啟用，細節點開 popover 看）；
 * 其他 provider（含 gemini）顯示 (activeCount)，讓使用者在 notch 上就能看到啟用數。
 */
const pluginLabel = computed(() =>
  props.provider === "codex"
    ? t("pod.slot.pluginsLabel")
    : `${t("pod.slot.pluginsLabel")} (${props.activeCount})`,
);
</script>

<template>
  <div class="pod-plugin-notch-area">
    <button
      :class="[
        'pod-plugin-slot',
        // Codex 專屬唯讀樣式，Gemini / Claude 不套用；
        // Gemini / Claude 依 activeCount 決定是否套 pod-plugin-slot--active。
        provider === 'codex'
          ? 'pod-plugin-slot--codex'
          : activeCount > 0
            ? 'pod-plugin-slot--active'
            : '',
      ]"
      :aria-disabled="capabilityDisabled || undefined"
      :title="capabilityDisabled ? disabledTooltip : undefined"
      @click="handleClick"
    >
      <span class="text-xs font-mono">
        {{ pluginLabel }}
      </span>
    </button>
  </div>
</template>
