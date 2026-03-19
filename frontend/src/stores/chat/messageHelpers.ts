import type { Message, SubMessage, ToolUseInfo } from "@/types/chat";
import {
  appendToolToLastSubMessage,
  flushAndCreateNewSubMessage,
  updateAssistantSubMessages,
} from "./subMessageHelpers";
import { createAssistantMessageShape } from "./chatMessageActions";

export function buildRunPodCacheKey(runId: string, podId: string): string {
  return `${runId}:${podId}`;
}

export function buildSubMessageId(
  parentMessageId: string,
  toolUseId: string | undefined,
): string {
  return `${parentMessageId}-${toolUseId ?? "no-tool"}`;
}

export function applyToolUseToMessage(
  message: Message,
  payload: {
    toolUseId: string;
    toolName: string;
    input: Record<string, unknown>;
  },
): void {
  const toolUseInfo: ToolUseInfo = {
    toolUseId: payload.toolUseId,
    toolName: payload.toolName,
    input: payload.input,
    status: "running",
  };

  const subMessages = message.subMessages;

  // 尚無 subMessages 時，建立初始 subMessages
  if (!subMessages || subMessages.length === 0) {
    const newSubMessages: SubMessage[] = [];

    // 若主訊息已有文字內容，先保留到第一個 subMessage，避免切換到 subMessages 渲染後文字消失
    if (message.content.trim() !== "") {
      newSubMessages.push({
        id: `${message.id}-sub-0`,
        content: message.content,
        isPartial: false,
      });
    }

    newSubMessages.push({
      id: payload.toolUseId,
      content: "",
      toolUse: [toolUseInfo],
    });

    message.subMessages = newSubMessages;
    return;
  }

  const lastSub = subMessages[subMessages.length - 1];

  if (lastSub && lastSub.content.trim() === "") {
    // 最後一個 subMessage content 為空，合併到同一個
    message.subMessages = appendToolToLastSubMessage(subMessages, toolUseInfo);
  } else {
    // 最後一個 subMessage 有 content，建立新的 subMessage
    message.subMessages = flushAndCreateNewSubMessage(
      subMessages,
      message.id,
      toolUseInfo,
    );
  }
}

export function applyToolResultToMessage(
  message: Message,
  payload: {
    toolUseId: string;
    output: string;
  },
): void {
  if (!message.subMessages) return;

  for (const subMessage of message.subMessages) {
    if (!subMessage.toolUse) continue;
    const toolUseEntry = subMessage.toolUse.find(
      (t) => t.toolUseId === payload.toolUseId,
    );
    if (toolUseEntry) {
      toolUseEntry.output = payload.output;
      toolUseEntry.status = "completed";
      return;
    }
  }
}

export function upsertMessage(
  messages: Message[],
  messageId: string,
  content: string,
  isPartial: boolean,
  role: string,
  delta?: string,
): void {
  const existingIndex = messages.findIndex((m) => m.id === messageId);
  if (existingIndex !== -1) {
    const existing = messages[existingIndex];
    if (existing) {
      const shouldUpdateSub =
        existing.role === "assistant" &&
        existing.subMessages &&
        delta !== undefined;
      const subMessageUpdates = shouldUpdateSub
        ? updateAssistantSubMessages(existing, delta, isPartial)
        : {};
      messages[existingIndex] = {
        ...existing,
        // 有 subMessages 但 delta 不可用時，不更新 content，避免 content 與 subMessages 不同步
        ...(existing.subMessages && !shouldUpdateSub ? {} : { content }),
        isPartial,
        ...subMessageUpdates,
      };
    }
    return;
  }

  const effectiveRole = role as "user" | "assistant";
  const baseMessage: Message = {
    id: messageId,
    role: effectiveRole,
    content,
    isPartial,
  };

  const shape =
    effectiveRole === "assistant"
      ? createAssistantMessageShape(messageId, content, isPartial, delta)
      : {};

  messages.push({ ...baseMessage, ...shape });
}
