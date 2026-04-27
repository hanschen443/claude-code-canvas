/**
 * workflowImplMocks.ts
 *
 * workflowExecutionService 測試用的 mock impl 工廠函式。
 * 各函式提供足夠的 stub 行為讓測試能驗證呼叫次數與傳入的參數，
 * 不複製完整的業務邏輯（如佇列管理、worktree 等），
 * 真實 pipeline 執行邏輯留給 workflowPipeline.test.ts 驗證。
 */

import { workflowEventEmitter } from "../../src/services/workflow/index.js";
import { aiDecideService } from "../../src/services/workflow/index.js";
import { workflowMultiInputService } from "../../src/services/workflow/index.js";
import { pendingTargetStore } from "../../src/services/pendingTargetStore.js";
import { connectionStore } from "../../src/services/connectionStore.js";
import { workflowStateService } from "../../src/services/workflow/index.js";
import { summaryService } from "../../src/services/summaryService.js";
import type { Connection } from "../../src/types/index.js";
import type { TriggerStrategy } from "../../src/services/workflow/types.js";

/**
 * 輕量版 pipeline.execute mock：
 * 僅呼叫 summaryService（確保測試能驗證摘要次數），
 * 不複製真實 pipeline 的佇列與觸發邏輯。
 * 真實行為由 workflowPipeline.test.ts 覆蓋。
 */
export function createPipelineExecuteImpl(
  _mockAutoStrategy: TriggerStrategy,
  _mockAiDecideStrategy: TriggerStrategy,
) {
  return async (context: any, _strategy: TriggerStrategy) => {
    // 只呼叫 summaryService 讓測試能驗證呼叫次數，不重複 pipeline 邏輯
    await summaryService.generateSummaryForTarget(
      context.canvasId,
      context.sourcePodId,
      context.connection.targetPodId,
      "claude",
      context.connection.summaryModel ?? "sonnet",
    );
  };
}

/**
 * autoTriggerService.processAutoTriggerConnection mock：
 * 呼叫 mockPipeline.execute 確認分發行為，不重複 autoTrigger 業務邏輯。
 * 多輸入場景下委派給 workflowMultiInputService.handleMultiInputForConnection，
 * 以保留 enqueue 等核心 side effect，行為與真實 pipeline 一致。
 * 真實 autoTrigger 行為由對應服務測試覆蓋。
 */
export function createAutoTriggerProcessImpl(
  mockPipeline: any,
  mockAutoStrategy: TriggerStrategy,
) {
  return async (
    canvasId: string,
    sourcePodId: string,
    connection: Connection,
  ) => {
    const { isMultiInput } = workflowStateService.checkMultiInputScenario(
      canvasId,
      connection.targetPodId,
    );

    if (isMultiInput) {
      // 多輸入場景：委派給 multiInputService 處理（含 enqueue 等 side effect）
      await workflowMultiInputService.handleMultiInputForConnection({
        canvasId,
        sourcePodId,
        connection,
        summary: "test summary",
        triggerMode: "auto",
      });
      return;
    }

    const pipelineContext = {
      canvasId,
      sourcePodId,
      connection,
      triggerMode: "auto" as const,
      decideResult: {
        connectionId: connection.id,
        approved: true,
        reason: null,
      },
    };
    await mockPipeline.execute(pipelineContext, mockAutoStrategy);
  };
}

/**
 * aiDecideTriggerService.processAiDecideConnections mock：
 * 提供與真實服務相同的 side effect（emitAiDecidePending、updateDecideStatus 等），
 * 讓 workflowExecutionService 測試可以驗證這些呼叫是否正確觸發。
 * 不複製完整業務邏輯（如多輸入佇列管理），真實行為由對應服務測試覆蓋。
 */
export function createAiDecideProcessImpl(
  mockPipeline: any,
  mockAiDecideStrategy: TriggerStrategy,
) {
  return async (
    canvasId: string,
    sourcePodId: string,
    connections: Connection[],
  ) => {
    workflowEventEmitter.emitAiDecidePending(
      canvasId,
      connections.map((c) => c.id),
      sourcePodId,
    );

    connections.forEach((conn) => {
      connectionStore.updateDecideStatus(canvasId, conn.id, "pending", null);
    });

    const decision = await aiDecideService.decideConnections(
      canvasId,
      sourcePodId,
      connections,
    );

    for (const result of decision.results) {
      const connection = connections.find((c) => c.id === result.connectionId);
      if (!connection) continue;

      connectionStore.updateDecideStatus(
        canvasId,
        result.connectionId,
        result.shouldTrigger ? "approved" : "rejected",
        result.reason,
      );

      workflowEventEmitter.emitAiDecideResult({
        canvasId,
        connectionId: result.connectionId,
        sourcePodId,
        targetPodId: connection.targetPodId,
        shouldTrigger: result.shouldTrigger,
        reason: result.reason,
      });

      if (result.shouldTrigger) {
        const { isMultiInput } = workflowStateService.checkMultiInputScenario(
          canvasId,
          connection.targetPodId,
        );

        if (isMultiInput) {
          // 多輸入場景：委派給 multiInputService 處理（含 enqueue 等 side effect）
          await workflowMultiInputService.handleMultiInputForConnection({
            canvasId,
            sourcePodId,
            connection,
            summary: "test summary",
            triggerMode: "ai-decide",
          });
        } else {
          const pipelineContext = {
            canvasId,
            sourcePodId,
            connection,
            triggerMode: "ai-decide" as const,
            decideResult: {
              connectionId: connection.id,
              approved: true,
              reason: result.reason,
            },
          };
          await mockPipeline.execute(pipelineContext, mockAiDecideStrategy);
        }
      } else {
        const { isMultiInput } = workflowStateService.checkMultiInputScenario(
          canvasId,
          connection.targetPodId,
        );
        if (
          isMultiInput &&
          pendingTargetStore.hasPendingTarget(connection.targetPodId)
        ) {
          pendingTargetStore.recordSourceRejection(
            connection.targetPodId,
            sourcePodId,
            result.reason,
          );
        }
      }
    }

    for (const errorResult of decision.errors) {
      const connection = connections.find(
        (c) => c.id === errorResult.connectionId,
      );
      if (!connection) continue;

      connectionStore.updateDecideStatus(
        canvasId,
        errorResult.connectionId,
        "error",
        `錯誤：${errorResult.error}`,
      );

      workflowEventEmitter.emitAiDecideError({
        canvasId,
        connectionId: errorResult.connectionId,
        sourcePodId,
        targetPodId: connection.targetPodId,
        error: `錯誤：${errorResult.error}`,
      });
    }
  };
}
