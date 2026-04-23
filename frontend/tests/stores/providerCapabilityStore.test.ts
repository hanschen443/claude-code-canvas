import { describe, it, expect, vi } from "vitest";
import {
  webSocketMockFactory,
  mockCreateWebSocketRequest,
} from "../helpers/mockWebSocket";
import { setupStoreTest } from "../helpers/testSetup";
import { useProviderCapabilityStore } from "@/stores/providerCapabilityStore";
import {
  CLAUDE_FALLBACK_CAPABILITIES,
  CODEX_FALLBACK_CAPABILITIES,
} from "@/constants/providerDefaults";

// Mock WebSocket（保留真實事件常數）
vi.mock("@/services/websocket", () => webSocketMockFactory());

// Mock useToast，存取 toast spy 供斷言使用
const mockToast = vi.fn();
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    toast: mockToast,
    showSuccessToast: vi.fn(),
    showErrorToast: vi.fn(),
  }),
}));

describe("providerCapabilityStore", () => {
  // 每次測試前重置 Pinia、WebSocket mock、所有 spy
  setupStoreTest();

  // ----------------------------------------------------------------
  // 初始 State
  // ----------------------------------------------------------------
  describe("初始狀態", () => {
    it("loaded 應為 false", () => {
      const store = useProviderCapabilityStore();

      expect(store.loaded).toBe(false);
    });

    it("capabilitiesByProvider.claude 應等於 CLAUDE_FALLBACK_CAPABILITIES", () => {
      const store = useProviderCapabilityStore();

      expect(store.capabilitiesByProvider.claude).toEqual(
        CLAUDE_FALLBACK_CAPABILITIES,
      );
    });

    it("capabilitiesByProvider.codex 應等於 CODEX_FALLBACK_CAPABILITIES（僅 chat 為 true）", () => {
      const store = useProviderCapabilityStore();

      expect(store.capabilitiesByProvider.codex).toEqual(
        CODEX_FALLBACK_CAPABILITIES,
      );
      // 明確驗證 codex 僅開放 chat
      expect(store.capabilitiesByProvider.codex.chat).toBe(true);
      expect(store.capabilitiesByProvider.codex.runMode).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // syncFromPayload
  // ----------------------------------------------------------------
  describe("syncFromPayload", () => {
    it("應將傳入的 providers 陣列寫入 capabilitiesByProvider", () => {
      const store = useProviderCapabilityStore();

      // 傳入一組覆蓋 codex 的 fake capabilities（讓 runMode 變 true）
      store.syncFromPayload([
        {
          name: "codex",
          capabilities: {
            chat: true,
            outputStyle: false,
            skill: false,
            subAgent: false,
            repository: false,
            command: false,
            mcp: false,
            integration: false,
            runMode: true, // 與 fallback 不同，驗證覆蓋是否生效
          },
        },
      ]);

      expect(store.capabilitiesByProvider.codex.runMode).toBe(true);
    });

    it("多筆 providers 應全部寫入 state", () => {
      const store = useProviderCapabilityStore();

      store.syncFromPayload([
        {
          name: "claude",
          capabilities: {
            ...CLAUDE_FALLBACK_CAPABILITIES,
            skill: false, // 改成 false，驗證 claude 也被覆蓋
          },
        },
        {
          name: "codex",
          capabilities: {
            ...CODEX_FALLBACK_CAPABILITIES,
            chat: false, // 改成 false，驗證 codex 也被覆蓋
          },
        },
      ]);

      expect(store.capabilitiesByProvider.claude.skill).toBe(false);
      expect(store.capabilitiesByProvider.codex.chat).toBe(false);
    });
  });

  // ----------------------------------------------------------------
  // getCapabilities getter
  // ----------------------------------------------------------------
  describe("getCapabilities", () => {
    it("應取回 codex 對應的 capabilities 物件", () => {
      const store = useProviderCapabilityStore();

      const caps = store.getCapabilities("codex");

      expect(caps).toEqual(CODEX_FALLBACK_CAPABILITIES);
    });

    it("應取回 claude 對應的 capabilities 物件", () => {
      const store = useProviderCapabilityStore();

      const caps = store.getCapabilities("claude");

      expect(caps).toEqual(CLAUDE_FALLBACK_CAPABILITIES);
    });
  });

  // ----------------------------------------------------------------
  // isCapabilityEnabled getter
  // ----------------------------------------------------------------
  describe("isCapabilityEnabled", () => {
    it("isCapabilityEnabled('codex', 'runMode') 應回傳 false", () => {
      const store = useProviderCapabilityStore();

      expect(store.isCapabilityEnabled("codex", "runMode")).toBe(false);
    });

    it("isCapabilityEnabled('claude', 'skill') 應回傳 true", () => {
      const store = useProviderCapabilityStore();

      expect(store.isCapabilityEnabled("claude", "skill")).toBe(true);
    });

    it("isCapabilityEnabled('codex', 'chat') 應回傳 true", () => {
      const store = useProviderCapabilityStore();

      expect(store.isCapabilityEnabled("codex", "chat")).toBe(true);
    });
  });

  // ----------------------------------------------------------------
  // loadFromBackend — 成功路徑
  // ----------------------------------------------------------------
  describe("loadFromBackend 成功路徑", () => {
    it("應以後端回傳的 providers 呼叫 syncFromPayload，且 loaded 變為 true", async () => {
      const store = useProviderCapabilityStore();

      // mock createWebSocketRequest 回傳含 providers 的成功回應
      mockCreateWebSocketRequest.mockResolvedValueOnce({
        providers: [
          {
            name: "codex",
            capabilities: {
              ...CODEX_FALLBACK_CAPABILITIES,
              runMode: true, // 後端改成 true
            },
          },
        ],
      });

      await store.loadFromBackend();

      // loaded 應設為 true
      expect(store.loaded).toBe(true);
      // state 應反映後端回傳值
      expect(store.capabilitiesByProvider.codex.runMode).toBe(true);
    });

    it("後端回傳空 providers 陣列時，loaded 仍應變為 true，capabilities 維持 fallback", async () => {
      const store = useProviderCapabilityStore();

      mockCreateWebSocketRequest.mockResolvedValueOnce({
        providers: [],
      });

      await store.loadFromBackend();

      expect(store.loaded).toBe(true);
      // 空陣列不寫入 state，fallback 應維持
      expect(store.capabilitiesByProvider.codex).toEqual(
        CODEX_FALLBACK_CAPABILITIES,
      );
    });
  });

  // ----------------------------------------------------------------
  // loadFromBackend — 失敗路徑
  // ----------------------------------------------------------------
  describe("loadFromBackend 失敗路徑", () => {
    it("createWebSocketRequest reject 時，toast 應被呼叫，loaded 維持 false", async () => {
      const store = useProviderCapabilityStore();

      // mock createWebSocketRequest 拋出錯誤
      mockCreateWebSocketRequest.mockRejectedValueOnce(
        new Error("WebSocket 連線失敗"),
      );

      await store.loadFromBackend();

      // loaded 應維持 false（catch 內未設定）
      expect(store.loaded).toBe(false);
      // toast 應被呼叫提示使用者
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
        }),
      );
    });

    it("失敗後 capabilities 應維持 fallback 不變", async () => {
      const store = useProviderCapabilityStore();

      mockCreateWebSocketRequest.mockRejectedValueOnce(new Error("網路逾時"));

      await store.loadFromBackend();

      // claude 與 codex 都應維持 fallback
      expect(store.capabilitiesByProvider.claude).toEqual(
        CLAUDE_FALLBACK_CAPABILITIES,
      );
      expect(store.capabilitiesByProvider.codex).toEqual(
        CODEX_FALLBACK_CAPABILITIES,
      );
    });
  });
});
