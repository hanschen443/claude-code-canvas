import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { workflowQueueService } from "../../src/services/workflow/workflowQueueService.js";
import type { TriggerStrategy } from "../../src/services/workflow/types.js";
import type { ExecutionServiceMethods } from "../../src/services/workflow/types.js";

// ─── 工廠函式（本地定義，不依賴工廠檔）───────────────────────────────────────

function makeStrategy(mode: "auto" | "direct" | "ai-decide"): TriggerStrategy {
  return {
    mode,
    decide: vi.fn().mockResolvedValue([]),
    onTrigger: vi.fn(),
    onComplete: vi.fn(),
    onError: vi.fn(),
    onQueued: vi.fn(),
    onQueueProcessed: vi.fn(),
  } as TriggerStrategy;
}

// ─── 常數 ─────────────────────────────────────────────────────────────────────

const canvasId = "canvas-1";
const targetPodId = "target-pod-1";
const sourcePodId = "source-pod-1";
const connectionId = "conn-1";

describe("WorkflowQueueService", () => {
  const mockExecutionService: ExecutionServiceMethods = {
    generateSummaryWithFallback: vi.fn(),
    triggerWorkflowWithSummary: vi.fn().mockResolvedValue(undefined),
  };

  const mockStrategies = {
    auto: makeStrategy("auto"),
    direct: makeStrategy("direct"),
    "ai-decide": makeStrategy("ai-decide"),
  };

  beforeEach(() => {
    // 每次測試前重新初始化，確保 strategies 可用
    workflowQueueService.init({
      executionService: mockExecutionService,
      strategies: mockStrategies,
    });
    // 清空佇列，避免測試間狀態污染
    while (workflowQueueService.getQueueSize(targetPodId) > 0)
      workflowQueueService.dequeue(targetPodId);
    while (workflowQueueService.getQueueSize("target-pod-2") > 0)
      workflowQueueService.dequeue("target-pod-2");
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("基本功能", () => {
    it("enqueue 正確加入佇列項目", () => {
      const result = workflowQueueService.enqueue({
        canvasId,
        connectionId,
        sourcePodId,
        targetPodId,
        summary: "Test summary",
        isSummarized: true,
        triggerMode: "auto",
      });

      expect(result.position).toBe(1);
      expect(result.queueSize).toBe(1);
      expect(workflowQueueService.getQueueSize(targetPodId)).toBe(1);
    });

    it("dequeue 依 FIFO 順序取出", () => {
      workflowQueueService.enqueue({
        canvasId,
        connectionId: "conn-1",
        sourcePodId: "source-1",
        targetPodId,
        summary: "Summary 1",
        isSummarized: true,
        triggerMode: "auto",
      });

      workflowQueueService.enqueue({
        canvasId,
        connectionId: "conn-2",
        sourcePodId: "source-2",
        targetPodId,
        summary: "Summary 2",
        isSummarized: true,
        triggerMode: "auto",
      });

      workflowQueueService.enqueue({
        canvasId,
        connectionId: "conn-3",
        sourcePodId: "source-3",
        targetPodId,
        summary: "Summary 3",
        isSummarized: true,
        triggerMode: "auto",
      });

      const item1 = workflowQueueService.dequeue(targetPodId);
      expect(item1?.connectionId).toBe("conn-1");

      const item2 = workflowQueueService.dequeue(targetPodId);
      expect(item2?.connectionId).toBe("conn-2");

      const item3 = workflowQueueService.dequeue(targetPodId);
      expect(item3?.connectionId).toBe("conn-3");

      expect(workflowQueueService.getQueueSize(targetPodId)).toBe(0);
    });

    it("佇列為空時 dequeue 回傳 undefined", () => {
      const item = workflowQueueService.dequeue(targetPodId);

      expect(item).toBeUndefined();
    });

    it("getQueueSize 正確回報佇列長度", () => {
      expect(workflowQueueService.getQueueSize(targetPodId)).toBe(0);

      workflowQueueService.enqueue({
        canvasId,
        connectionId: "conn-1",
        sourcePodId,
        targetPodId,
        summary: "Summary 1",
        isSummarized: true,
        triggerMode: "auto",
      });

      expect(workflowQueueService.getQueueSize(targetPodId)).toBe(1);

      workflowQueueService.enqueue({
        canvasId,
        connectionId: "conn-2",
        sourcePodId,
        targetPodId,
        summary: "Summary 2",
        isSummarized: true,
        triggerMode: "auto",
      });

      expect(workflowQueueService.getQueueSize(targetPodId)).toBe(2);
    });
  });
});
