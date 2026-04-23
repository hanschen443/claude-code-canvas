import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pod } from "../../src/types/index.js";

// --- mock 函式 ---
const mockValidatePod = vi.fn();
const mockAssertCapability = vi.fn();
const mockEmitPodUpdated = vi.fn();
const mockEmitError = vi.fn();
const mockEmitSuccess = vi.fn();
const mockOutputStyleExists = vi.fn();
const mockPodStoreSetOutputStyleId = vi.fn();
const mockPodStoreGetById = vi.fn();
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
  assertCapability: (...args: unknown[]) => mockAssertCapability(...args),
  emitPodUpdated: (...args: unknown[]) => mockEmitPodUpdated(...args),
}));

vi.mock("../../src/services/podStore.js", () => ({
  podStore: {
    setOutputStyleId: (...args: unknown[]) =>
      mockPodStoreSetOutputStyleId(...args),
    getById: (...args: unknown[]) => mockPodStoreGetById(...args),
    findByOutputStyleId: vi.fn().mockReturnValue([]),
  },
}));

vi.mock("../../src/services/noteStores.js", () => ({
  noteStore: {
    deleteByForeignKey: vi.fn().mockReturnValue([]),
  },
}));

vi.mock("../../src/utils/websocketResponse.js", () => ({
  emitError: (...args: unknown[]) => mockEmitError(...args),
  emitSuccess: (...args: unknown[]) => mockEmitSuccess(...args),
}));

vi.mock("../../src/services/socketService.js", () => ({
  socketService: {
    emitToCanvas: (...args: unknown[]) => mockEmitToCanvas(...args),
    emitToAll: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../src/services/repositorySyncService.js", () => ({
  repositorySyncService: {
    syncRepositoryResources: vi.fn(),
  },
}));

// outputStyleService mock：exists 預設回 true
const mockOutputStyleServiceExists = vi.fn();
vi.mock("../../src/services/outputStyleService.js", () => ({
  outputStyleService: {
    exists: (...args: unknown[]) => mockOutputStyleServiceExists(...args),
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    getContent: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
  },
}));

vi.mock("../../src/schemas/index.js", () => ({
  WebSocketResponseEvents: {
    OUTPUT_STYLE_LIST_RESULT: "output-style:list:result",
    OUTPUT_STYLE_CREATED: "output-style:created",
    OUTPUT_STYLE_UPDATED: "output-style:updated",
    OUTPUT_STYLE_READ_RESULT: "output-style:read:result",
    OUTPUT_STYLE_DELETED: "output-style:deleted",
    OUTPUT_STYLE_MOVED_TO_GROUP: "output-style:moved-to-group",
    POD_OUTPUT_STYLE_BOUND: "pod:output-style:bound",
    POD_OUTPUT_STYLE_UNBOUND: "pod:output-style:unbound",
  },
}));

const { handlePodBindOutputStyle } =
  await import("../../src/handlers/outputStyleHandlers.js");

const CONNECTION_ID = "conn-1";
const CANVAS_ID = "canvas-1";
const POD_ID = "pod-uuid-1";
const OUTPUT_STYLE_ID = "style-uuid-1";
const REQUEST_ID = "req-1";

/** 建立完整的 Pod 物件（預設 claude provider） */
function makePod(overrides: Partial<Pod> = {}): Pod {
  return {
    id: POD_ID,
    name: "Test Pod",
    status: "idle",
    x: 0,
    y: 0,
    rotation: 0,
    workspacePath: "/tmp/workspace",
    sessionId: null,
    outputStyleId: null,
    repositoryId: null,
    commandId: null,
    multiInstance: false,
    skillIds: [],
    subAgentIds: [],
    mcpServerIds: [],
    provider: "claude",
    providerConfig: { model: "opus" },
    ...overrides,
  } as Pod;
}

beforeEach(() => {
  vi.clearAllMocks();
  // 預設 outputStyle 存在
  mockOutputStyleServiceExists.mockResolvedValue(true);
  // 預設更新後的 pod
  mockPodStoreGetById.mockReturnValue(
    makePod({ outputStyleId: OUTPUT_STYLE_ID }),
  );
});

describe("handlePodBindOutputStyle — capability 守門", () => {
  // ================================================================
  // Case 1：Codex Pod bind outputStyle → 應回 CAPABILITY_NOT_SUPPORTED
  // ================================================================
  it("Codex Pod bind outputStyle 時，assertCapability 回傳 false 應中止並回 CAPABILITY_NOT_SUPPORTED 錯誤", async () => {
    const pod = makePod({ provider: "codex" });
    mockValidatePod.mockReturnValue(pod);
    // assertCapability 守門：codex 不支援 outputStyle，回傳 false 並發出錯誤
    mockAssertCapability.mockImplementation(
      (
        connectionId: string,
        _pod: Pod,
        _key: string,
        event: string,
        requestId: string,
      ) => {
        mockEmitError(
          connectionId,
          event,
          { key: "errors.capabilityNotSupported" },
          requestId,
          POD_ID,
          "CAPABILITY_NOT_SUPPORTED",
        );
        return false;
      },
    );

    await handlePodBindOutputStyle(
      CONNECTION_ID,
      { podId: POD_ID, outputStyleId: OUTPUT_STYLE_ID },
      REQUEST_ID,
    );

    expect(mockEmitError).toHaveBeenCalledWith(
      CONNECTION_ID,
      "pod:output-style:bound",
      expect.objectContaining({ key: expect.any(String) }),
      REQUEST_ID,
      POD_ID,
      "CAPABILITY_NOT_SUPPORTED",
    );
    // Pod store 的 bind 方法不應被呼叫
    expect(mockPodStoreSetOutputStyleId).not.toHaveBeenCalled();
  });

  // ================================================================
  // Case 2：Claude Pod bind outputStyle → capability 通過，成功 bind
  // ================================================================
  it("Claude Pod bind outputStyle 時，assertCapability 回傳 true 應繼續執行並 bind 成功", async () => {
    const pod = makePod({ provider: "claude" });
    mockValidatePod.mockReturnValue(pod);
    // assertCapability 守門：claude 支援 outputStyle，回傳 true
    mockAssertCapability.mockReturnValue(true);

    await handlePodBindOutputStyle(
      CONNECTION_ID,
      { podId: POD_ID, outputStyleId: OUTPUT_STYLE_ID },
      REQUEST_ID,
    );

    // 不應收到 CAPABILITY_NOT_SUPPORTED 錯誤
    const capErrorCalls = (mockEmitError.mock.calls as unknown[][]).filter(
      (args) => args[5] === "CAPABILITY_NOT_SUPPORTED",
    );
    expect(capErrorCalls).toHaveLength(0);
    // podStore.setOutputStyleId 應被呼叫
    expect(mockPodStoreSetOutputStyleId).toHaveBeenCalledWith(
      CANVAS_ID,
      POD_ID,
      OUTPUT_STYLE_ID,
    );
  });

  // ================================================================
  // Case 3：outputStyle 不存在時不應進入 capability 守門
  // ================================================================
  it("outputStyle 不存在時應提早回傳 NOT_FOUND，不執行 capability 守門", async () => {
    const pod = makePod({ provider: "codex" });
    mockValidatePod.mockReturnValue(pod);
    // outputStyle 不存在
    mockOutputStyleServiceExists.mockResolvedValue(false);

    await handlePodBindOutputStyle(
      CONNECTION_ID,
      { podId: POD_ID, outputStyleId: OUTPUT_STYLE_ID },
      REQUEST_ID,
    );

    expect(mockAssertCapability).not.toHaveBeenCalled();
    expect(mockPodStoreSetOutputStyleId).not.toHaveBeenCalled();
  });
});
