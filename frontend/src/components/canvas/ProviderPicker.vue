<script setup lang="ts">
// Provider 選擇器：讓使用者選擇 Claude 或 Codex 作為新 Pod 的 provider
import AnthropicLogo from "@/components/icons/AnthropicLogo.vue";
import OpenAILogo from "@/components/icons/OpenAILogo.vue";
import type { PodProvider, ProviderConfig } from "@/types/pod";
import {
  CLAUDE_DEFAULT_MODEL,
  CODEX_DEFAULT_MODEL,
} from "@/constants/providerDefaults";

const emit = defineEmits<{
  select: [payload: { provider: PodProvider; providerConfig: ProviderConfig }];
}>();

/** 選 Claude → 立即 emit select，帶預設 model，不做其他副作用 */
const handleSelectClaude = (): void => {
  emit("select", {
    provider: "claude",
    providerConfig: { provider: "claude", model: CLAUDE_DEFAULT_MODEL },
  });
};

/** 選 Codex → 立即 emit select，帶預設 model，不做其他副作用 */
const handleSelectCodex = (): void => {
  emit("select", {
    provider: "codex",
    providerConfig: { provider: "codex", model: CODEX_DEFAULT_MODEL },
  });
};
</script>

<template>
  <div class="pod-menu-submenu" @contextmenu.prevent>
    <!-- Claude 選項 -->
    <button
      class="pod-menu-submenu-item flex items-center gap-3"
      @click="handleSelectClaude"
    >
      <span
        class="w-8 h-8 rounded-full flex items-center justify-center border border-doodle-ink bg-white flex-shrink-0"
      >
        <AnthropicLogo :size="16" />
      </span>
      <span class="font-mono">Claude</span>
    </button>

    <!-- Codex 選項 -->
    <button
      class="pod-menu-submenu-item flex items-center gap-3"
      @click="handleSelectCodex"
    >
      <span
        class="w-8 h-8 rounded-full flex items-center justify-center border border-doodle-ink bg-white flex-shrink-0"
      >
        <OpenAILogo :size="16" class="text-black" />
      </span>
      <span class="font-mono">Codex</span>
    </button>
  </div>
</template>
