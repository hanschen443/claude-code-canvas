// 模組 mock 必須在 import 之前宣告
vi.mock("../../src/services/connectionStore.js", () => ({
  connectionStore: {
    findByTargetPodId: vi.fn(),
    getById: vi.fn(),
  },
}));

vi.mock("../../src/services/pendingTargetStore.js", () => ({
  pendingTargetStore: {
    getPendingTarget: vi.fn(),
    clearPendingTarget: vi.fn(),
    hasPendingTarget: vi.fn(),
    removeSourceFromAllPending: vi.fn(),
    removeSourceFromPending: vi.fn(),
    getCompletedSummaries: vi.fn(),
  },
}));

vi.mock("../../src/services/podStore.js", () => ({
  podStore: {
    getById: vi.fn(),
  },
}));

vi.mock("../../src/services/directTriggerStore.js", () => ({
  directTriggerStore: {
    hasDirectPending: vi.fn(),
    clearDirectPending: vi.fn(),
  },
}));

vi.mock("../../src/services/workflow/workflowEventEmitter.js", () => ({
  workflowEventEmitter: {
    emitWorkflowPending: vi.fn(),
    emitWorkflowSourcesMerged: vi.fn(),
  },
}));

vi.mock("../../src/services/workflow/workflowDirectTriggerService.js", () => ({
  workflowDirectTriggerService: {
    cancelPendingResolver: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    log: vi.fn(),
  },
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { workflowStateService } from "../../src/services/workflow/workflowStateService.js";
import { connectionStore } from "../../src/services/connectionStore.js";
import { pendingTargetStore } from "../../src/services/pendingTargetStore.js";
import { directTriggerStore } from "../../src/services/directTriggerStore.js";
import { workflowEventEmitter } from "../../src/services/workflow/workflowEventEmitter.js";
import { workflowDirectTriggerService } from "../../src/services/workflow/workflowDirectTriggerService.js";
import {
  createMockConnection,
  TEST_IDS,
} from "../mocks/workflowTestFactories.js";
import type { RunContext } from "../../src/types/run.js";

const { canvasId, targetPodId, sourcePodId, connectionId } = TEST_IDS;

function createMockRunContext(): RunContext {
  return {
    runId: "run-1",
    canvasId,
    triggeredBy: "user",
  } as RunContext;
}

describe("WorkflowStateService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================
  // checkMultiInputScenario
  // ============================================================
  describe("checkMultiInputScenario", () => {
    it("只有一條 auto-triggerable 連線時 isMultiInput 為 false", () => {
      vi.mocked(connectionStore.findByTargetPodId).mockReturnValue([
        createMockConnection({
          id: "c1",
          triggerMode: "auto",
          sourcePodId: "src-1",
        }),
      ]);

      const result = workflowStateService.checkMultiInputScenario(
        canvasId,
        targetPodId,
      );

      expect(result.isMultiInput).toBe(false);
      expect(result.requiredSourcePodIds).toEqual(["src-1"]);
    });

    it("有多條 auto-triggerable 連線時 isMultiInput 為 true", () => {
      vi.mocked(connectionStore.findByTargetPodId).mockReturnValue([
        createMockConnection({
          id: "c1",
          triggerMode: "auto",
          sourcePodId: "src-1",
        }),
        createMockConnection({
          id: "c2",
          triggerMode: "ai-decide",
          sourcePodId: "src-2",
        }),
      ]);

      const result = workflowStateService.checkMultiInputScenario(
        canvasId,
        targetPodId,
      );

      expect(result.isMultiInput).toBe(true);
      expect(result.requiredSourcePodIds).toEqual(["src-1", "src-2"]);
    });

    it("只有 direct 連線時 isMultiInput 為 false，requiredSourcePodIds 為空", () => {
      vi.mocked(connectionStore.findByTargetPodId).mockReturnValue([
        createMockConnection({
          id: "c1",
          triggerMode: "direct",
          sourcePodId: "src-1",
        }),
        createMockConnection({
          id: "c2",
          triggerMode: "direct",
          sourcePodId: "src-2",
        }),
      ]);

      const result = workflowStateService.checkMultiInputScenario(
        canvasId,
        targetPodId,
      );

      expect(result.isMultiInput).toBe(false);
      expect(result.requiredSourcePodIds).toEqual([]);
    });

    it("混合 triggerMode 時只計算 auto-triggerable 的連線", () => {
      vi.mocked(connectionStore.findByTargetPodId).mockReturnValue([
        createMockConnection({
          id: "c1",
          triggerMode: "auto",
          sourcePodId: "src-1",
        }),
        createMockConnection({
          id: "c2",
          triggerMode: "direct",
          sourcePodId: "src-2",
        }),
        createMockConnection({
          id: "c3",
          triggerMode: "ai-decide",
          sourcePodId: "src-3",
        }),
      ]);

      const result = workflowStateService.checkMultiInputScenario(
        canvasId,
        targetPodId,
      );

      expect(result.isMultiInput).toBe(true);
      expect(result.requiredSourcePodIds).toEqual(["src-1", "src-3"]);
    });

    it("沒有任何連線時 isMultiInput 為 false，requiredSourcePodIds 為空", () => {
      vi.mocked(connectionStore.findByTargetPodId).mockReturnValue([]);

      const result = workflowStateService.checkMultiInputScenario(
        canvasId,
        targetPodId,
      );

      expect(result.isMultiInput).toBe(false);
      expect(result.requiredSourcePodIds).toEqual([]);
    });
  });

  // ============================================================
  // getDirectConnectionCount
  // ============================================================
  describe("getDirectConnectionCount", () => {
    it("正確計算 direct 連線數量", () => {
      vi.mocked(connectionStore.findByTargetPodId).mockReturnValue([
        createMockConnection({
          id: "c1",
          triggerMode: "direct",
          sourcePodId: "src-1",
        }),
        createMockConnection({
          id: "c2",
          triggerMode: "direct",
          sourcePodId: "src-2",
        }),
        createMockConnection({
          id: "c3",
          triggerMode: "auto",
          sourcePodId: "src-3",
        }),
      ]);

      const count = workflowStateService.getDirectConnectionCount(
        canvasId,
        targetPodId,
      );

      expect(count).toBe(2);
    });

    it("沒有 direct 連線時回傳 0", () => {
      vi.mocked(connectionStore.findByTargetPodId).mockReturnValue([
        createMockConnection({
          id: "c1",
          triggerMode: "auto",
          sourcePodId: "src-1",
        }),
      ]);

      const count = workflowStateService.getDirectConnectionCount(
        canvasId,
        targetPodId,
      );

      expect(count).toBe(0);
    });

    it("沒有任何連線時回傳 0", () => {
      vi.mocked(connectionStore.findByTargetPodId).mockReturnValue([]);

      const count = workflowStateService.getDirectConnectionCount(
        canvasId,
        targetPodId,
      );

      expect(count).toBe(0);
    });

    it("不計算 ai-decide 連線", () => {
      vi.mocked(connectionStore.findByTargetPodId).mockReturnValue([
        createMockConnection({
          id: "c1",
          triggerMode: "ai-decide",
          sourcePodId: "src-1",
        }),
        createMockConnection({
          id: "c2",
          triggerMode: "direct",
          sourcePodId: "src-2",
        }),
      ]);

      const count = workflowStateService.getDirectConnectionCount(
        canvasId,
        targetPodId,
      );

      expect(count).toBe(1);
    });
  });

  // ============================================================
  // emitPendingStatus
  // ============================================================
  describe("emitPendingStatus", () => {
    it("有 runContext 時直接 return，不呼叫任何 store/emitter", () => {
      const runContext = createMockRunContext();

      workflowStateService.emitPendingStatus(canvasId, targetPodId, runContext);

      expect(pendingTargetStore.getPendingTarget).not.toHaveBeenCalled();
      expect(workflowEventEmitter.emitWorkflowPending).not.toHaveBeenCalled();
    });

    it("pending 不存在時直接 return，不觸發 emitWorkflowPending", () => {
      vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue(undefined);

      workflowStateService.emitPendingStatus(canvasId, targetPodId);

      expect(pendingTargetStore.getPendingTarget).toHaveBeenCalledWith(
        targetPodId,
      );
      expect(workflowEventEmitter.emitWorkflowPending).not.toHaveBeenCalled();
    });

    it("pending 存在時正確組裝 payload 並觸發 emitWorkflowPending", () => {
      const mockPending = {
        requiredSourcePodIds: ["src-1", "src-2", "src-3"],
        completedSources: new Map([["src-1", "Summary 1"]]),
        rejectedSources: new Map([["src-3", "無關"]]),
      };
      vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue(
        mockPending as any,
      );

      workflowStateService.emitPendingStatus(canvasId, targetPodId);

      expect(workflowEventEmitter.emitWorkflowPending).toHaveBeenCalledWith(
        canvasId,
        {
          canvasId,
          targetPodId,
          completedSourcePodIds: ["src-1"],
          pendingSourcePodIds: ["src-2"],
          totalSources: 3,
          completedCount: 1,
          rejectedSourcePodIds: ["src-3"],
          hasRejectedSources: true,
        },
      );
    });

    it("所有來源都已完成或拒絕時 pendingSourcePodIds 為空", () => {
      const mockPending = {
        requiredSourcePodIds: ["src-1", "src-2"],
        completedSources: new Map([["src-1", "Summary 1"]]),
        rejectedSources: new Map([["src-2", "Rejected"]]),
      };
      vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue(
        mockPending as any,
      );

      workflowStateService.emitPendingStatus(canvasId, targetPodId);

      const payload = vi.mocked(workflowEventEmitter.emitWorkflowPending).mock
        .calls[0][1];
      expect(payload.pendingSourcePodIds).toEqual([]);
      expect(payload.hasRejectedSources).toBe(true);
    });

    it("沒有任何 rejection 時 hasRejectedSources 為 false", () => {
      const mockPending = {
        requiredSourcePodIds: ["src-1", "src-2"],
        completedSources: new Map([["src-1", "Summary 1"]]),
        rejectedSources: new Map(),
      };
      vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue(
        mockPending as any,
      );

      workflowStateService.emitPendingStatus(canvasId, targetPodId);

      const payload = vi.mocked(workflowEventEmitter.emitWorkflowPending).mock
        .calls[0][1];
      expect(payload.hasRejectedSources).toBe(false);
      expect(payload.rejectedSourcePodIds).toEqual([]);
    });
  });

  // ============================================================
  // handleSourceDeletion
  // ============================================================
  describe("handleSourceDeletion", () => {
    it("呼叫 removeSourceFromAllPending 並回傳受影響的 targetIds", () => {
      vi.mocked(pendingTargetStore.removeSourceFromAllPending).mockReturnValue([
        "t1",
        "t2",
      ]);
      // processAffectedTarget 內部會呼叫 tryCompletePendingOrClear
      // 讓 getPendingTarget 回傳 undefined 來使 tryCompletePendingOrClear 快速 return
      vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue(undefined);

      const result = workflowStateService.handleSourceDeletion(
        canvasId,
        sourcePodId,
      );

      expect(
        pendingTargetStore.removeSourceFromAllPending,
      ).toHaveBeenCalledWith(sourcePodId);
      expect(result).toEqual(["t1", "t2"]);
    });

    it("沒有受影響的 target 時回傳空陣列", () => {
      vi.mocked(pendingTargetStore.removeSourceFromAllPending).mockReturnValue(
        [],
      );

      const result = workflowStateService.handleSourceDeletion(
        canvasId,
        sourcePodId,
      );

      expect(result).toEqual([]);
    });

    it("受影響 target 的 pending 無剩餘來源時清除 pending", () => {
      vi.mocked(pendingTargetStore.removeSourceFromAllPending).mockReturnValue([
        "t1",
      ]);
      vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue({
        requiredSourcePodIds: [],
        completedSources: new Map(),
        rejectedSources: new Map(),
      } as any);

      workflowStateService.handleSourceDeletion(canvasId, sourcePodId);

      expect(pendingTargetStore.clearPendingTarget).toHaveBeenCalledWith("t1");
    });

    it("多個受影響 target 時逐一處理", () => {
      vi.mocked(pendingTargetStore.removeSourceFromAllPending).mockReturnValue([
        "t1",
        "t2",
        "t3",
      ]);
      vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue(undefined);

      workflowStateService.handleSourceDeletion(canvasId, sourcePodId);

      // getPendingTarget 被呼叫了 3 次（每個 target 各一次）
      expect(pendingTargetStore.getPendingTarget).toHaveBeenCalledTimes(3);
      expect(pendingTargetStore.getPendingTarget).toHaveBeenCalledWith("t1");
      expect(pendingTargetStore.getPendingTarget).toHaveBeenCalledWith("t2");
      expect(pendingTargetStore.getPendingTarget).toHaveBeenCalledWith("t3");
    });
  });

  // ============================================================
  // handleConnectionDeletion
  // ============================================================
  describe("handleConnectionDeletion", () => {
    it("connectionStore 找不到連線時直接 return", () => {
      vi.mocked(connectionStore.getById).mockReturnValue(undefined);

      workflowStateService.handleConnectionDeletion(canvasId, connectionId);

      expect(directTriggerStore.hasDirectPending).not.toHaveBeenCalled();
      expect(pendingTargetStore.hasPendingTarget).not.toHaveBeenCalled();
    });

    describe("triggerMode 為 direct 時", () => {
      const directConnection = createMockConnection({
        id: connectionId,
        triggerMode: "direct",
        sourcePodId,
        targetPodId,
      });

      it("有 directPending 時清除並取消 resolver", () => {
        vi.mocked(connectionStore.getById).mockReturnValue(directConnection);
        vi.mocked(directTriggerStore.hasDirectPending).mockReturnValue(true);

        workflowStateService.handleConnectionDeletion(canvasId, connectionId);

        expect(directTriggerStore.clearDirectPending).toHaveBeenCalledWith(
          targetPodId,
        );
        expect(
          workflowDirectTriggerService.cancelPendingResolver,
        ).toHaveBeenCalledWith(targetPodId);
      });

      it("沒有 directPending 時不清除但仍取消 resolver", () => {
        vi.mocked(connectionStore.getById).mockReturnValue(directConnection);
        vi.mocked(directTriggerStore.hasDirectPending).mockReturnValue(false);

        workflowStateService.handleConnectionDeletion(canvasId, connectionId);

        expect(directTriggerStore.clearDirectPending).not.toHaveBeenCalled();
        expect(
          workflowDirectTriggerService.cancelPendingResolver,
        ).toHaveBeenCalledWith(targetPodId);
      });

      it("不觸發 multi-input 相關邏輯", () => {
        vi.mocked(connectionStore.getById).mockReturnValue(directConnection);
        vi.mocked(directTriggerStore.hasDirectPending).mockReturnValue(false);

        workflowStateService.handleConnectionDeletion(canvasId, connectionId);

        expect(pendingTargetStore.hasPendingTarget).not.toHaveBeenCalled();
        expect(
          pendingTargetStore.removeSourceFromPending,
        ).not.toHaveBeenCalled();
      });
    });

    describe("triggerMode 為 auto-triggerable 時", () => {
      const autoConnection = createMockConnection({
        id: connectionId,
        triggerMode: "auto",
        sourcePodId,
        targetPodId,
      });

      it("有 pendingTarget 時移除來源", () => {
        vi.mocked(connectionStore.getById).mockReturnValue(autoConnection);
        vi.mocked(pendingTargetStore.hasPendingTarget).mockReturnValue(true);
        // tryCompletePendingOrClear 內部呼叫
        vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue(
          undefined,
        );

        workflowStateService.handleConnectionDeletion(canvasId, connectionId);

        expect(pendingTargetStore.removeSourceFromPending).toHaveBeenCalledWith(
          targetPodId,
          sourcePodId,
        );
      });

      it("沒有 pendingTarget 時不做任何操作", () => {
        vi.mocked(connectionStore.getById).mockReturnValue(autoConnection);
        vi.mocked(pendingTargetStore.hasPendingTarget).mockReturnValue(false);

        workflowStateService.handleConnectionDeletion(canvasId, connectionId);

        expect(
          pendingTargetStore.removeSourceFromPending,
        ).not.toHaveBeenCalled();
      });

      it("ai-decide 連線也走 auto-triggerable 分支", () => {
        const aiDecideConnection = createMockConnection({
          id: connectionId,
          triggerMode: "ai-decide",
          sourcePodId,
          targetPodId,
        });
        vi.mocked(connectionStore.getById).mockReturnValue(aiDecideConnection);
        vi.mocked(pendingTargetStore.hasPendingTarget).mockReturnValue(true);
        vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue(
          undefined,
        );

        workflowStateService.handleConnectionDeletion(canvasId, connectionId);

        expect(pendingTargetStore.removeSourceFromPending).toHaveBeenCalledWith(
          targetPodId,
          sourcePodId,
        );
      });

      it("移除來源後若無剩餘來源則清除 pending", () => {
        vi.mocked(connectionStore.getById).mockReturnValue(autoConnection);
        vi.mocked(pendingTargetStore.hasPendingTarget).mockReturnValue(true);
        vi.mocked(pendingTargetStore.getPendingTarget).mockReturnValue({
          requiredSourcePodIds: [],
          completedSources: new Map(),
          rejectedSources: new Map(),
        } as any);

        workflowStateService.handleConnectionDeletion(canvasId, connectionId);

        expect(pendingTargetStore.clearPendingTarget).toHaveBeenCalledWith(
          targetPodId,
        );
      });
    });

    describe("其他非 auto-triggerable triggerMode 時", () => {
      it("不觸發 direct 也不觸發 multi-input 邏輯，直接 return", () => {
        const manualConnection = createMockConnection({
          id: connectionId,
          triggerMode: "manual" as any,
          sourcePodId,
          targetPodId,
        });
        vi.mocked(connectionStore.getById).mockReturnValue(manualConnection);

        workflowStateService.handleConnectionDeletion(canvasId, connectionId);

        expect(directTriggerStore.hasDirectPending).not.toHaveBeenCalled();
        expect(pendingTargetStore.hasPendingTarget).not.toHaveBeenCalled();
        expect(
          pendingTargetStore.removeSourceFromPending,
        ).not.toHaveBeenCalled();
      });
    });
  });
});
