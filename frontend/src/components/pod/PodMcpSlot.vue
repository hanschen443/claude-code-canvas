<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { PodProvider } from "@/types/pod";

const props = defineProps<{
  podId: string;
  podRotation: number;
  activeCount: number;
  provider: PodProvider;
  /** 僅 capability gate：當前 provider 完全不支援 MCP 才為 true。
   *  Pod busy 不影響 notch click — busy 鎖只在 popover 內 Toggle 層級。 */
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

/** Codex：不顯示數字（有就是啟用，數量點開 popover 看）；Claude：顯示啟用數 */
const mcpLabel = computed(() =>
  props.provider === "codex"
    ? t("pod.slot.mcpLabel")
    : `${t("pod.slot.mcpLabel")} (${props.activeCount})`,
);

/**
 * 反向旋轉 button，使文字在 Pod 旋轉時仍保持可讀。
 * 例如 Pod 旋轉 5deg，button 反轉 -5deg 讓標籤維持水平。
 */
const buttonStyle = computed(() => ({
  transform: `rotate(${-props.podRotation}deg)`,
}));
</script>

<template>
  <div class="pod-mcp-notch-area">
    <button
      :class="[
        'pod-mcp-slot',
        provider === 'codex'
          ? 'pod-mcp-slot--codex'
          : activeCount > 0
            ? 'pod-mcp-slot--active'
            : '',
      ]"
      :style="buttonStyle"
      :aria-disabled="capabilityDisabled || undefined"
      :title="capabilityDisabled ? disabledTooltip : undefined"
      @click="handleClick"
    >
      <span class="text-xs font-mono">
        {{ mcpLabel }}
      </span>
    </button>
  </div>
</template>
