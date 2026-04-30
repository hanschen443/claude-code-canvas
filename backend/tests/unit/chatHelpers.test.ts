/**
 * chatHelpers 單元測試
 *
 * 保留合理 boundary mock：
 *   - socketService.emitToCanvas（WebSocket 邊界）
 * 移除自家 store mock，改用 initTestDb + 真實 store。
 */

vi.mock("../../src/services/socketService.js", () => ({
  socketService: {
    emitToCanvas: vi.fn(),
  },
}));

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  extractDisplayContent,
  injectUserMessage,
} from "../../src/utils/chatHelpers.js";
import { socketService } from "../../src/services/socketService.js";
import { WebSocketResponseEvents } from "../../src/schemas/events.js";
import { initTestDb, closeDb, getDb } from "../../src/database/index.js";
import { resetStatements } from "../../src/database/statements.js";
import { messageStore } from "../../src/services/messageStore.js";
import { podStore } from "../../src/services/podStore.js";
import type { ContentBlock } from "../../src/types/index.js";

const CANVAS_ID = "canvas-chat-test";
const POD_ID = "pod-chat-test";

function insertCanvas(): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO canvases (id, name, sort_index) VALUES (?, ?, ?)",
    )
    .run(CANVAS_ID, "Chat Test Canvas", 0);
}

function insertPod(): void {
  getDb()
    .prepare(
      `INSERT INTO pods
             (id, canvas_id, name, status, x, y, rotation, workspace_path,
              session_id, repository_id, command_id, multi_instance,
              schedule_json, provider, provider_config_json)
             VALUES (?, ?, ?, 'idle', 0, 0, 0, '/tmp/test-pod', NULL, NULL, NULL, 0, NULL, 'claude',
             '{"model":"sonnet"}')`,
    )
    .run(POD_ID, CANVAS_ID, "Chat Test Pod");
}

describe("extractDisplayContent", () => {
  it("傳入 string 時直接回傳原始字串", () => {
    const result = extractDisplayContent("hello world");
    expect(result).toBe("hello world");
  });

  it("傳入含 text block 的 ContentBlock[] 時回傳合併文字", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "foo" },
      { type: "text", text: "bar" },
    ];
    const result = extractDisplayContent(blocks);
    expect(result).toBe("foobar");
  });

  it("傳入含 image block 的 ContentBlock[] 時 image 轉為 [image]", () => {
    const blocks: ContentBlock[] = [
      { type: "image", mediaType: "image/png", base64Data: "abc" },
    ];
    const result = extractDisplayContent(blocks);
    expect(result).toBe("[image]");
  });

  it("傳入混合 text + image 時正確組合", () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "看這張圖：" },
      { type: "image", mediaType: "image/png", base64Data: "abc" },
      { type: "text", text: "這是說明" },
    ];
    const result = extractDisplayContent(blocks);
    expect(result).toBe("看這張圖：[image]這是說明");
  });
});

describe("injectUserMessage", () => {
  beforeEach(() => {
    closeDb();
    resetStatements();
    initTestDb();
    insertCanvas();
    insertPod();
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
  });

  it("呼叫後 podStore.setStatus 真實寫入 chatting 狀態", async () => {
    await injectUserMessage({
      canvasId: CANVAS_ID,
      podId: POD_ID,
      content: "測試",
    });

    // 讀取真實 DB 驗證狀態
    const pod = podStore.getById(CANVAS_ID, POD_ID);
    expect(pod?.status).toBe("chatting");
  });

  it("呼叫後 messageStore 真實寫入 user 訊息", async () => {
    await injectUserMessage({
      canvasId: CANVAS_ID,
      podId: POD_ID,
      content: "你好",
    });

    const messages = messageStore.getMessages(POD_ID);
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("你好");
  });

  it("呼叫後 socketService.emitToCanvas 廣播正確 payload", async () => {
    await injectUserMessage({
      canvasId: CANVAS_ID,
      podId: POD_ID,
      content: "廣播測試",
    });

    expect(socketService.emitToCanvas).toHaveBeenCalledWith(
      CANVAS_ID,
      WebSocketResponseEvents.POD_CHAT_USER_MESSAGE,
      expect.objectContaining({
        canvasId: CANVAS_ID,
        podId: POD_ID,
        content: "廣播測試",
        messageId: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it("content 為 ContentBlock[] 時先經 extractDisplayContent 轉換", async () => {
    const blocks: ContentBlock[] = [
      { type: "text", text: "區塊文字" },
      { type: "image", mediaType: "image/png", base64Data: "xyz" },
    ];

    await injectUserMessage({
      canvasId: CANVAS_ID,
      podId: POD_ID,
      content: blocks,
    });

    const expectedDisplay = "區塊文字[image]";
    const messages = messageStore.getMessages(POD_ID);
    expect(messages[0].content).toBe(expectedDisplay);
    expect(socketService.emitToCanvas).toHaveBeenCalledWith(
      CANVAS_ID,
      WebSocketResponseEvents.POD_CHAT_USER_MESSAGE,
      expect.objectContaining({ content: expectedDisplay }),
    );
  });
});
