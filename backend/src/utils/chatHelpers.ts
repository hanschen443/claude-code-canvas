import { v4 as uuidv4 } from "uuid";
import type { ContentBlock } from "../types/index.js";
import { WebSocketResponseEvents } from "../schemas/index.js";
import { podStore } from "../services/podStore.js";
import { messageStore } from "../services/messageStore.js";
import { socketService } from "../services/socketService.js";

export function extractDisplayContent(
  message: string | ContentBlock[],
): string {
  if (typeof message === "string") return message;

  return message
    .map((block) => (block.type === "text" ? block.text : "[image]"))
    .join("");
}

export async function injectUserMessage(params: {
  canvasId: string;
  podId: string;
  content: string | ContentBlock[];
  /** 可選的外部 id，用於對齊附件目錄與 DB message id */
  id?: string;
}): Promise<void> {
  const { canvasId, podId, content, id } = params;

  const displayContent = extractDisplayContent(content);

  podStore.setStatus(canvasId, podId, "chatting");
  if (id) {
    // 帶入外部 id，確保附件目錄與 DB message id 一致
    await messageStore.addMessage(
      canvasId,
      podId,
      "user",
      displayContent,
      undefined,
      { id },
    );
  } else {
    await messageStore.addMessage(canvasId, podId, "user", displayContent);
  }

  socketService.emitToCanvas(
    canvasId,
    WebSocketResponseEvents.POD_CHAT_USER_MESSAGE,
    {
      canvasId,
      podId,
      messageId: uuidv4(),
      content: displayContent,
      timestamp: new Date().toISOString(),
    },
  );
}
