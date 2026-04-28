import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── mock 函式 ───────────────────────────────────────────────────────────────
const mockReadClaudeMcpServers = vi.fn();
const mockReadCodexMcpServers = vi.fn();
const mockPodStoreGetById = vi.fn();
const mockPodStoreSetMcpServerNames = vi.fn();
const mockEmitToConnection = vi.fn();
const mockEmitToCanvas = vi.fn();
const mockEmitError = vi.fn();
const mockGetCanvasId = vi.fn();

// ─── vi.mock ─────────────────────────────────────────────────────────────────

vi.mock("../../src/services/mcp/claudeMcpReader.js", () => ({
  readClaudeMcpServers: (...args: unknown[]) =>
    mockReadClaudeMcpServers(...args),
}));

vi.mock("../../src/services/mcp/codexMcpReader.js", () => ({
  readCodexMcpServers: (...args: unknown[]) => mockReadCodexMcpServers(...args),
}));

vi.mock("../../src/services/podStore.js", () => ({
  podStore: {
    getById: (...args: unknown[]) => mockPodStoreGetById(...args),
    setMcpServerNames: (...args: unknown[]) =>
      mockPodStoreSetMcpServerNames(...args),
  },
}));

vi.mock("../../src/services/socketService.js", () => ({
  socketService: {
    emitToConnection: (...args: unknown[]) => mockEmitToConnection(...args),
    emitToCanvas: (...args: unknown[]) => mockEmitToCanvas(...args),
  },
}));

vi.mock("../../src/utils/websocketResponse.js", () => ({
  emitError: (...args: unknown[]) => mockEmitError(...args),
}));

vi.mock("../../src/utils/handlerHelpers.js", () => ({
  getCanvasId: (...args: unknown[]) => mockGetCanvasId(...args),
}));

vi.mock("../../src/utils/i18nError.js", () => ({
  createI18nError: (key: string, params?: Record<string, unknown>) =>
    params ? { key, params } : { key },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../src/schemas/index.js", () => ({
  WebSocketResponseEvents: {
    MCP_LIST_RESULT: "mcp:list:result",
    POD_MCP_SERVER_NAMES_UPDATED: "pod:mcp-server-names:updated",
  },
}));

// ─── 待測模組（dynamic import，需在 mock 設定後才 import） ───────────────────
const { handleMcpList, handlePodSetMcpServerNames } =
  await import("../../src/handlers/mcpHandlers.js");

// ─── 常數 ────────────────────────────────────────────────────────────────────
const CONNECTION_ID = "conn-1";
const CANVAS_ID = "canvas-1";
const POD_ID = "pod-uuid-1";
const REQUEST_ID = "req-1";

// ─── 輔助函式 ────────────────────────────────────────────────────────────────

function makeIdlePod(overrides: Record<string, unknown> = {}) {
  return {
    id: POD_ID,
    name: "測試 Pod",
    status: "idle",
    workspacePath: "/workspace/my-project",
    mcpServerNames: [],
    repositoryId: null,
    ...overrides,
  };
}

// ─── 測試 ────────────────────────────────────────────────────────────────────

describe("handleMcpList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provider = claude 時應呼叫 readClaudeMcpServers 並將 name 轉為 items 回傳", async () => {
    mockReadClaudeMcpServers.mockReturnValue([
      { name: "server-a", command: "node", args: [], env: {} },
      { name: "server-b", command: "python3", args: [], env: {} },
    ]);

    await handleMcpList(
      CONNECTION_ID,
      { requestId: REQUEST_ID, provider: "claude" },
      REQUEST_ID,
    );

    expect(mockReadClaudeMcpServers).toHaveBeenCalledTimes(1);
    // 無參數（user-scoped 只讀，不需要傳 path）
    expect(mockReadClaudeMcpServers).toHaveBeenCalledWith();
    expect(mockReadCodexMcpServers).not.toHaveBeenCalled();

    expect(mockEmitToConnection).toHaveBeenCalledWith(
      CONNECTION_ID,
      "mcp:list:result",
      expect.objectContaining({
        requestId: REQUEST_ID,
        success: true,
        provider: "claude",
        items: [{ name: "server-a" }, { name: "server-b" }],
      }),
    );
  });

  it("provider = codex 時應呼叫 readCodexMcpServers 並將 { name, type } 轉為 items 回傳", async () => {
    mockReadCodexMcpServers.mockReturnValue([
      { name: "figma", type: "http" },
      { name: "context7", type: "stdio" },
    ]);

    await handleMcpList(
      CONNECTION_ID,
      { requestId: REQUEST_ID, provider: "codex" },
      REQUEST_ID,
    );

    expect(mockReadCodexMcpServers).toHaveBeenCalledTimes(1);
    expect(mockReadClaudeMcpServers).not.toHaveBeenCalled();

    expect(mockEmitToConnection).toHaveBeenCalledWith(
      CONNECTION_ID,
      "mcp:list:result",
      expect.objectContaining({
        requestId: REQUEST_ID,
        success: true,
        provider: "codex",
        items: [
          { name: "figma", type: "http" },
          { name: "context7", type: "stdio" },
        ],
      }),
    );
  });

  it("reader 回傳空陣列時 items 亦為空陣列", async () => {
    mockReadClaudeMcpServers.mockReturnValue([]);

    await handleMcpList(
      CONNECTION_ID,
      { requestId: REQUEST_ID, provider: "claude" },
      REQUEST_ID,
    );

    expect(mockEmitToConnection).toHaveBeenCalledWith(
      CONNECTION_ID,
      "mcp:list:result",
      expect.objectContaining({ items: [] }),
    );
  });

  /**
   * 非法 provider 行為說明：
   * mcpListRequestSchema 使用 z.enum(["claude", "codex"]) 限制 provider 值。
   * 非法值（如 "openai"）在 schema 驗證層就會被拒，handler 不會收到此類 payload。
   * 此測試模擬 schema 已通過（型別強制轉型）的情況下，handler 的 else 分支
   * 會走 codex reader 路徑，確認 handler 的防禦性處理行為符合當前設計。
   */
  it("非法 provider（如 openai）傳入時，handler else 分支走 codex reader（schema 層應擋住此情境）", async () => {
    mockReadCodexMcpServers.mockReturnValue([]);

    // 注意：在正常使用下 schema 會擋住非法 provider；此處以型別強制轉型模擬 bypass 情境
    // 驗證 handler 本身的 else 分支行為（非 "claude" 一律走 codex reader）
    await handleMcpList(
      CONNECTION_ID,
      { requestId: REQUEST_ID, provider: "openai" as "codex" },
      REQUEST_ID,
    );

    // handler 的 else 分支會呼叫 codex reader，而非 claude reader
    expect(mockReadCodexMcpServers).toHaveBeenCalledTimes(1);
    expect(mockReadClaudeMcpServers).not.toHaveBeenCalled();
    expect(mockEmitToConnection).toHaveBeenCalledWith(
      CONNECTION_ID,
      "mcp:list:result",
      expect.objectContaining({ success: true, provider: "openai" }),
    );
  });
});

describe("handlePodSetMcpServerNames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 預設 getCanvasId 回傳合法 canvasId
    mockGetCanvasId.mockReturnValue(CANVAS_ID);
  });

  it("Pod 不存在時應回傳 NOT_FOUND 錯誤，且不呼叫 setMcpServerNames", async () => {
    mockPodStoreGetById.mockReturnValue(undefined);

    await handlePodSetMcpServerNames(
      CONNECTION_ID,
      {
        requestId: REQUEST_ID,
        canvasId: CANVAS_ID,
        podId: POD_ID,
        mcpServerNames: ["server-a"],
      },
      REQUEST_ID,
    );

    expect(mockPodStoreSetMcpServerNames).not.toHaveBeenCalled();
    expect(mockEmitError).toHaveBeenCalledWith(
      CONNECTION_ID,
      "pod:mcp-server-names:updated",
      expect.objectContaining({ key: "errors.notFound" }),
      CANVAS_ID,
      REQUEST_ID,
      POD_ID,
      "NOT_FOUND",
    );
  });

  it("Pod busy（chatting）時應拒絕並回傳 POD_BUSY 錯誤", async () => {
    mockPodStoreGetById.mockReturnValue(makeIdlePod({ status: "chatting" }));

    await handlePodSetMcpServerNames(
      CONNECTION_ID,
      {
        requestId: REQUEST_ID,
        canvasId: CANVAS_ID,
        podId: POD_ID,
        mcpServerNames: ["server-a"],
      },
      REQUEST_ID,
    );

    expect(mockPodStoreSetMcpServerNames).not.toHaveBeenCalled();
    expect(mockEmitError).toHaveBeenCalledWith(
      CONNECTION_ID,
      "pod:mcp-server-names:updated",
      expect.objectContaining({ key: "errors.podBusy" }),
      CANVAS_ID,
      REQUEST_ID,
      POD_ID,
      "POD_BUSY",
    );
  });

  it("Pod busy（summarizing）時應拒絕並回傳 POD_BUSY 錯誤", async () => {
    mockPodStoreGetById.mockReturnValue(makeIdlePod({ status: "summarizing" }));

    await handlePodSetMcpServerNames(
      CONNECTION_ID,
      {
        requestId: REQUEST_ID,
        canvasId: CANVAS_ID,
        podId: POD_ID,
        mcpServerNames: ["server-a"],
      },
      REQUEST_ID,
    );

    expect(mockPodStoreSetMcpServerNames).not.toHaveBeenCalled();
    expect(mockEmitError).toHaveBeenCalledWith(
      CONNECTION_ID,
      "pod:mcp-server-names:updated",
      expect.objectContaining({ key: "errors.podBusy" }),
      CANVAS_ID,
      REQUEST_ID,
      POD_ID,
      "POD_BUSY",
    );
  });

  it("self-healing：過濾掉 reader 不存在的 name，只保留有效 name 寫入", async () => {
    mockPodStoreGetById.mockReturnValue(makeIdlePod());
    // reader 只有 server-a，沒有 server-missing
    mockReadClaudeMcpServers.mockReturnValue([
      { name: "server-a", command: "node", args: [], env: {} },
    ]);

    await handlePodSetMcpServerNames(
      CONNECTION_ID,
      {
        requestId: REQUEST_ID,
        canvasId: CANVAS_ID,
        podId: POD_ID,
        mcpServerNames: ["server-a", "server-missing"],
      },
      REQUEST_ID,
    );

    // reader 以無參數（user-scoped）呼叫
    expect(mockReadClaudeMcpServers).toHaveBeenCalledWith();
    // 只有 server-a 應寫入（server-missing 被過濾）
    expect(mockPodStoreSetMcpServerNames).toHaveBeenCalledWith(POD_ID, [
      "server-a",
    ]);
  });

  it("所有 name 都不存在時應寫入空陣列", async () => {
    mockPodStoreGetById.mockReturnValue(makeIdlePod());
    mockReadClaudeMcpServers.mockReturnValue([]);

    await handlePodSetMcpServerNames(
      CONNECTION_ID,
      {
        requestId: REQUEST_ID,
        canvasId: CANVAS_ID,
        podId: POD_ID,
        mcpServerNames: ["nonexistent-server"],
      },
      REQUEST_ID,
    );

    expect(mockPodStoreSetMcpServerNames).toHaveBeenCalledWith(POD_ID, []);
  });

  it("所有 name 皆有效時應全部寫入並廣播 POD_MCP_SERVER_NAMES_UPDATED", async () => {
    mockPodStoreGetById.mockReturnValue(makeIdlePod());
    mockReadClaudeMcpServers.mockReturnValue([
      { name: "server-a", command: "node", args: [], env: {} },
      { name: "server-b", command: "python3", args: [], env: {} },
    ]);

    await handlePodSetMcpServerNames(
      CONNECTION_ID,
      {
        requestId: REQUEST_ID,
        canvasId: CANVAS_ID,
        podId: POD_ID,
        mcpServerNames: ["server-a", "server-b"],
      },
      REQUEST_ID,
    );

    expect(mockPodStoreSetMcpServerNames).toHaveBeenCalledWith(POD_ID, [
      "server-a",
      "server-b",
    ]);

    expect(mockEmitToCanvas).toHaveBeenCalledWith(
      CANVAS_ID,
      "pod:mcp-server-names:updated",
      expect.objectContaining({
        requestId: REQUEST_ID,
        canvasId: CANVAS_ID,
        podId: POD_ID,
        success: true,
        mcpServerNames: ["server-a", "server-b"],
      }),
    );
  });

  /**
   * 設計選擇說明：
   * handlePodSetMcpServerNames 固定呼叫 readClaudeMcpServers() 過濾，
   * 無論 pod 本身是 claude provider 還是 codex provider。
   * 這是當前設計選擇：MCP server name 的「地面真實」來源統一使用 claude reader，
   * 不依賴 pod 的 provider 類型做分流。
   */
  it("codex provider pod 呼叫 handlePodSetMcpServerNames 時，filter 仍走 claudeMcpReader（當前設計選擇）", async () => {
    // 模擬 codex provider 的 pod（provider 欄位為 codex）
    mockPodStoreGetById.mockReturnValue(
      makeIdlePod({ providerConfig: { provider: "codex", model: "gpt-5.4" } }),
    );
    // claudeMcpReader 有 server-a
    mockReadClaudeMcpServers.mockReturnValue([
      { name: "server-a", command: "node", args: [], env: {} },
    ]);

    await handlePodSetMcpServerNames(
      CONNECTION_ID,
      {
        requestId: REQUEST_ID,
        canvasId: CANVAS_ID,
        podId: POD_ID,
        mcpServerNames: ["server-a"],
      },
      REQUEST_ID,
    );

    // 無論 pod 是 codex provider，filter 都走 claudeMcpReader
    expect(mockReadClaudeMcpServers).toHaveBeenCalledWith();
    // codexMcpReader 不應被呼叫
    expect(mockReadCodexMcpServers).not.toHaveBeenCalled();
    // 有效名稱應寫入
    expect(mockPodStoreSetMcpServerNames).toHaveBeenCalledWith(POD_ID, [
      "server-a",
    ]);
  });

  it("getCanvasId 回傳 undefined 時應提早結束，不呼叫 podStore", async () => {
    // canvasId 未設定
    mockGetCanvasId.mockReturnValue(undefined);

    await handlePodSetMcpServerNames(
      CONNECTION_ID,
      {
        requestId: REQUEST_ID,
        canvasId: CANVAS_ID,
        podId: POD_ID,
        mcpServerNames: ["server-a"],
      },
      REQUEST_ID,
    );

    expect(mockPodStoreGetById).not.toHaveBeenCalled();
    expect(mockPodStoreSetMcpServerNames).not.toHaveBeenCalled();
    expect(mockEmitError).not.toHaveBeenCalled();
  });
});
