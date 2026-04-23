import { claudeService } from "../claude/claudeService.js";
import { CLAUDE_CAPABILITIES } from "./capabilities.js";
import type {
  AgentProvider,
  ChatRequestContext,
  NormalizedEvent,
} from "./types.js";
import type { StreamEvent } from "../claude/types.js";
import { logger } from "../../utils/logger.js";

/**
 * 將 StreamEvent（callback 風格）橋接成 AsyncIterable<NormalizedEvent>。
 *
 * 使用 queue + resolver 模式：
 * - 每次 callback 被呼叫，將事件推入 queue
 * - 若 consumer 正在等待（resolver 不為 null），立即 resolve 喚醒
 * - sendMessage Promise resolve 後，補發 session_started 並推入 done sentinel
 * - sendMessage Promise reject 後，推入 error 事件並推入 done sentinel
 */
function buildNormalizedIterable(
  podId: string,
  message: import("../../types/index.js").ContentBlock[] | string,
  opts: {
    sessionId?: string;
    queryKey?: string;
    runContext?: import("../../types/run.js").RunContext;
  },
): AsyncIterable<NormalizedEvent> {
  // sentinel 用於標記 iterable 結束
  const DONE = Symbol("done");

  const queue: (NormalizedEvent | typeof DONE)[] = [];
  let resolver: (() => void) | null = null;
  // 當有資料時，用這個 Promise 來喚醒 consumer
  let notifyPromise: Promise<void> = new Promise((res) => {
    resolver = res;
  });

  function enqueue(item: NormalizedEvent | typeof DONE): void {
    queue.push(item);
    if (resolver) {
      const r = resolver;
      resolver = null;
      notifyPromise = new Promise((res) => {
        resolver = res;
      });
      r();
    }
  }

  function mapStreamEvent(event: StreamEvent): NormalizedEvent | null {
    switch (event.type) {
      case "text":
        return { type: "text", content: event.content };
      case "tool_use":
        return {
          type: "tool_call_start",
          toolUseId: event.toolUseId,
          toolName: event.toolName,
          input: event.input,
        };
      case "tool_result":
        return {
          type: "tool_call_result",
          toolUseId: event.toolUseId,
          toolName: event.toolName,
          output: event.output,
        };
      case "complete":
        return { type: "turn_complete" };
      case "error":
        return { type: "error", message: event.error, fatal: true };
      default:
        return null;
    }
  }

  const onStream = (event: StreamEvent): void => {
    const normalized = mapStreamEvent(event);
    if (normalized) {
      enqueue(normalized);
    }
  };

  // 發起 sendMessage，完成後補發 session_started 並結束 iterable
  claudeService
    .sendMessage(podId, message, onStream, opts)
    .then((resultMessage) => {
      if (resultMessage.sessionId) {
        enqueue({
          type: "session_started",
          sessionId: resultMessage.sessionId,
        });
      }
      enqueue(DONE);
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : "未知錯誤";
      logger.error(
        "Chat",
        "Error",
        `[ClaudeProvider] sendMessage 發生錯誤：${message}`,
      );
      // 若 complete 已透過 callback 發送過 turn_complete，此處仍補送 error
      // 以確保上層感知到失敗（fatal=true）
      enqueue({ type: "error", message, fatal: true });
      enqueue(DONE);
    });

  return {
    [Symbol.asyncIterator](): AsyncIterator<NormalizedEvent> {
      return {
        async next(): Promise<IteratorResult<NormalizedEvent>> {
          // 若 queue 為空，等待下一筆資料
          while (queue.length === 0) {
            await notifyPromise;
          }

          const item = queue.shift()!;

          if (item === DONE) {
            return {
              value: undefined as unknown as NormalizedEvent,
              done: true,
            };
          }

          return { value: item, done: false };
        },
      };
    },
  };
}

/**
 * ClaudeProvider 實作 AgentProvider 介面，將既有 claudeService 包裝成標準化串流。
 */
export const claudeProvider: AgentProvider = {
  name: "claude",

  capabilities: CLAUDE_CAPABILITIES,

  chat(ctx: ChatRequestContext): AsyncIterable<NormalizedEvent> {
    const { podId, message, resumeSessionId, runContext } = ctx;

    return buildNormalizedIterable(podId, message, {
      sessionId: resumeSessionId ?? undefined,
      runContext,
    });
  },

  cancel(podSessionKey: string): boolean {
    return claudeService.abortQuery(podSessionKey);
  },
};
