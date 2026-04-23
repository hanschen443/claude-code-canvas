import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { PodProvider, ProviderCapabilities } from "@/types/pod";
import {
  CLAUDE_FALLBACK_CAPABILITIES,
  CODEX_FALLBACK_CAPABILITIES,
} from "@/constants/providerDefaults";
import {
  createWebSocketRequest,
  WebSocketRequestEvents,
  WebSocketResponseEvents,
} from "@/services/websocket";
import { useToast } from "@/composables/useToast";

/** provider:list 回應的單一 Provider 資料結構 */
interface ProviderListItem {
  name: PodProvider;
  capabilities: ProviderCapabilities;
}

/** provider:list:result 回應格式 */
interface ProviderListResultPayload {
  requestId?: string;
  success?: boolean;
  error?: string;
  providers: ProviderListItem[];
}

/** provider:list 請求格式 */
interface ProviderListPayload {
  requestId: string;
}

export const useProviderCapabilityStore = defineStore(
  "providerCapability",
  () => {
    // ---- State ----

    /** 各 Provider 的功能能力，初值為 fallback */
    const capabilitiesByProvider = ref<
      Record<PodProvider, ProviderCapabilities>
    >({
      claude: { ...CLAUDE_FALLBACK_CAPABILITIES },
      codex: { ...CODEX_FALLBACK_CAPABILITIES },
    });

    /** 是否已從後端成功載入一次 */
    const loaded = ref<boolean>(false);

    // ---- Getters ----

    /**
     * 取得指定 Provider 的能力表
     * 若 provider 不存在於 state，退回 claude fallback
     */
    const getCapabilities = computed(
      () =>
        (provider: PodProvider): ProviderCapabilities => {
          return (
            capabilitiesByProvider.value[provider] ?? {
              ...CLAUDE_FALLBACK_CAPABILITIES,
            }
          );
        },
    );

    /**
     * 查詢特定 Provider 的某項能力是否啟用
     */
    const isCapabilityEnabled = computed(
      () =>
        (provider: PodProvider, key: keyof ProviderCapabilities): boolean => {
          return capabilitiesByProvider.value[provider]?.[key] ?? false;
        },
    );

    // ---- Actions ----

    /**
     * 把後端回傳的 providers 陣列寫入 state
     */
    function syncFromPayload(providers: ProviderListItem[]): void {
      for (const { name, capabilities } of providers) {
        capabilitiesByProvider.value[name] = { ...capabilities };
      }
    }

    /**
     * 透過 WebSocket 向後端載入 provider capabilities
     * 失敗時維持 fallback，並顯示警告 toast
     */
    async function loadFromBackend(): Promise<void> {
      const { toast } = useToast();

      try {
        const response = await createWebSocketRequest<
          ProviderListPayload,
          ProviderListResultPayload
        >({
          requestEvent: WebSocketRequestEvents.PROVIDER_LIST,
          responseEvent: WebSocketResponseEvents.PROVIDER_LIST_RESULT,
          payload: {},
        });

        if (response.providers?.length) {
          syncFromPayload(response.providers);
        }

        loaded.value = true;
      } catch {
        // 失敗時維持 fallback，僅顯示提示，不中斷流程
        toast({
          title: "Provider",
          description: "無法取得 provider capabilities，部分功能可能不正常",
          variant: "destructive",
        });
      }
    }

    return {
      capabilitiesByProvider,
      loaded,
      getCapabilities,
      isCapabilityEnabled,
      syncFromPayload,
      loadFromBackend,
    };
  },
);
