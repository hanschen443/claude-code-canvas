import { describe, it, expect, vi } from "vitest";
import { webSocketMockFactory } from "../../helpers/mockWebSocket";
import { setupStoreTest } from "../../helpers/testSetup";
import { useCanvasStore } from "@/stores/canvasStore";
import { useConnectionStore } from "@/stores/connectionStore";
import { getConnectionEventListeners } from "@/composables/eventHandlers/connectionEventHandlers";

vi.mock("@/services/websocket", () => webSocketMockFactory());

vi.mock("@/services/websocket/createWebSocketRequest", () => ({
  tryResolvePendingRequest: vi.fn().mockReturnValue(false),
  createWebSocketRequest: vi.fn(),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("connectionEventHandlers", () => {
  setupStoreTest(() => {
    const canvasStore = useCanvasStore();
    canvasStore.activeCanvasId = "canvas-1";
  });

  function findHandler(event: string) {
    const listeners = getConnectionEventListeners();
    return listeners.find((l) => l.event === event)!.handler;
  }

  describe("getConnectionEventListeners", () => {
    it("應回傳 3 個 listener", () => {
      const result = getConnectionEventListeners();
      expect(result).toHaveLength(3);
    });
  });

  describe("handleConnectionCreated", () => {
    it("canvasId 匹配且 connection 存在時應呼叫 addConnectionFromEvent", () => {
      const connectionStore = useConnectionStore();
      const spy = vi.spyOn(connectionStore, "addConnectionFromEvent");
      const connection = {
        id: "conn-1",
        sourcePodId: "pod-1",
        sourceAnchor: "bottom",
        targetPodId: "pod-2",
        targetAnchor: "top",
        triggerMode: "auto",
      };

      findHandler("connection:created")({ canvasId: "canvas-1", connection });

      expect(spy).toHaveBeenCalledWith(connection);
    });

    it("canvasId 不匹配時不應執行", () => {
      const connectionStore = useConnectionStore();
      const spy = vi.spyOn(connectionStore, "addConnectionFromEvent");

      findHandler("connection:created")({
        canvasId: "other-canvas",
        connection: { id: "conn-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });

    it("connection 為 undefined 時不應呼叫 addConnectionFromEvent", () => {
      const connectionStore = useConnectionStore();
      const spy = vi.spyOn(connectionStore, "addConnectionFromEvent");

      findHandler("connection:created")({ canvasId: "canvas-1" });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handleConnectionUpdated", () => {
    it("canvasId 匹配且 connection 存在時應呼叫 updateConnectionFromEvent", () => {
      const connectionStore = useConnectionStore();
      const spy = vi.spyOn(connectionStore, "updateConnectionFromEvent");
      const connection = { id: "conn-1", triggerMode: "direct" };

      findHandler("connection:updated")({ canvasId: "canvas-1", connection });

      expect(spy).toHaveBeenCalledWith(connection);
    });

    it("canvasId 不匹配時不應執行", () => {
      const connectionStore = useConnectionStore();
      const spy = vi.spyOn(connectionStore, "updateConnectionFromEvent");

      findHandler("connection:updated")({
        canvasId: "other-canvas",
        connection: { id: "conn-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handleConnectionDeleted", () => {
    it("canvasId 匹配時應呼叫 removeConnectionFromEvent", () => {
      const connectionStore = useConnectionStore();
      const spy = vi.spyOn(connectionStore, "removeConnectionFromEvent");

      findHandler("connection:deleted")({
        canvasId: "canvas-1",
        connectionId: "conn-1",
      });

      expect(spy).toHaveBeenCalledWith("conn-1");
    });

    it("canvasId 不匹配時不應執行", () => {
      const connectionStore = useConnectionStore();
      const spy = vi.spyOn(connectionStore, "removeConnectionFromEvent");

      findHandler("connection:deleted")({
        canvasId: "other-canvas",
        connectionId: "conn-1",
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
