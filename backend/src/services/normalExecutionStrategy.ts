import type { PersistedMessage } from "../types/persistence.js";
import type { PodStatus } from "../types/pod.js";
import type { RunContext } from "../types/run.js";
import type { ContentBlock } from "../types/index.js";
import { isPodBusy } from "../types/pod.js";
import { podStore } from "./podStore.js";
import { messageStore } from "./messageStore.js";
import { injectUserMessage } from "../utils/chatHelpers.js";
import { createNormalEmitStrategy } from "./chatEmitStrategy.js";
import type {
  ChatEmitStrategy,
  ExecutionStrategy,
} from "./executionStrategy.js";

/**
 * Normal mode 的執行策略實作。
 * 狀態寫入 podStore、訊息寫入 messageStore、使用 POD WebSocket 事件。
 */
export class NormalModeExecutionStrategy implements ExecutionStrategy {
  constructor(private readonly canvasId: string) {}

  setStatus(podId: string, status: PodStatus): void {
    podStore.setStatus(this.canvasId, podId, status);
  }

  getSessionId(podId: string): string | undefined {
    const result = podStore.getByIdGlobal(podId);
    return result?.pod.claudeSessionId ?? undefined;
  }

  getQueryKey(podId: string): string {
    return podId;
  }

  createEmitStrategy(): ChatEmitStrategy {
    return createNormalEmitStrategy();
  }

  persistMessage(podId: string, message: PersistedMessage): void {
    messageStore.upsertMessage(this.canvasId, podId, message);
  }

  async addUserMessage(
    podId: string,
    content: string | ContentBlock[],
  ): Promise<void> {
    await injectUserMessage({ canvasId: this.canvasId, podId, content });
  }

  isBusy(podId: string): boolean {
    const pod = podStore.getById(this.canvasId, podId);
    if (!pod) return false;
    return isPodBusy(pod.status);
  }

  onStreamComplete(podId: string, sessionId: string | undefined): void {
    podStore.setStatus(this.canvasId, podId, "idle");
    if (sessionId) {
      podStore.setClaudeSessionId(this.canvasId, podId, sessionId);
    }
  }

  onStreamStart(_podId: string): void {
    // Normal mode 不需要額外處理
  }

  onStreamAbort(podId: string, _reason: string): void {
    podStore.setStatus(this.canvasId, podId, "idle");
  }

  onStreamError(podId: string): void {
    podStore.setStatus(this.canvasId, podId, "idle");
  }

  getRunContext(): RunContext | undefined {
    return undefined;
  }
}
