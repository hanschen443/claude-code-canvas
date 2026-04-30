/**
 * chatEmitStrategy 單元測試
 *
 * 移除 vi.mock("socketService")，改用 vi.spyOn 觀察 emitToCanvas 呼叫。
 */

import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  createNormalEmitStrategy,
  createRunEmitStrategy,
} from "../../src/services/chatEmitStrategy.js";
import { socketService } from "../../src/services/socketService.js";
import { WebSocketResponseEvents } from "../../src/schemas/index.js";

describe("chatEmitStrategy", () => {
  const canvasId = "test-canvas";
  const podId = "test-pod";
  const messageId = "msg-001";

  beforeEach(() => {
    vi.spyOn(socketService, "emitToCanvas").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("createNormalEmitStrategy", () => {
    it("emitText 應呼叫 emitToCanvas 帶 POD_CLAUDE_CHAT_MESSAGE", () => {
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

    it("emitToolUse 應呼叫 emitToCanvas 帶 POD_CHAT_TOOL_USE", () => {
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

    it("emitToolResult 應呼叫 emitToCanvas 帶 POD_CHAT_TOOL_RESULT", () => {
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

    it("emitComplete 應呼叫 emitToCanvas 帶 POD_CHAT_COMPLETE", () => {
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

  describe("createRunEmitStrategy", () => {
    const runId = "test-run";

    it("emitText 應呼叫 emitToCanvas 帶 RUN_MESSAGE，payload 含 runId", () => {
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

    it("emitToolUse 應呼叫 emitToCanvas 帶 RUN_CHAT_TOOL_USE，payload 含 runId", () => {
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

    it("emitToolResult 應呼叫 emitToCanvas 帶 RUN_CHAT_TOOL_RESULT，payload 含 runId", () => {
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

    it("emitComplete 應呼叫 emitToCanvas 帶 RUN_CHAT_COMPLETE，payload 含 runId", () => {
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
