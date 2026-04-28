import type { Mock } from "vitest";

vi.mock("../../src/services/podStore.js", () => ({
  podStore: {
    setStatus: vi.fn(() => {}),
    getById: vi.fn(() => undefined),
    getByIdGlobal: vi.fn(() => undefined),
    setSessionId: vi.fn(() => {}),
  },
}));

vi.mock("../../src/services/messageStore.js", () => ({
  messageStore: {
    upsertMessage: vi.fn(() => {}),
  },
}));

vi.mock("../../src/utils/chatHelpers.js", () => ({
  injectUserMessage: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../src/services/chatEmitStrategy.js", () => ({
  createNormalEmitStrategy: vi.fn(() => ({
    emitText: vi.fn(() => {}),
    emitToolUse: vi.fn(() => {}),
    emitToolResult: vi.fn(() => {}),
    emitComplete: vi.fn(() => {}),
  })),
}));

import { NormalModeExecutionStrategy } from "../../src/services/normalExecutionStrategy.js";
import { podStore } from "../../src/services/podStore.js";
import { messageStore } from "../../src/services/messageStore.js";
import { injectUserMessage } from "../../src/utils/chatHelpers.js";
import { createNormalEmitStrategy } from "../../src/services/chatEmitStrategy.js";

/** 取得 mock 函式的型別化引用 */
function asMock(fn: unknown): Mock<any> {
  return fn as Mock<any>;
}

describe("NormalModeExecutionStrategy", () => {
  const canvasId = "test-canvas";
  const podId = "test-pod";

  function makeStrategy() {
    return new NormalModeExecutionStrategy(canvasId);
  }

  beforeEach(() => {
    asMock(podStore.setStatus).mockClear();
    asMock(podStore.getById).mockClear();
    asMock(podStore.getByIdGlobal).mockClear();
    asMock(podStore.setSessionId).mockClear();
    asMock(messageStore.upsertMessage).mockClear();
    asMock(injectUserMessage).mockClear();
    asMock(createNormalEmitStrategy).mockClear();
  });

  describe("setStatus", () => {
    it("應呼叫 podStore.setStatus 並帶入正確參數", () => {
      const strategy = makeStrategy();
      strategy.setStatus(podId, "chatting");

      expect(podStore.setStatus).toHaveBeenCalledWith(
        canvasId,
        podId,
        "chatting",
      );
    });
  });

  describe("getSessionId", () => {
    it("Pod 不存在時應回傳 undefined", () => {
      asMock(podStore.getByIdGlobal).mockReturnValue(undefined);

      const strategy = makeStrategy();
      const result = strategy.getSessionId(podId);

      expect(podStore.getByIdGlobal).toHaveBeenCalledWith(podId);
      expect(result).toBeUndefined();
    });

    it("Pod 存在且有 sessionId 時應回傳該值", () => {
      const sessionId = "session-123";
      asMock(podStore.getByIdGlobal).mockReturnValue({
        canvasId,
        pod: { sessionId: sessionId },
      });

      const strategy = makeStrategy();
      const result = strategy.getSessionId(podId);

      expect(result).toBe(sessionId);
    });

    it("Pod 存在但 sessionId 為 null 時應回傳 undefined", () => {
      asMock(podStore.getByIdGlobal).mockReturnValue({
        canvasId,
        pod: { sessionId: null },
      });

      const strategy = makeStrategy();
      const result = strategy.getSessionId(podId);

      expect(result).toBeUndefined();
    });
  });

  describe("getQueryKey", () => {
    it("應直接回傳 podId", () => {
      const strategy = makeStrategy();
      const result = strategy.getQueryKey(podId);

      expect(result).toBe(podId);
    });
  });

  describe("createEmitStrategy", () => {
    it("應回傳有 emitText/emitToolUse/emitToolResult/emitComplete 方法的物件", () => {
      const strategy = makeStrategy();
      const emitStrategy = strategy.createEmitStrategy();

      expect(createNormalEmitStrategy).toHaveBeenCalled();
      expect(emitStrategy).toHaveProperty("emitText");
      expect(emitStrategy).toHaveProperty("emitToolUse");
      expect(emitStrategy).toHaveProperty("emitToolResult");
      expect(emitStrategy).toHaveProperty("emitComplete");
    });
  });

  describe("persistMessage", () => {
    it("應呼叫 messageStore.upsertMessage 並帶入正確參數", () => {
      const strategy = makeStrategy();
      const message = {
        id: "msg-1",
        role: "assistant" as const,
        content: "測試內容",
        timestamp: "2024-01-01T00:00:00.000Z",
      };

      strategy.persistMessage(podId, message);

      expect(messageStore.upsertMessage).toHaveBeenCalledWith(
        canvasId,
        podId,
        message,
      );
    });
  });

  describe("addUserMessage", () => {
    it("應呼叫 injectUserMessage 並帶入正確參數（字串內容）", async () => {
      const strategy = makeStrategy();
      const content = "使用者訊息";

      await strategy.addUserMessage(podId, content);

      expect(injectUserMessage).toHaveBeenCalledWith({
        canvasId,
        podId,
        content,
      });
    });

    it("應呼叫 injectUserMessage 並帶入正確參數（ContentBlock 陣列）", async () => {
      const strategy = makeStrategy();
      const content = [{ type: "text" as const, text: "測試" }];

      await strategy.addUserMessage(podId, content);

      expect(injectUserMessage).toHaveBeenCalledWith({
        canvasId,
        podId,
        content,
      });
    });
  });

  describe("isBusy", () => {
    it("Pod 不存在時應回傳 false", () => {
      asMock(podStore.getById).mockReturnValue(undefined);

      const strategy = makeStrategy();
      const result = strategy.isBusy(podId);

      expect(result).toBe(false);
    });

    it("Pod 狀態為 chatting（busy）時應回傳 true", () => {
      asMock(podStore.getById).mockReturnValue({ status: "chatting" });

      const strategy = makeStrategy();
      const result = strategy.isBusy(podId);

      expect(result).toBe(true);
    });

    it("Pod 狀態為 summarizing（busy）時應回傳 true", () => {
      asMock(podStore.getById).mockReturnValue({ status: "summarizing" });

      const strategy = makeStrategy();
      const result = strategy.isBusy(podId);

      expect(result).toBe(true);
    });

    it("Pod 狀態為 idle 時應回傳 false", () => {
      asMock(podStore.getById).mockReturnValue({ status: "idle" });

      const strategy = makeStrategy();
      const result = strategy.isBusy(podId);

      expect(result).toBe(false);
    });
  });

  describe("onStreamStart", () => {
    it("應為 no-op，不呼叫任何 store 方法", () => {
      const strategy = makeStrategy();
      strategy.onStreamStart(podId);

      expect(podStore.setStatus).not.toHaveBeenCalled();
      expect(podStore.setSessionId).not.toHaveBeenCalled();
      expect(messageStore.upsertMessage).not.toHaveBeenCalled();
    });
  });

  describe("onStreamComplete", () => {
    it("應呼叫 podStore.setStatus 設為 idle", () => {
      const strategy = makeStrategy();
      strategy.onStreamComplete(podId, undefined);

      expect(podStore.setStatus).toHaveBeenCalledWith(canvasId, podId, "idle");
    });

    it("有 sessionId 時應額外呼叫 podStore.setSessionId", () => {
      const sessionId = "new-session-456";
      const strategy = makeStrategy();
      strategy.onStreamComplete(podId, sessionId);

      expect(podStore.setStatus).toHaveBeenCalledWith(canvasId, podId, "idle");
      expect(podStore.setSessionId).toHaveBeenCalledWith(
        canvasId,
        podId,
        sessionId,
      );
    });

    it("sessionId 為 undefined 時不應呼叫 podStore.setSessionId", () => {
      const strategy = makeStrategy();
      strategy.onStreamComplete(podId, undefined);

      expect(podStore.setSessionId).not.toHaveBeenCalled();
    });
  });

  describe("onStreamAbort", () => {
    it("應呼叫 podStore.setStatus 設為 idle", () => {
      const strategy = makeStrategy();
      strategy.onStreamAbort(podId, "使用者中斷");

      expect(podStore.setStatus).toHaveBeenCalledWith(canvasId, podId, "idle");
    });
  });

  describe("onStreamError", () => {
    it("應呼叫 podStore.setStatus 設為 idle", () => {
      const strategy = makeStrategy();
      strategy.onStreamError(podId);

      expect(podStore.setStatus).toHaveBeenCalledWith(canvasId, podId, "idle");
    });
  });

  describe("getRunContext", () => {
    it("應回傳 undefined", () => {
      const strategy = makeStrategy();
      const result = strategy.getRunContext();

      expect(result).toBeUndefined();
    });
  });
});
