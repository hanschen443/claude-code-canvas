import { describe, it, expect, vi } from "vitest";
import { createWorkflowEventHandlers } from "@/stores/workflowEventHandlers";
import type { Connection, ConnectionStatus } from "@/types/connection";

/**
 * 建立 mock WorkflowHandlerStore，用以驗證 handler 呼叫
 */
function createMockStore(connections: Connection[] = []) {
  return {
    connections,
    findConnectionById: vi.fn((id: string) =>
      connections.find((c) => c.id === id),
    ),
    updateAutoGroupStatus: vi.fn(),
    setConnectionStatus: vi.fn(),
  };
}

function createMockConnection(overrides?: Partial<Connection>): Connection {
  return {
    id: "conn-1",
    sourcePodId: "pod-source",
    sourceAnchor: "bottom",
    targetPodId: "pod-target",
    targetAnchor: "top",
    triggerMode: "auto",
    ...overrides,
  } as Connection;
}

describe("workflowEventHandlers", () => {
  describe("handleWorkflowAutoTriggered", () => {
    it("應呼叫 updateAutoGroupStatus 將 targetPodId 設為 active", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowAutoTriggered({
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
        transferredContent: "內容",
        isSummarized: false,
      });

      expect(store.updateAutoGroupStatus).toHaveBeenCalledWith(
        "pod-target",
        "active",
      );
    });
  });

  describe("handleWorkflowAiDecideTriggered", () => {
    it("應呼叫 updateAutoGroupStatus 將 targetPodId 設為 active", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowAiDecideTriggered({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
      });

      expect(store.updateAutoGroupStatus).toHaveBeenCalledWith(
        "pod-target",
        "active",
      );
    });
  });

  describe("handleWorkflowComplete", () => {
    it("triggerMode 為 auto 時應呼叫 updateAutoGroupStatus 設為 idle", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowComplete({
        connectionId: "conn-1",
        targetPodId: "pod-target",
        triggerMode: "auto",
        requestId: "req-1",
        success: true,
      });

      expect(store.updateAutoGroupStatus).toHaveBeenCalledWith(
        "pod-target",
        "idle",
      );
      expect(store.setConnectionStatus).not.toHaveBeenCalled();
    });

    it("triggerMode 為 ai-decide 時應呼叫 updateAutoGroupStatus 設為 idle", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowComplete({
        connectionId: "conn-1",
        targetPodId: "pod-target",
        triggerMode: "ai-decide",
        requestId: "req-1",
        success: true,
      });

      expect(store.updateAutoGroupStatus).toHaveBeenCalledWith(
        "pod-target",
        "idle",
      );
      expect(store.setConnectionStatus).not.toHaveBeenCalled();
    });

    it("triggerMode 為 direct 時應呼叫 setConnectionStatus 設為 idle", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowComplete({
        connectionId: "conn-1",
        targetPodId: "pod-target",
        triggerMode: "direct",
        requestId: "req-1",
        success: true,
      });

      expect(store.setConnectionStatus).toHaveBeenCalledWith("conn-1", "idle");
      expect(store.updateAutoGroupStatus).not.toHaveBeenCalled();
    });

    it("triggerMode 為 undefined 時應呼叫 setConnectionStatus（非 auto-triggerable）", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowComplete({
        connectionId: "conn-1",
        targetPodId: "pod-target",
        requestId: "req-1",
        success: true,
      });

      expect(store.setConnectionStatus).toHaveBeenCalledWith("conn-1", "idle");
    });
  });

  describe("handleWorkflowDirectTriggered", () => {
    it("應呼叫 setConnectionStatus 設為 active", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowDirectTriggered({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
        transferredContent: "內容",
        isSummarized: false,
      });

      expect(store.setConnectionStatus).toHaveBeenCalledWith(
        "conn-1",
        "active",
      );
    });
  });

  describe("handleWorkflowDirectWaiting", () => {
    it("應呼叫 setConnectionStatus 設為 waiting", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowDirectWaiting({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
      });

      expect(store.setConnectionStatus).toHaveBeenCalledWith(
        "conn-1",
        "waiting",
      );
    });
  });

  describe("handleWorkflowQueued", () => {
    it("triggerMode 為 auto 時應呼叫 updateAutoGroupStatus 設為 queued", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowQueued({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
        position: 1,
        queueSize: 2,
        triggerMode: "auto",
      });

      expect(store.updateAutoGroupStatus).toHaveBeenCalledWith(
        "pod-target",
        "queued",
      );
    });

    it("triggerMode 為 direct 時應呼叫 setConnectionStatus 設為 queued", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowQueued({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
        position: 1,
        queueSize: 2,
        triggerMode: "direct",
      });

      expect(store.setConnectionStatus).toHaveBeenCalledWith(
        "conn-1",
        "queued",
      );
    });
  });

  describe("handleWorkflowQueueProcessed", () => {
    it("triggerMode 為 auto 時應呼叫 updateAutoGroupStatus 設為 active", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowQueueProcessed({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
        remainingQueueSize: 0,
        triggerMode: "auto",
      });

      expect(store.updateAutoGroupStatus).toHaveBeenCalledWith(
        "pod-target",
        "active",
      );
    });

    it("triggerMode 為 direct 時應呼叫 setConnectionStatus 設為 active", () => {
      const store = createMockStore();
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleWorkflowQueueProcessed({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
        remainingQueueSize: 0,
        triggerMode: "direct",
      });

      expect(store.setConnectionStatus).toHaveBeenCalledWith(
        "conn-1",
        "active",
      );
    });
  });

  describe("handleAiDecidePending", () => {
    it("應將所有指定 connection 設為 ai-deciding", () => {
      const conn1 = createMockConnection({ id: "conn-1" });
      const conn2 = createMockConnection({ id: "conn-2" });
      const store = createMockStore([conn1, conn2]);
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleAiDecidePending({
        canvasId: "canvas-1",
        connectionIds: ["conn-1", "conn-2"],
        sourcePodId: "pod-source",
      });

      expect(conn1.status).toBe("ai-deciding");
      expect(conn2.status).toBe("ai-deciding");
    });
  });

  describe("handleAiDecideResult", () => {
    it("shouldTrigger 為 true 時應將 connection 設為 ai-approved", () => {
      const conn = createMockConnection({ id: "conn-1" });
      const store = createMockStore([conn]);
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleAiDecideResult({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
        shouldTrigger: true,
        reason: "",
      });

      expect(conn.status).toBe("ai-approved");
      expect(conn.decideReason).toBeUndefined();
    });

    it("shouldTrigger 為 false 時應將 connection 設為 ai-rejected 並記錄原因", () => {
      const conn = createMockConnection({ id: "conn-1" });
      const store = createMockStore([conn]);
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleAiDecideResult({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
        shouldTrigger: false,
        reason: "條件不符",
      });

      expect(conn.status).toBe("ai-rejected");
      expect(conn.decideReason).toBe("條件不符");
    });

    it("找不到 connection 時不應拋錯", () => {
      const store = createMockStore([]);
      const handlers = createWorkflowEventHandlers(store);

      expect(() => {
        handlers.handleAiDecideResult({
          canvasId: "canvas-1",
          connectionId: "nonexistent",
          sourcePodId: "pod-source",
          targetPodId: "pod-target",
          shouldTrigger: true,
          reason: "",
        });
      }).not.toThrow();
    });
  });

  describe("handleAiDecideError", () => {
    it("應將 connection 設為 ai-error 並記錄錯誤訊息", () => {
      const conn = createMockConnection({ id: "conn-1" });
      const store = createMockStore([conn]);
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleAiDecideError({
        canvasId: "canvas-1",
        connectionId: "conn-1",
        sourcePodId: "pod-source",
        targetPodId: "pod-target",
        error: "API 逾時",
      });

      expect(conn.status).toBe("ai-error");
      expect(conn.decideReason).toBe("API 逾時");
    });
  });

  describe("handleAiDecideClear", () => {
    it("應將指定的 connection 狀態重設為 idle", () => {
      const conn1 = createMockConnection({
        id: "conn-1",
        status: "ai-deciding" as ConnectionStatus,
      });
      const conn2 = createMockConnection({
        id: "conn-2",
        status: "ai-approved" as ConnectionStatus,
      });
      const store = createMockStore([conn1, conn2]);
      const handlers = createWorkflowEventHandlers(store);

      handlers.handleAiDecideClear({
        canvasId: "canvas-1",
        connectionIds: ["conn-1", "conn-2"],
      });

      expect(conn1.status).toBe("idle");
      expect(conn2.status).toBe("idle");
    });
  });

  describe("clearAiDecideStatusByConnectionIds", () => {
    it("應將所有指定 connection 狀態重設為 idle", () => {
      const conn1 = createMockConnection({
        id: "conn-1",
        status: "ai-error" as ConnectionStatus,
      });
      const store = createMockStore([conn1]);
      const handlers = createWorkflowEventHandlers(store);

      handlers.clearAiDecideStatusByConnectionIds(["conn-1"]);

      expect(conn1.status).toBe("idle");
      expect(conn1.decideReason).toBeUndefined();
    });
  });
});
