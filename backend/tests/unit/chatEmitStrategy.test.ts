import type { Mock } from "vitest";

vi.mock("../../src/services/socketService.js", () => ({
  socketService: {
    emitToCanvas: vi.fn(() => {}),
  },
}));

import {
  createNormalEmitStrategy,
  createRunEmitStrategy,
} from "../../src/services/chatEmitStrategy.js";
import { socketService } from "../../src/services/socketService.js";
import { WebSocketResponseEvents } from "../../src/schemas/index.js";

/** 取得 mock 函式的型別化引用 */
function asMock(fn: unknown): Mock<any> {
  return fn as Mock<any>;
}

describe("chatEmitStrategy", () => {
  const canvasId = "test-canvas";
  const podId = "test-pod";
  const messageId = "msg-001";

  beforeEach(() => {
    asMock(socketService.emitToCanvas).mockClear();
  });

  describe("createNormalEmitStrategy", () => {
    describe("emitText", () => {
      it("應呼叫 socketService.emitToCanvas 帶 POD_CLAUDE_CHAT_MESSAGE 事件", () => {
        const strategy = createNormalEmitStrategy();
        strategy.emitText({ canvasId, podId, messageId, content: "Hello" });

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
          canvasId,
          WebSocketResponseEvents.POD_CLAUDE_CHAT_MESSAGE,
          expect.objectContaining({
            canvasId,
            podId,
            messageId,
            content: "Hello",
            isPartial: true,
            role: "assistant",
          }),
        );
      });
    });

    describe("emitToolUse", () => {
      it("應呼叫 socketService.emitToCanvas 帶 POD_CHAT_TOOL_USE 事件", () => {
        const strategy = createNormalEmitStrategy();
        strategy.emitToolUse({
          canvasId,
          podId,
          messageId,
          toolUseId: "tool-1",
          toolName: "Read",
          input: { path: "/test" },
        });

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
          canvasId,
          WebSocketResponseEvents.POD_CHAT_TOOL_USE,
          expect.objectContaining({
            canvasId,
            podId,
            messageId,
            toolUseId: "tool-1",
            toolName: "Read",
            input: { path: "/test" },
          }),
        );
      });
    });

    describe("emitToolResult", () => {
      it("應呼叫 socketService.emitToCanvas 帶 POD_CHAT_TOOL_RESULT 事件", () => {
        const strategy = createNormalEmitStrategy();
        strategy.emitToolResult({
          canvasId,
          podId,
          messageId,
          toolUseId: "tool-1",
          toolName: "Read",
          output: "file content",
        });

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
          canvasId,
          WebSocketResponseEvents.POD_CHAT_TOOL_RESULT,
          expect.objectContaining({
            canvasId,
            podId,
            messageId,
            toolUseId: "tool-1",
            toolName: "Read",
            output: "file content",
          }),
        );
      });
    });

    describe("emitComplete", () => {
      it("應呼叫 socketService.emitToCanvas 帶 POD_CHAT_COMPLETE 事件", () => {
        const strategy = createNormalEmitStrategy();
        strategy.emitComplete({
          canvasId,
          podId,
          messageId,
          fullContent: "完整內容",
        });

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
          canvasId,
          WebSocketResponseEvents.POD_CHAT_COMPLETE,
          expect.objectContaining({
            canvasId,
            podId,
            messageId,
            fullContent: "完整內容",
          }),
        );
      });
    });
  });

  describe("createRunEmitStrategy", () => {
    const runId = "test-run";

    describe("emitText", () => {
      it("應呼叫 socketService.emitToCanvas 帶 RUN_MESSAGE 事件，且 payload 包含 runId", () => {
        const strategy = createRunEmitStrategy(runId);
        strategy.emitText({ canvasId, podId, messageId, content: "Run 訊息" });

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
          canvasId,
          WebSocketResponseEvents.RUN_MESSAGE,
          expect.objectContaining({
            runId,
            canvasId,
            podId,
            messageId,
            content: "Run 訊息",
            isPartial: true,
            role: "assistant",
          }),
        );
      });
    });

    describe("emitToolUse", () => {
      it("應呼叫 socketService.emitToCanvas 帶 RUN_CHAT_TOOL_USE 事件，且 payload 包含 runId", () => {
        const strategy = createRunEmitStrategy(runId);
        strategy.emitToolUse({
          canvasId,
          podId,
          messageId,
          toolUseId: "tool-run-1",
          toolName: "Write",
          input: { content: "test" },
        });

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
          canvasId,
          WebSocketResponseEvents.RUN_CHAT_TOOL_USE,
          expect.objectContaining({
            runId,
            canvasId,
            podId,
            messageId,
            toolUseId: "tool-run-1",
            toolName: "Write",
          }),
        );
      });
    });

    describe("emitToolResult", () => {
      it("應呼叫 socketService.emitToCanvas 帶 RUN_CHAT_TOOL_RESULT 事件，且 payload 包含 runId", () => {
        const strategy = createRunEmitStrategy(runId);
        strategy.emitToolResult({
          canvasId,
          podId,
          messageId,
          toolUseId: "tool-run-1",
          toolName: "Write",
          output: "成功寫入",
        });

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
          canvasId,
          WebSocketResponseEvents.RUN_CHAT_TOOL_RESULT,
          expect.objectContaining({
            runId,
            canvasId,
            podId,
            messageId,
            toolUseId: "tool-run-1",
            toolName: "Write",
            output: "成功寫入",
          }),
        );
      });
    });

    describe("emitComplete", () => {
      it("應呼叫 socketService.emitToCanvas 帶 RUN_CHAT_COMPLETE 事件，且 payload 包含 runId", () => {
        const strategy = createRunEmitStrategy(runId);
        strategy.emitComplete({
          canvasId,
          podId,
          messageId,
          fullContent: "Run 完整內容",
        });

        expect(socketService.emitToCanvas).toHaveBeenCalledWith(
          canvasId,
          WebSocketResponseEvents.RUN_CHAT_COMPLETE,
          expect.objectContaining({
            runId,
            canvasId,
            podId,
            messageId,
            fullContent: "Run 完整內容",
          }),
        );
      });
    });
  });
});
