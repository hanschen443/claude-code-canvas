import { claudeService } from "../claude/claudeService.js";
import { CLAUDE_CAPABILITIES } from "./capabilities.js";
import type {
  AgentProvider,
  ChatRequestContext,
  NormalizedEvent,
} from "./types.js";
import type { StreamEvent } from "../claude/types.js";
import { logger } from "../../utils/logger.js";

// ─── createAsyncQueue ────────────────────────────────────────────────────────

/**
 * 泛用的非同步佇列工具，將 push（producer）與 AsyncIterable（consumer）橋接起來。
 *
 * - 支援 back-pressure：佇列長度達 maxSize 時，enqueue 會等待 consumer 消費後才返回
 * - close()：正常結束 iterable
 * - fail(err)：以錯誤結束 iterable
 */
interface AsyncQueue<T> {
  /** 將資料推入佇列；若佇列已滿則 await 等待 consumer 消費（back-pressure） */
  enqueue: (item: T) => Promise<void>;
  /** 正常結束 iterable */
  close: () => void;
  /** 以錯誤結束 iterable */
  fail: (err: unknown) => void;
  /** 消費端的 AsyncIterable */
  asyncIterable: AsyncIterable<T>;
}

function createAsyncQueue<T>(maxSize = 1000): AsyncQueue<T> {
  // sentinel 用於標記 iterable 正常結束
  const DONE = Symbol("done");

  const queue: (T | typeof DONE)[] = [];
  // 若佇列已滿，producer 需等待此 promise resolve
  let backPressureResolve: (() => void) | null = null;
  // consumer 等待新資料時持有的 resolve
  let consumerResolve: (() => void) | null = null;
  let consumerNotify: Promise<void> = new Promise((res) => {
    consumerResolve = res;
  });

  // 儲存 fail() 傳入的錯誤，consumer 看到 DONE 後若此欄位有值則拋出
  let pendingError: unknown = null;

  function wakeConsumer(): void {
    if (consumerResolve) {
      const r = consumerResolve;
      consumerResolve = null;
      consumerNotify = new Promise((res) => {
        consumerResolve = res;
      });
      r();
    }
  }

  async function enqueue(item: T): Promise<void> {
    // 若佇列已達上限，等待 consumer 消費後再繼續（back-pressure）
    while (queue.length >= maxSize) {
      await new Promise<void>((res) => {
        backPressureResolve = res;
      });
    }
    queue.push(item);
    wakeConsumer();
  }

  function close(): void {
    queue.push(DONE);
    wakeConsumer();
  }

  function fail(err: unknown): void {
    pendingError = err;
    queue.push(DONE);
    wakeConsumer();
  }

  const asyncIterable: AsyncIterable<T> = {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        async next(): Promise<IteratorResult<T>> {
          // 等待佇列有資料
          while (queue.length === 0) {
            await consumerNotify;
          }

          const item = queue.shift()!;

          // 消費後解除 back-pressure（若 producer 正在等待）
          if (backPressureResolve) {
            const r = backPressureResolve;
            backPressureResolve = null;
            r();
          }

          if (item === DONE) {
            // 若是錯誤結束，拋出錯誤
            if (pendingError !== null) {
              throw pendingError;
            }
            return { value: undefined as unknown as T, done: true };
          }

          return { value: item, done: false };
        },
      };
    },
  };

  return { enqueue, close, fail, asyncIterable };
}

// ─── buildNormalizedIterable ─────────────────────────────────────────────────

/**
 * 將 StreamEvent（callback 風格）橋接成 AsyncIterable<NormalizedEvent>。
 *
 * 事件順序保證：
 *   session_started（SDK system/init 時立即發出）
 *   → text / tool_call_start / tool_call_result ...
 *   → turn_complete
 *
 * back-pressure：佇列上限 1000，producer 在佇列滿時 await 等待 consumer 消費。
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
  const { enqueue, close, asyncIterable } = createAsyncQueue<NormalizedEvent>();

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
      // enqueue 回傳 Promise，但此 callback 是同步呼叫的介面；
      // back-pressure 邏輯依賴 consumer 速度，此處僅 fire-and-forget。
      // 若需要嚴格 back-pressure，需將上層改為非同步 callback。
      void enqueue(normalized);
    }
  };

  // SDK system/init 觸發時立即發送 session_started（早於任何 StreamEvent）
  const onSessionInit = (sessionId: string): void => {
    void enqueue({ type: "session_started", sessionId });
  };

  // 發起 sendMessage，結束後關閉 iterable
  claudeService
    .sendMessage(podId, message, onStream, opts, onSessionInit)
    .then(() => {
      close();
    })
    .catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "未知錯誤";
      logger.error(
        "Chat",
        "Error",
        `[ClaudeProvider] sendMessage 發生錯誤：${msg}`,
      );
      // 若 complete 已透過 callback 發送過 turn_complete，此處仍補送 error
      // 以確保上層感知到失敗（fatal=true）
      void enqueue({ type: "error", message: msg, fatal: true }).then(() =>
        close(),
      );
    });

  return asyncIterable;
}

// ─── claudeProvider ──────────────────────────────────────────────────────────

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
