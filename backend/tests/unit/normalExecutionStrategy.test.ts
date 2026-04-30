/**
 * NormalModeExecutionStrategy 單元測試
 *
 * 移除自家 store mock，改用 initTestDb + 真實 store 驗 DB 寫入與 emit 呼叫。
 * 僅 spyOn socketService.emit*（不全 mock 模組）、spyOn injectUserMessage（外部副作用邊界）。
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { initTestDb, closeDb, getDb } from "../../src/database/index.js";
import { resetStatements } from "../../src/database/statements.js";
import { NormalModeExecutionStrategy } from "../../src/services/normalExecutionStrategy.js";
import { podStore } from "../../src/services/podStore.js";
import { messageStore } from "../../src/services/messageStore.js";
import { socketService } from "../../src/services/socketService.js";
import * as chatHelpers from "../../src/utils/chatHelpers.js";

/** 清除 podStore 內部動態 PreparedStatement LRU 快取，防止跨測試 DB 污染 */
function clearPodStoreCache(): void {
  type PodStoreTestHooks = { stmtCache: Map<string, unknown> };
  (podStore as unknown as PodStoreTestHooks).stmtCache.clear();
}

const CANVAS_ID = "test-canvas";

function insertCanvas(): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO canvases (id, name, sort_index) VALUES (?, ?, ?)",
    )
    .run(CANVAS_ID, `canvas-${CANVAS_ID}`, 0);
}

/** 建立測試用 Pod，使用真實 podStore.create（採預設 claude provider） */
function createTestPod(): ReturnType<typeof podStore.create>["pod"] {
  return podStore.create(CANVAS_ID, {
    name: "test-pod",
    x: 0,
    y: 0,
    rotation: 0,
  }).pod;
}

describe("NormalModeExecutionStrategy", () => {
  beforeEach(() => {
    closeDb();
    clearPodStoreCache();
    resetStatements();
    initTestDb();
    insertCanvas();

    vi.spyOn(socketService, "emitToCanvas").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    closeDb();
    clearPodStoreCache();
  });

  function makeStrategy(): NormalModeExecutionStrategy {
    return new NormalModeExecutionStrategy(CANVAS_ID);
  }

  describe("setStatus", () => {
    it("應透過 podStore 更新 DB 中的 Pod 狀態", () => {
      const pod = createTestPod();
      const strategy = makeStrategy();

      strategy.setStatus(pod.id, "chatting");

      const updated = podStore.getById(CANVAS_ID, pod.id);
      expect(updated?.status).toBe("chatting");
    });
  });

  describe("getSessionId", () => {
    it("Pod 不存在時應回傳 undefined", () => {
      const strategy = makeStrategy();
      const result = strategy.getSessionId("non-existent-pod");

      expect(result).toBeUndefined();
    });

    it("Pod 存在且 sessionId 為 null 時應回傳 undefined", () => {
      const pod = createTestPod();
      const strategy = makeStrategy();

      const result = strategy.getSessionId(pod.id);

      // 新建 Pod 的 sessionId 預設為 null
      expect(result).toBeUndefined();
    });

    it("Pod 存在且有 sessionId 時應回傳該值", () => {
      const pod = createTestPod();
      const sessionId = "session-abc";
      podStore.setSessionId(CANVAS_ID, pod.id, sessionId);

      const strategy = makeStrategy();
      const result = strategy.getSessionId(pod.id);

      expect(result).toBe(sessionId);
    });
  });

  describe("getQueryKey", () => {
    it("應直接回傳 podId", () => {
      const strategy = makeStrategy();
      expect(strategy.getQueryKey("some-pod-id")).toBe("some-pod-id");
    });
  });

  describe("createEmitStrategy", () => {
    it("應回傳有 emitText/emitToolUse/emitToolResult/emitComplete 方法的物件", () => {
      const strategy = makeStrategy();
      const emitStrategy = strategy.createEmitStrategy();

      expect(emitStrategy).toHaveProperty("emitText");
      expect(emitStrategy).toHaveProperty("emitToolUse");
      expect(emitStrategy).toHaveProperty("emitToolResult");
      expect(emitStrategy).toHaveProperty("emitComplete");
    });

    it("回傳的 emitStrategy.emitText 應呼叫 socketService.emitToCanvas", () => {
      const pod = createTestPod();
      const strategy = makeStrategy();
      const emitStrategy = strategy.createEmitStrategy();

      emitStrategy.emitText({
        canvasId: CANVAS_ID,
        podId: pod.id,
        messageId: "msg-1",
        content: "Hello",
      });

      expect(socketService.emitToCanvas).toHaveBeenCalledOnce();
    });
  });

  describe("persistMessage", () => {
    it("應透過 messageStore 寫入 DB，可由 getMessages 查到", () => {
      const pod = createTestPod();
      const strategy = makeStrategy();
      const message = {
        id: "msg-1",
        role: "assistant" as const,
        content: "測試內容",
        timestamp: new Date().toISOString(),
      };

      strategy.persistMessage(pod.id, message);

      const messages = messageStore.getMessages(pod.id);
      expect(messages.some((m) => m.id === "msg-1")).toBe(true);
    });
  });

  describe("addUserMessage", () => {
    it("應呼叫 injectUserMessage 帶入正確參數（字串內容）", async () => {
      const pod = createTestPod();
      const injectSpy = vi
        .spyOn(chatHelpers, "injectUserMessage")
        .mockResolvedValue(undefined);
      const strategy = makeStrategy();
      const content = "使用者訊息";

      await strategy.addUserMessage(pod.id, content);

      expect(injectSpy).toHaveBeenCalledWith({
        canvasId: CANVAS_ID,
        podId: pod.id,
        content,
      });
    });

    it("應呼叫 injectUserMessage 帶入正確參數（ContentBlock 陣列）", async () => {
      const pod = createTestPod();
      const injectSpy = vi
        .spyOn(chatHelpers, "injectUserMessage")
        .mockResolvedValue(undefined);
      const strategy = makeStrategy();
      const content = [{ type: "text" as const, text: "測試" }];

      await strategy.addUserMessage(pod.id, content);

      expect(injectSpy).toHaveBeenCalledWith({
        canvasId: CANVAS_ID,
        podId: pod.id,
        content,
      });
    });
  });

  describe("isBusy", () => {
    it("Pod 不存在時應回傳 false", () => {
      const strategy = makeStrategy();
      expect(strategy.isBusy("non-existent-pod")).toBe(false);
    });

    it("Pod 狀態為 idle 時應回傳 false", () => {
      const pod = createTestPod();
      const strategy = makeStrategy();

      expect(strategy.isBusy(pod.id)).toBe(false);
    });

    it("Pod 狀態為 chatting 時應回傳 true", () => {
      const pod = createTestPod();
      podStore.setStatus(CANVAS_ID, pod.id, "chatting");
      const strategy = makeStrategy();

      expect(strategy.isBusy(pod.id)).toBe(true);
    });

    it("Pod 狀態為 summarizing 時應回傳 true", () => {
      const pod = createTestPod();
      podStore.setStatus(CANVAS_ID, pod.id, "summarizing");
      const strategy = makeStrategy();

      expect(strategy.isBusy(pod.id)).toBe(true);
    });
  });

  describe("onStreamStart", () => {
    it("應為 no-op，不改變 Pod 狀態", () => {
      const pod = createTestPod();
      podStore.setStatus(CANVAS_ID, pod.id, "chatting");
      const strategy = makeStrategy();

      strategy.onStreamStart(pod.id);

      // Pod 狀態不變，仍是 chatting
      expect(podStore.getById(CANVAS_ID, pod.id)?.status).toBe("chatting");
    });
  });

  describe("onStreamComplete", () => {
    it("應將 Pod 狀態設為 idle", () => {
      const pod = createTestPod();
      podStore.setStatus(CANVAS_ID, pod.id, "chatting");
      const strategy = makeStrategy();

      strategy.onStreamComplete(pod.id, undefined);

      expect(podStore.getById(CANVAS_ID, pod.id)?.status).toBe("idle");
    });

    it("有 sessionId 時應額外寫入 DB", () => {
      const pod = createTestPod();
      const strategy = makeStrategy();
      const sessionId = "new-session-456";

      strategy.onStreamComplete(pod.id, sessionId);

      const updated = podStore.getByIdGlobal(pod.id);
      expect(updated?.pod.sessionId).toBe(sessionId);
    });

    it("sessionId 為 undefined 時不更新 sessionId", () => {
      const pod = createTestPod();
      const strategy = makeStrategy();

      strategy.onStreamComplete(pod.id, undefined);

      // sessionId 仍為 null
      const updated = podStore.getByIdGlobal(pod.id);
      expect(updated?.pod.sessionId).toBeNull();
    });
  });

  describe("onStreamAbort", () => {
    it("應將 Pod 狀態設為 idle", () => {
      const pod = createTestPod();
      podStore.setStatus(CANVAS_ID, pod.id, "chatting");
      const strategy = makeStrategy();

      strategy.onStreamAbort(pod.id, "使用者中斷");

      expect(podStore.getById(CANVAS_ID, pod.id)?.status).toBe("idle");
    });
  });

  describe("onStreamError", () => {
    it("應將 Pod 狀態設為 idle", () => {
      const pod = createTestPod();
      podStore.setStatus(CANVAS_ID, pod.id, "chatting");
      const strategy = makeStrategy();

      strategy.onStreamError(pod.id);

      expect(podStore.getById(CANVAS_ID, pod.id)?.status).toBe("idle");
    });
  });

  describe("getRunContext", () => {
    it("應回傳 undefined", () => {
      const strategy = makeStrategy();
      expect(strategy.getRunContext()).toBeUndefined();
    });
  });
});
