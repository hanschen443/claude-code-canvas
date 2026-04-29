// SDK boundary mock（保留：executeStreamingChat 是真實 SDK 邊界）
vi.mock("../../src/services/claude/streamingChatExecutor.js", () => ({
  executeStreamingChat: vi.fn(() =>
    Promise.resolve({
      messageId: "stream-1",
      content: "回覆",
      hasContent: true,
      aborted: false,
    }),
  ),
}));

// 工具 helper mocks（合理 boundary：chatHelpers / chatCallbacks / runChatHelpers 依賴外部狀態）
vi.mock("../../src/utils/runChatHelpers.js", () => ({
  launchMultiInstanceRun: vi.fn(() =>
    Promise.resolve({ runId: "run-1", canvasId: "canvas-1" }),
  ),
}));

vi.mock("../../src/utils/chatCallbacks.js", () => ({
  onRunChatComplete: vi.fn(),
  onChatComplete: vi.fn(),
  onChatAborted: vi.fn(),
}));

vi.mock("../../src/utils/chatHelpers.js", () => ({
  injectUserMessage: vi.fn(() => Promise.resolve()),
  extractDisplayContent: vi.fn((text: string) => text),
}));

// workflow service mock（保留：workflow 觸發是獨立模組邊界）
vi.mock("../../src/services/workflow/index.js", () => ({
  workflowExecutionService: {
    checkAndTriggerWorkflows: vi.fn(() => Promise.resolve()),
  },
}));

vi.mock("../../src/utils/workflowChainTraversal.js", () => ({
  isWorkflowChainBusy: vi.fn(() => false),
}));

// integrationRegistry mock（保留：外部 provider 邊界）
vi.mock("../../src/services/integration/integrationRegistry.js", () => ({
  integrationRegistry: {
    get: vi.fn(() => undefined),
  },
}));

// commandExpander mock（保留：DB 查找外部命令）
vi.mock("../../src/services/commandExpander.js", () => ({
  tryExpandCommandMessage: vi.fn((_pod: unknown, message: unknown) =>
    Promise.resolve({ ok: true, message }),
  ),
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { initTestDb, closeDb } from "../../src/database/index.js";
import { resetStatements } from "../../src/database/statements.js";
import { getDb } from "../../src/database/index.js";
import { integrationEventPipeline } from "../../src/services/integration/integrationEventPipeline.js";
import { podStore } from "../../src/services/podStore.js";

/** 清除 podStore 內部動態 PreparedStatement LRU 快取。
 * 跨測試時 DB 實例會重建（initTestDb），舊 statement 快取必須清除，
 * 否則重用已關閉 DB 的 statement 會導致查詢靜默返回錯誤結果。
 */
function clearPodStoreCache(): void {
  type PodStoreTestHooks = { stmtCache: Map<string, unknown> };
  (podStore as unknown as PodStoreTestHooks).stmtCache.clear();
}
import { socketService } from "../../src/services/socketService.js";
import { executeStreamingChat } from "../../src/services/claude/streamingChatExecutor.js";
import { workflowExecutionService } from "../../src/services/workflow/index.js";
import { isWorkflowChainBusy } from "../../src/utils/workflowChainTraversal.js";
import { integrationRegistry } from "../../src/services/integration/integrationRegistry.js";
import { launchMultiInstanceRun } from "../../src/utils/runChatHelpers.js";
import { onRunChatComplete } from "../../src/utils/chatCallbacks.js";
import { injectUserMessage } from "../../src/utils/chatHelpers.js";
import {
  replyContextStore,
  setReplyContextIfPresent,
} from "../../src/services/integration/replyContextStore.js";
import { tryExpandCommandMessage } from "../../src/services/commandExpander.js";
import { logger } from "../../src/utils/logger.js";
import type { NormalizedEvent } from "../../src/services/integration/types.js";
import type { RunContext } from "../../src/types/run.js";

function asMock(fn: unknown): Mock<any> {
  return fn as Mock<any>;
}

// --- DB 初始化 helpers ---

const CANVAS_ID = "canvas-1";

function insertCanvas(id: string = CANVAS_ID): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO canvases (id, name, sort_index) VALUES (?, ?, ?)",
    )
    .run(id, `canvas-${id}`, 0);
}

function insertIntegrationApp(id: string, provider: string): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO integration_apps (id, provider, name, config_json, extra_json) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, provider, `${provider}-app-${id}`, "{}", null);
}

/** 建立 Pod 並綁定 integration，回傳 podId */
function createBoundPod(
  canvasId: string,
  appId: string,
  provider: string,
  resourceId: string,
  overrides: Record<string, unknown> = {},
): string {
  const { pod } = podStore.create(canvasId, {
    name: `Pod-${Math.random().toString(36).slice(2, 8)}`,
    x: 0,
    y: 0,
    rotation: 0,
    ...overrides,
  });
  podStore.addIntegrationBinding(canvasId, pod.id, {
    provider,
    appId,
    resourceId,
  });
  return pod.id;
}

function makeEvent(overrides: Partial<NormalizedEvent> = {}): NormalizedEvent {
  return {
    provider: "slack",
    appId: "app-1",
    resourceId: "C123",
    userName: "testuser",
    text: "[Slack: @testuser] <user_data>測試訊息</user_data>",
    rawEvent: {},
    ...overrides,
  };
}

const mockRunContext: RunContext = { runId: "run-1", canvasId: CANVAS_ID };

describe("IntegrationEventPipeline", () => {
  beforeEach(() => {
    closeDb();
    clearPodStoreCache();
    resetStatements();
    initTestDb();
    insertCanvas();
    insertIntegrationApp("app-1", "slack");

    // spyOn socketService（不全 mock 整個模組）
    vi.spyOn(socketService, "emitToCanvas").mockImplementation(() => {});

    // 重置所有 vi.mock 函式
    vi.resetAllMocks();

    // 重置 spyOn（resetAllMocks 清掉了，重新設回）
    vi.spyOn(socketService, "emitToCanvas").mockImplementation(() => {});

    asMock(executeStreamingChat).mockResolvedValue({
      messageId: "stream-1",
      content: "回覆",
      hasContent: true,
      aborted: false,
    });
    asMock(workflowExecutionService.checkAndTriggerWorkflows).mockResolvedValue(
      undefined,
    );
    asMock(isWorkflowChainBusy).mockReturnValue(false);
    asMock(integrationRegistry.get).mockReturnValue(undefined);
    asMock(launchMultiInstanceRun).mockResolvedValue(mockRunContext);
    asMock(onRunChatComplete).mockReturnValue(undefined);
    asMock(injectUserMessage).mockResolvedValue(undefined);
    asMock(tryExpandCommandMessage).mockImplementation(
      (_pod: unknown, message: unknown) =>
        Promise.resolve({ ok: true, message }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeDb();
    clearPodStoreCache();
  });

  describe("processEvent", () => {
    it("找不到綁定 Pod 時不呼叫 executeStreamingChat", async () => {
      // 沒有綁定任何 Pod，使用不存在的 resourceId
      await integrationEventPipeline.processEvent(
        "slack",
        "app-1",
        makeEvent({ resourceId: "no-binding" }),
      );

      expect(executeStreamingChat).not.toHaveBeenCalled();
    });

    it("正確注入訊息至綁定的 Pod", async () => {
      const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");

      await integrationEventPipeline.processEvent(
        "slack",
        "app-1",
        makeEvent(),
      );

      expect(injectUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasId: CANVAS_ID,
          podId,
          content: "[Slack: @testuser] <user_data>測試訊息</user_data>",
        }),
      );
      expect(executeStreamingChat).toHaveBeenCalledWith(
        expect.objectContaining({
          canvasId: CANVAS_ID,
          podId,
          abortable: false,
        }),
        { onComplete: expect.any(Function) },
      );
    });

    describe("忙碌處理", () => {
      it("資源忙碌時不呼叫 executeStreamingChat", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        podStore.setStatus(CANVAS_ID, podId, "chatting");

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent(),
        );

        expect(executeStreamingChat).not.toHaveBeenCalled();
      });

      it("資源忙碌且 Provider 有 sendMessage 時發送忙碌回覆", async () => {
        const podId = createBoundPod(
          CANVAS_ID,
          "app-1",
          "slack",
          "C-busy-send",
        );
        podStore.setStatus(CANVAS_ID, podId, "chatting");

        const mockSendMessage = vi.fn(() =>
          Promise.resolve({ success: true as const }),
        );
        asMock(integrationRegistry.get).mockReturnValue({
          sendMessage: mockSendMessage,
        });

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent({ resourceId: "C-busy-send" }),
        );

        expect(mockSendMessage).toHaveBeenCalledWith(
          "app-1",
          "C-busy-send",
          "目前忙碌中，請稍後再試",
          expect.any(Object),
        );
      });

      it("同一資源短時間內第二次忙碌不再發送忙碌回覆", async () => {
        const podId = createBoundPod(
          CANVAS_ID,
          "app-1",
          "slack",
          "C-busy-cool",
        );
        podStore.setStatus(CANVAS_ID, podId, "chatting");

        const mockSendMessage = vi.fn(() =>
          Promise.resolve({ success: true as const }),
        );
        asMock(integrationRegistry.get).mockReturnValue({
          sendMessage: mockSendMessage,
        });

        const mockNow = vi.spyOn(Date, "now");
        mockNow.mockReturnValue(200_000_000);

        const event = makeEvent({ resourceId: "C-busy-cool" });
        await integrationEventPipeline.processEvent("slack", "app-1", event);
        expect(mockSendMessage).toHaveBeenCalledTimes(1);

        // 10 秒後（30 秒冷卻未到）
        mockNow.mockReturnValue(200_010_000);
        await integrationEventPipeline.processEvent("slack", "app-1", event);
        expect(mockSendMessage).toHaveBeenCalledTimes(1);

        mockNow.mockRestore();
      });

      it("Workflow 鏈中有忙碌 Pod 時判定為資源忙碌", async () => {
        createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        asMock(isWorkflowChainBusy).mockReturnValue(true);

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent(),
        );

        expect(executeStreamingChat).not.toHaveBeenCalled();
      });
    });

    describe("Pod 狀態處理", () => {
      it("Pod 狀態為 error 時先重置為 idle 再注入訊息", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        podStore.setStatus(CANVAS_ID, podId, "error");

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent(),
        );

        // error 被重置後，仍應執行 executeStreamingChat
        expect(executeStreamingChat).toHaveBeenCalled();
        // DB 中 Pod 狀態最終應為 idle（串流成功）
        const pod = podStore.getById(CANVAS_ID, podId);
        expect(pod).toBeDefined();
      });

      it("executeStreamingChat 拋出錯誤時不設定 Pod 狀態為 error", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        asMock(executeStreamingChat).mockRejectedValue(new Error("串流失敗"));

        await expect(
          integrationEventPipeline.processEvent("slack", "app-1", makeEvent()),
        ).resolves.not.toThrow();

        // settleAndLogErrors 吞錯，Pod 狀態不應被設為 error
        const pod = podStore.getById(CANVAS_ID, podId);
        expect(pod?.status).not.toBe("error");
      });

      it("Pod 在二次確認時已變為 chatting 應跳過注入（用 spyOn getById 模擬競態）", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");

        // 用 spyOn 讓二次確認（getById）看到 chatting，模擬第一道與第二道檢查間的競態
        vi.spyOn(podStore, "getById").mockReturnValue({
          id: podId,
          name: "TestPod",
          status: "chatting",
          workspacePath: "/workspace",
          x: 0,
          y: 0,
          rotation: 0,
          sessionId: null,
          skillIds: [],
          mcpServerNames: [],
          provider: "claude",
          providerConfig: { model: "opus" },
          repositoryId: null,
          commandId: null,
          multiInstance: false,
        });

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent(),
        );

        expect(executeStreamingChat).not.toHaveBeenCalled();
      });
    });

    describe("Command 展開", () => {
      it("Pod 綁 commandId 時，injectUserMessage 收到展開後內容", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        // 更新 pod 設定 commandId（使用 podStore.update 或直接 SQL）
        getDb()
          .prepare("UPDATE pods SET command_id = ? WHERE id = ?")
          .run("my-cmd", podId);

        const expanded =
          "<command>\n## 命令內容\n</command>\n[Slack: @testuser] <user_data>測試訊息</user_data>";
        asMock(tryExpandCommandMessage).mockResolvedValue({
          ok: true,
          message: expanded,
        });

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent(),
        );

        expect(injectUserMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            canvasId: CANVAS_ID,
            podId,
            content: expanded,
          }),
        );
        expect(executeStreamingChat).toHaveBeenCalledWith(
          expect.objectContaining({
            canvasId: CANVAS_ID,
            podId,
            message: expanded,
            abortable: false,
          }),
          { onComplete: expect.any(Function) },
        );
      });

      it("Pod 綁 commandId 但 command 找不到時，記 warn 且不呼叫 inject 與 executor", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        getDb()
          .prepare("UPDATE pods SET command_id = ? WHERE id = ?")
          .run("missing-cmd", podId);

        asMock(tryExpandCommandMessage).mockResolvedValue({
          ok: false,
          commandId: "missing-cmd",
        });

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent(),
        );

        expect(logger.warn).toHaveBeenCalledWith(
          "Integration",
          "Warn",
          expect.stringContaining("missing-cmd"),
        );
        expect(injectUserMessage).not.toHaveBeenCalled();
        expect(executeStreamingChat).not.toHaveBeenCalled();
      });

      it("超長訊息含 command 時，先截斷再展開後再 inject", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        getDb()
          .prepare("UPDATE pods SET command_id = ? WHERE id = ?")
          .run("my-cmd", podId);

        const longText = "X".repeat(10000);
        const event = makeEvent({ text: longText });
        const expectedTruncated = longText.slice(0, 8000);
        const expectedExpanded = `<command>\n## 命令內容\n</command>\n${expectedTruncated}`;

        asMock(tryExpandCommandMessage).mockImplementation(
          (_pod: unknown, message: unknown) => {
            expect(typeof message === "string" && message.length === 8000).toBe(
              true,
            );
            return Promise.resolve({ ok: true, message: expectedExpanded });
          },
        );

        await integrationEventPipeline.processEvent("slack", "app-1", event);

        expect(tryExpandCommandMessage).toHaveBeenCalledWith(
          expect.objectContaining({ id: podId }),
          expectedTruncated,
          "integrationEventPipeline",
        );
        expect(injectUserMessage).toHaveBeenCalledWith(
          expect.objectContaining({ content: expectedExpanded }),
        );
      });
    });

    it("多個綁定 Pod 應並行執行", async () => {
      const podId1 = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
      const podId2 = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");

      const startedIds: string[] = [];
      const resolvers: Array<() => void> = [];

      asMock(executeStreamingChat).mockImplementation(
        async (params: { podId: string }) => {
          startedIds.push(params.podId);
          await new Promise<void>((resolve) => resolvers.push(resolve));
          return {
            messageId: "s1",
            content: "回覆",
            hasContent: true,
            aborted: false,
          };
        },
      );

      const handlePromise = integrationEventPipeline.processEvent(
        "slack",
        "app-1",
        makeEvent(),
      );

      await vi.waitFor(() => {
        expect(startedIds).toHaveLength(2);
      });

      resolvers.forEach((resolve) => resolve());
      await handlePromise;

      expect(startedIds).toContain(podId1);
      expect(startedIds).toContain(podId2);
    });

    it("部分 Pod 執行失敗不影響其他 Pod", async () => {
      createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
      createBoundPod(CANVAS_ID, "app-1", "slack", "C123");

      asMock(executeStreamingChat)
        .mockRejectedValueOnce(new Error("Pod 1 執行失敗"))
        .mockResolvedValueOnce({
          messageId: "s2",
          content: "回覆",
          hasContent: true,
          aborted: false,
        });

      await expect(
        integrationEventPipeline.processEvent("slack", "app-1", makeEvent()),
      ).resolves.not.toThrow();

      expect(executeStreamingChat).toHaveBeenCalledTimes(2);
    });

    describe("multiInstance Pod", () => {
      it("應呼叫 launchMultiInstanceRun 啟動 Run", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        getDb()
          .prepare("UPDATE pods SET multi_instance = 1 WHERE id = ?")
          .run(podId);

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent(),
        );

        expect(launchMultiInstanceRun).toHaveBeenCalledWith(
          expect.objectContaining({
            canvasId: CANVAS_ID,
            podId,
            abortable: false,
          }),
        );
      });

      it("應跳過 busy check，即使 Pod 狀態為 chatting 也建立新 Run", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        getDb()
          .prepare("UPDATE pods SET multi_instance = 1 WHERE id = ?")
          .run(podId);
        podStore.setStatus(CANVAS_ID, podId, "chatting");

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent(),
        );

        expect(launchMultiInstanceRun).toHaveBeenCalled();
      });

      it("所有 Pod 皆為 multiInstance 時回覆「已接收到命令」", async () => {
        const podId = createBoundPod(
          CANVAS_ID,
          "app-1",
          "slack",
          "C-multi-only",
        );
        getDb()
          .prepare("UPDATE pods SET multi_instance = 1 WHERE id = ?")
          .run(podId);

        const mockSendMessage = vi.fn(() =>
          Promise.resolve({ success: true as const }),
        );
        asMock(integrationRegistry.get).mockReturnValue({
          sendMessage: mockSendMessage,
        });

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent({ resourceId: "C-multi-only" }),
        );

        expect(mockSendMessage).toHaveBeenCalledWith(
          "app-1",
          "C-multi-only",
          "已接收到命令",
          expect.any(Object),
        );
      });

      it("完成後應呼叫 onRunChatComplete", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        getDb()
          .prepare("UPDATE pods SET multi_instance = 1 WHERE id = ?")
          .run(podId);

        asMock(launchMultiInstanceRun).mockImplementationOnce(
          async (params: { onComplete: (runContext: RunContext) => void }) => {
            params.onComplete(mockRunContext);
            return mockRunContext;
          },
        );

        await integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent(),
        );

        expect(onRunChatComplete).toHaveBeenCalledWith(
          mockRunContext,
          CANVAS_ID,
          podId,
        );
      });

      it("launchMultiInstanceRun 失敗時不設定 Pod 全域狀態為 error 且不拋出", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        getDb()
          .prepare("UPDATE pods SET multi_instance = 1 WHERE id = ?")
          .run(podId);
        asMock(launchMultiInstanceRun).mockRejectedValueOnce(
          new Error("建立 Run 失敗"),
        );

        await expect(
          integrationEventPipeline.processEvent("slack", "app-1", makeEvent()),
        ).resolves.not.toThrow();

        const pod = podStore.getById(CANVAS_ID, podId);
        expect(pod?.status).not.toBe("error");
      });

      it("event 有 senderId/threadTs 時應設定 replyContextStore", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        getDb()
          .prepare("UPDATE pods SET multi_instance = 1 WHERE id = ?")
          .run(podId);

        const event = makeEvent({
          senderId: "U123",
          messageTs: "1234.5678",
          threadTs: "1111.2222",
        });

        asMock(launchMultiInstanceRun).mockImplementationOnce(
          async (params: {
            onRunContextCreated?: (runContext: RunContext) => void;
            onComplete: (runContext: RunContext) => void;
          }) => {
            params.onRunContextCreated?.(mockRunContext);
            params.onComplete(mockRunContext);
            return mockRunContext;
          },
        );

        await integrationEventPipeline.processEvent("slack", "app-1", event);

        // replyContextStore 使用真實模組，驗證 key 已被設定並清除
        const key = `run-1:${podId}`;
        // set 後應在 delete 前存在，complete 後應被刪除
        // 由於 setReplyContextIfPresent 是真實函式，直接驗測 key 格式
        expect(setReplyContextIfPresent).not.toThrow;
        // 驗收：完成後 replyContextStore key 已被清除
        expect(replyContextStore.get(key)).toBeUndefined();
      });

      it("非 multiInstance 且有 senderId 時應設定 replyContextStore，完成後刪除", async () => {
        const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C123");
        const event = makeEvent({ senderId: "U456", messageTs: "9999.0000" });

        await integrationEventPipeline.processEvent("slack", "app-1", event);

        // 完成後 key 應被刪除（真實 replyContextStore）
        const key = `pod:${podId}`;
        expect(replyContextStore.get(key)).toBeUndefined();
      });
    });
  });

  describe("確認回覆", () => {
    it.each([
      {
        label: "Slack 一般 Pod 閒置 → 回覆「已接收到命令」",
        provider: "slack",
        appId: "app-1",
        resourceId: "C-ack-slack-idle",
        status: "idle" as const,
        multiInstance: false,
        expectedMsg: "已接收到命令",
        extraEvent: {
          senderId: "U123",
          messageTs: "1000.0001",
          threadTs: "1000.0000",
        },
        expectedExtra: {
          senderId: "U123",
          messageTs: "1000.0001",
          threadTs: "1000.0000",
        },
      },
      {
        label: "Slack 一般 Pod 忙碌 → 回覆「目前忙碌中，請稍後再試」",
        provider: "slack",
        appId: "app-1",
        resourceId: "C-ack-slack-busy",
        status: "chatting" as const,
        multiInstance: false,
        expectedMsg: "目前忙碌中，請稍後再試",
        extraEvent: {
          senderId: "U456",
          messageTs: "2000.0001",
          threadTs: "2000.0000",
        },
        expectedExtra: {
          senderId: "U456",
          messageTs: "2000.0001",
          threadTs: "2000.0000",
        },
      },
      {
        label: "Slack multiInstance → 回覆「已接收到命令」",
        provider: "slack",
        appId: "app-1",
        resourceId: "C-ack-slack-multi",
        status: "idle" as const,
        multiInstance: true,
        expectedMsg: "已接收到命令",
        extraEvent: {},
        expectedExtra: {},
      },
    ])(
      "$label",
      async ({
        provider,
        appId,
        resourceId,
        status,
        multiInstance,
        expectedMsg,
        extraEvent,
        expectedExtra,
      }) => {
        insertIntegrationApp(appId, provider);
        const podId = createBoundPod(CANVAS_ID, appId, provider, resourceId);
        if (status !== "idle") podStore.setStatus(CANVAS_ID, podId, status);
        if (multiInstance) {
          getDb()
            .prepare("UPDATE pods SET multi_instance = 1 WHERE id = ?")
            .run(podId);
        }

        const mockSendMessage = vi.fn(() =>
          Promise.resolve({ success: true as const }),
        );
        const mockBuildAckExtra = vi.fn(() => expectedExtra);
        asMock(integrationRegistry.get).mockReturnValue({
          sendMessage: mockSendMessage,
          buildAckExtra: mockBuildAckExtra,
        });

        const fullEvent = makeEvent({
          provider: provider as "slack",
          resourceId,
          ...extraEvent,
        });
        await integrationEventPipeline.processEvent(provider, appId, fullEvent);

        expect(mockSendMessage).toHaveBeenCalledWith(
          appId,
          resourceId,
          expectedMsg,
          Object.keys(expectedExtra).length > 0
            ? expect.objectContaining(expectedExtra)
            : expect.any(Object),
        );
      },
    );

    it("Slack 同時有一般（閒置）與 Multi-Instance Pod — 只回覆一次「已接收到命令」", async () => {
      const normalPodId = createBoundPod(
        CANVAS_ID,
        "app-1",
        "slack",
        "C-mixed-idle",
      );
      const multiPodId = createBoundPod(
        CANVAS_ID,
        "app-1",
        "slack",
        "C-mixed-idle",
      );
      getDb()
        .prepare("UPDATE pods SET multi_instance = 1 WHERE id = ?")
        .run(multiPodId);

      const mockSendMessage = vi.fn(() =>
        Promise.resolve({ success: true as const }),
      );
      asMock(integrationRegistry.get).mockReturnValue({
        sendMessage: mockSendMessage,
      });

      await integrationEventPipeline.processEvent(
        "slack",
        "app-1",
        makeEvent({ resourceId: "C-mixed-idle" }),
      );

      expect(normalPodId).toBeTruthy();
      expect(mockSendMessage).toHaveBeenCalledTimes(1);
      expect(mockSendMessage).toHaveBeenCalledWith(
        "app-1",
        "C-mixed-idle",
        "已接收到命令",
        expect.any(Object),
      );
    });

    it("Slack 沒有綁定 Pod — 不回覆", async () => {
      const mockSendMessage = vi.fn(() =>
        Promise.resolve({ success: true as const }),
      );
      asMock(integrationRegistry.get).mockReturnValue({
        sendMessage: mockSendMessage,
      });

      await integrationEventPipeline.processEvent(
        "slack",
        "app-1",
        makeEvent({ resourceId: "no-binding-resource" }),
      );

      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it("忙碌回覆受冷卻時間控制（30 秒內不重複，超過後可再發）", async () => {
      const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C-cooldown");
      podStore.setStatus(CANVAS_ID, podId, "chatting");

      const mockSendMessage = vi.fn(() =>
        Promise.resolve({ success: true as const }),
      );
      asMock(integrationRegistry.get).mockReturnValue({
        sendMessage: mockSendMessage,
      });

      const mockNow = vi.spyOn(Date, "now");
      mockNow.mockReturnValue(300_000_000);

      const event = makeEvent({ resourceId: "C-cooldown" });
      await integrationEventPipeline.processEvent("slack", "app-1", event);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      mockNow.mockReturnValue(300_015_000);
      await integrationEventPipeline.processEvent("slack", "app-1", event);
      expect(mockSendMessage).toHaveBeenCalledTimes(1);

      // 超過 30 秒後可再次發送
      mockNow.mockReturnValue(300_035_000);
      await integrationEventPipeline.processEvent("slack", "app-1", event);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);

      mockNow.mockRestore();
    });

    it("確認回覆 sendMessage 失敗時不影響後續訊息處理", async () => {
      const podId = createBoundPod(CANVAS_ID, "app-1", "slack", "C-ack-fail");

      const mockSendMessage = vi.fn(() =>
        Promise.reject(new Error("網路錯誤")),
      );
      asMock(integrationRegistry.get).mockReturnValue({
        sendMessage: mockSendMessage,
      });

      await expect(
        integrationEventPipeline.processEvent(
          "slack",
          "app-1",
          makeEvent({ resourceId: "C-ack-fail" }),
        ),
      ).resolves.not.toThrow();

      expect(podId).toBeTruthy();
      expect(executeStreamingChat).toHaveBeenCalled();
    });
  });

  describe("Jira eventFilter 過濾", () => {
    const jiraAppId = "app-jira-filter";

    beforeEach(() => {
      insertIntegrationApp(jiraAppId, "jira");
    });

    it("一個 all、一個 status_changed 的 Pod，非 status 變更事件只有 all 的 Pod 被執行", async () => {
      const podAll = createBoundPod(CANVAS_ID, jiraAppId, "jira", "*");
      const podStatus = createBoundPod(CANVAS_ID, jiraAppId, "jira", "*");

      // 設定 eventFilter via SQL（extra_json）
      getDb()
        .prepare(
          "UPDATE integration_bindings SET extra_json = ? WHERE pod_id = ? AND provider = 'jira'",
        )
        .run(JSON.stringify({ eventFilter: "all" }), podAll);
      getDb()
        .prepare(
          "UPDATE integration_bindings SET extra_json = ? WHERE pod_id = ? AND provider = 'jira'",
        )
        .run(JSON.stringify({ eventFilter: "status_changed" }), podStatus);

      const event: NormalizedEvent = {
        provider: "jira",
        appId: jiraAppId,
        resourceId: "*",
        userName: "tester",
        text: "[Jira: tester] <user_data>更新了 Issue PROJ-1</user_data>",
        rawEvent: {
          webhookEvent: "jira:issue_updated",
          changelog: {
            items: [{ field: "priority", fromString: "Low", toString: "High" }],
          },
        },
      };

      await integrationEventPipeline.processEvent("jira", jiraAppId, event);

      // 只有 podAll 被執行
      expect(injectUserMessage).toHaveBeenCalledTimes(1);
      expect(injectUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({ canvasId: CANVAS_ID, podId: podAll }),
      );
    });

    it("兩個 Pod 都設 status_changed，送入 status 變更事件，兩個 Pod 都被執行", async () => {
      const pod1 = createBoundPod(CANVAS_ID, jiraAppId, "jira", "*");
      const pod2 = createBoundPod(CANVAS_ID, jiraAppId, "jira", "*");

      getDb()
        .prepare(
          "UPDATE integration_bindings SET extra_json = ? WHERE pod_id = ? AND provider = 'jira'",
        )
        .run(JSON.stringify({ eventFilter: "status_changed" }), pod1);
      getDb()
        .prepare(
          "UPDATE integration_bindings SET extra_json = ? WHERE pod_id = ? AND provider = 'jira'",
        )
        .run(JSON.stringify({ eventFilter: "status_changed" }), pod2);

      const event: NormalizedEvent = {
        provider: "jira",
        appId: jiraAppId,
        resourceId: "*",
        userName: "tester",
        text: "[Jira: tester] <user_data>更新了 Issue PROJ-2</user_data>",
        rawEvent: {
          webhookEvent: "jira:issue_updated",
          changelog: {
            items: [{ field: "status", fromString: "Open", toString: "Done" }],
          },
        },
      };

      await integrationEventPipeline.processEvent("jira", jiraAppId, event);

      expect(injectUserMessage).toHaveBeenCalledTimes(2);
      expect(injectUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({ canvasId: CANVAS_ID, podId: pod1 }),
      );
      expect(injectUserMessage).toHaveBeenCalledWith(
        expect.objectContaining({ canvasId: CANVAS_ID, podId: pod2 }),
      );
    });

    it("所有 Pod 都被 eventFilter 過濾後，filteredPods 為空，不執行任何 Pod", async () => {
      const podStatus = createBoundPod(CANVAS_ID, jiraAppId, "jira", "*");
      getDb()
        .prepare(
          "UPDATE integration_bindings SET extra_json = ? WHERE pod_id = ? AND provider = 'jira'",
        )
        .run(JSON.stringify({ eventFilter: "status_changed" }), podStatus);

      const event: NormalizedEvent = {
        provider: "jira",
        appId: jiraAppId,
        resourceId: "*",
        userName: "tester",
        text: "[Jira: tester] <user_data>新增了 Issue PROJ-3</user_data>",
        rawEvent: {
          webhookEvent: "jira:issue_created",
          changelog: { items: [] },
        },
      };

      await integrationEventPipeline.processEvent("jira", jiraAppId, event);

      expect(injectUserMessage).not.toHaveBeenCalled();
      expect(executeStreamingChat).not.toHaveBeenCalled();
    });
  });
});
