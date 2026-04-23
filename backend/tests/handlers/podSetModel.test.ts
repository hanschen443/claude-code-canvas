import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pod } from "../../src/types/index.js";

// --- mock 函式 ---
const mockValidatePod = vi.fn();
const mockPodStoreUpdate = vi.fn();
const mockEmitError = vi.fn();
const mockEmitToCanvas = vi.fn();

// --- vi.mock ---

vi.mock("../../src/utils/handlerHelpers.js", () => ({
  withCanvasId:
    (
      _event: unknown,
      handler: (
        connectionId: string,
        canvasId: string,
        payload: unknown,
        requestId: string,
      ) => Promise<void>,
    ) =>
    (connectionId: string, payload: unknown, requestId: string) =>
      handler(connectionId, "canvas-1", payload, requestId),
  validatePod: (...args: unknown[]) => mockValidatePod(...args),
  handleResultError: vi.fn(() => false),
}));

vi.mock("../../src/services/podStore.js", () => ({
  podStore: {
    update: (...args: unknown[]) => mockPodStoreUpdate(...args),
    hasName: vi.fn(() => false),
    getById: vi.fn(),
  },
}));

vi.mock("../../src/utils/websocketResponse.js", () => ({
  emitError: (...args: unknown[]) => mockEmitError(...args),
  emitSuccess: vi.fn(),
}));

vi.mock("../../src/services/socketService.js", () => ({
  socketService: {
    emitToCanvas: (...args: unknown[]) => mockEmitToCanvas(...args),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../src/schemas/index.js", () => ({
  WebSocketResponseEvents: {
    POD_PLUGINS_SET: "pod:plugins:set",
    POD_CREATED: "pod:created",
    POD_LIST_RESULT: "pod:list:result",
    POD_GET_RESULT: "pod:get:result",
    POD_RENAMED: "pod:renamed",
    POD_DELETED: "pod:deleted",
    POD_MOVED: "pod:moved",
    POD_MODEL_SET: "pod:model:set",
    POD_SCHEDULE_SET: "pod:schedule:set",
    POD_MULTI_INSTANCE_SET: "pod:multi-instance:set",
  },
}));

vi.mock("../../src/services/podService.js", () => ({
  createPodWithWorkspace: vi.fn(),
  deletePodWithCleanup: vi.fn(),
}));

vi.mock("../../src/services/repositoryService.js", () => ({
  repositoryService: { getById: vi.fn() },
}));

vi.mock("../../src/utils/i18nError.js", () => ({
  createI18nError: (key: string, params?: Record<string, unknown>) =>
    params ? { key, params } : { key },
}));

const { handlePodSetModel } = await import("../../src/handlers/podHandlers.js");

const CONNECTION_ID = "conn-1";
const POD_ID = "pod-uuid-1";
const CANVAS_ID = "canvas-1";
const REQUEST_ID = "req-1";

/** 建立基礎 Pod 物件，支援覆寫部分欄位 */
function makePod(overrides: Partial<Pod> = {}): Pod {
  return {
    id: POD_ID,
    name: "測試 Pod",
    status: "idle",
    x: 0,
    y: 0,
    rotation: 0,
    model: "opus",
    workspacePath: "/tmp",
    sessionId: null,
    outputStyleId: null,
    repositoryId: null,
    commandId: null,
    multiInstance: false,
    skillIds: [],
    subAgentIds: [],
    mcpServerIds: [],
    pluginIds: [],
    provider: "claude",
    providerConfig: { model: "opus" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePodSetModel", () => {
  describe("Case 1：寫進 providerConfig.model", () => {
    it("呼叫 handler 後，podStore.update 應收到包含新 providerConfig.model 的 updates", async () => {
      const existingPod = makePod({ providerConfig: { model: "opus" } });
      const updatedPod = makePod({
        providerConfig: { model: "sonnet" },
        model: "sonnet",
      });

      mockValidatePod.mockReturnValue(existingPod);
      mockPodStoreUpdate.mockReturnValue({ pod: updatedPod });

      await handlePodSetModel(
        CONNECTION_ID,
        { canvasId: CANVAS_ID, podId: POD_ID, model: "sonnet" },
        REQUEST_ID,
      );

      expect(mockPodStoreUpdate).toHaveBeenCalledWith(
        CANVAS_ID,
        POD_ID,
        expect.objectContaining({
          providerConfig: expect.objectContaining({ model: "sonnet" }),
        }),
      );
    });
  });

  describe("Case 2：不再寫 pods.model 新值（DB 欄位凍結）", () => {
    it("podStore.update 的 updates 物件不含頂層 model 欄位（不寫入新 model 到 pods.model）", async () => {
      const existingPod = makePod({
        model: "opus",
        providerConfig: { model: "opus" },
      });
      const updatedPod = makePod({
        model: "sonnet",
        providerConfig: { model: "sonnet" },
      });

      mockValidatePod.mockReturnValue(existingPod);
      mockPodStoreUpdate.mockReturnValue({ pod: updatedPod });

      await handlePodSetModel(
        CONNECTION_ID,
        { canvasId: CANVAS_ID, podId: POD_ID, model: "sonnet" },
        REQUEST_ID,
      );

      // handlePodSetModel 傳給 podStore.update 的 updates 只有 providerConfig，
      // 不含頂層 model 欄位，因此 DB 的 pods.model 不會被新值覆蓋
      const updateCall = mockPodStoreUpdate.mock.calls[0];
      const updatesArg = updateCall?.[2] as Record<string, unknown>;

      // updates 不應有頂層 model key
      expect(updatesArg).not.toHaveProperty("model");
      // 但應有 providerConfig.model = 'sonnet'
      expect(
        (updatesArg?.providerConfig as Record<string, unknown>)?.model,
      ).toBe("sonnet");
    });
  });

  describe("Case 3：既有 providerConfig 其他 keys 不被覆蓋（merge，不是 replace）", () => {
    it("原本 providerConfig: { model: 'opus', someOther: 'x' } → set model 為 'sonnet' → 應變 { model: 'sonnet', someOther: 'x' }", async () => {
      const existingPod = makePod({
        model: "opus",
        providerConfig: { model: "opus", someOther: "x" },
      });
      const updatedPod = makePod({
        model: "sonnet",
        providerConfig: { model: "sonnet", someOther: "x" },
      });

      mockValidatePod.mockReturnValue(existingPod);
      mockPodStoreUpdate.mockReturnValue({ pod: updatedPod });

      await handlePodSetModel(
        CONNECTION_ID,
        { canvasId: CANVAS_ID, podId: POD_ID, model: "sonnet" },
        REQUEST_ID,
      );

      const updateCall = mockPodStoreUpdate.mock.calls[0];
      const updatesArg = updateCall?.[2] as Record<string, unknown>;
      const mergedConfig = updatesArg?.providerConfig as Record<
        string,
        unknown
      >;

      // 新 model 寫入
      expect(mergedConfig?.model).toBe("sonnet");
      // 既有 someOther 保留
      expect(mergedConfig?.someOther).toBe("x");
    });

    it("providerConfig 為 null 時，應建立新的 { model: 'sonnet' }，不拋錯", async () => {
      const existingPod = makePod({
        model: "opus",
        providerConfig: null,
      });
      const updatedPod = makePod({
        model: "sonnet",
        providerConfig: { model: "sonnet" },
      });

      mockValidatePod.mockReturnValue(existingPod);
      mockPodStoreUpdate.mockReturnValue({ pod: updatedPod });

      await handlePodSetModel(
        CONNECTION_ID,
        { canvasId: CANVAS_ID, podId: POD_ID, model: "sonnet" },
        REQUEST_ID,
      );

      const updateCall = mockPodStoreUpdate.mock.calls[0];
      const updatesArg = updateCall?.[2] as Record<string, unknown>;
      const mergedConfig = updatesArg?.providerConfig as Record<
        string,
        unknown
      >;

      expect(mergedConfig?.model).toBe("sonnet");
    });
  });

  describe("Case 4：emit 出去的 Pod payload 帶最新 providerConfig.model", () => {
    it("socketService.emitToCanvas 收到的 pod 應含最新 providerConfig.model", async () => {
      const existingPod = makePod({ providerConfig: { model: "opus" } });
      const updatedPod = makePod({
        model: "haiku",
        providerConfig: { model: "haiku" },
      });

      mockValidatePod.mockReturnValue(existingPod);
      mockPodStoreUpdate.mockReturnValue({ pod: updatedPod });

      await handlePodSetModel(
        CONNECTION_ID,
        { canvasId: CANVAS_ID, podId: POD_ID, model: "haiku" },
        REQUEST_ID,
      );

      expect(mockEmitToCanvas).toHaveBeenCalledWith(
        CANVAS_ID,
        "pod:model:set",
        expect.objectContaining({
          success: true,
          pod: expect.objectContaining({
            providerConfig: expect.objectContaining({ model: "haiku" }),
          }),
        }),
      );
    });
  });

  describe("Pod 不存在時", () => {
    it("validatePod 回傳 undefined 時應提前 return，不呼叫 podStore.update", async () => {
      mockValidatePod.mockReturnValue(undefined);

      await handlePodSetModel(
        CONNECTION_ID,
        { canvasId: CANVAS_ID, podId: POD_ID, model: "sonnet" },
        REQUEST_ID,
      );

      expect(mockPodStoreUpdate).not.toHaveBeenCalled();
      expect(mockEmitToCanvas).not.toHaveBeenCalled();
    });
  });

  describe("podStore.update 失敗時", () => {
    it("update 回傳 null 時應呼叫 emitError，不廣播 emitToCanvas", async () => {
      const existingPod = makePod({ providerConfig: { model: "opus" } });

      mockValidatePod.mockReturnValue(existingPod);
      mockPodStoreUpdate.mockReturnValue(null);

      await handlePodSetModel(
        CONNECTION_ID,
        { canvasId: CANVAS_ID, podId: POD_ID, model: "sonnet" },
        REQUEST_ID,
      );

      expect(mockEmitError).toHaveBeenCalledWith(
        CONNECTION_ID,
        "pod:model:set",
        expect.objectContaining({ key: expect.any(String) }),
        REQUEST_ID,
        POD_ID,
        "INTERNAL_ERROR",
      );
      expect(mockEmitToCanvas).not.toHaveBeenCalled();
    });
  });
});
