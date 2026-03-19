import { describe, it, expect, vi } from "vitest";
import { webSocketMockFactory } from "../../helpers/mockWebSocket";
import { setupStoreTest } from "../../helpers/testSetup";
import { useCanvasStore } from "@/stores/canvasStore";
import { usePodStore } from "@/stores/pod/podStore";
import { useIntegrationStore } from "@/stores/integrationStore";
import {
  getIntegrationEventListeners,
  handleIntegrationConnectionStatusChanged,
} from "@/composables/eventHandlers/integrationEventHandlers";

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

describe("integrationEventHandlers", () => {
  setupStoreTest(() => {
    const canvasStore = useCanvasStore();
    canvasStore.activeCanvasId = "canvas-1";
  });

  function findHandler(event: string) {
    const listeners = getIntegrationEventListeners();
    return listeners.find((l) => l.event === event)!.handler;
  }

  describe("getIntegrationEventListeners", () => {
    it("應回傳 4 個 listener", () => {
      const result = getIntegrationEventListeners();
      expect(result).toHaveLength(4);
    });
  });

  describe("handleIntegrationAppCreated（skipCanvasCheck: true）", () => {
    it("app 與 provider 皆存在時應呼叫 addAppFromEvent", () => {
      const store = useIntegrationStore();
      const spy = vi.spyOn(store, "addAppFromEvent");
      const app = { id: "app-1", name: "My App" };

      findHandler("integration:app:created")({ app, provider: "slack" });

      expect(spy).toHaveBeenCalledWith("slack", app);
    });

    it("即使 canvasId 不匹配也應執行（skipCanvasCheck）", () => {
      const store = useIntegrationStore();
      const spy = vi.spyOn(store, "addAppFromEvent");
      const app = { id: "app-1", name: "My App" };

      findHandler("integration:app:created")({
        canvasId: "other-canvas",
        app,
        provider: "slack",
      });

      expect(spy).toHaveBeenCalledWith("slack", app);
    });

    it("app 為 undefined 時不應呼叫 addAppFromEvent", () => {
      const store = useIntegrationStore();
      const spy = vi.spyOn(store, "addAppFromEvent");

      findHandler("integration:app:created")({ provider: "slack" });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handleIntegrationAppDeleted（skipCanvasCheck: true）", () => {
    it("appId 與 provider 皆存在時應呼叫 removeAppFromEvent", () => {
      const store = useIntegrationStore();
      const spy = vi.spyOn(store, "removeAppFromEvent");

      findHandler("integration:app:deleted")({
        appId: "app-1",
        provider: "slack",
      });

      expect(spy).toHaveBeenCalledWith("slack", "app-1");
    });
  });

  describe("handlePodIntegrationBound", () => {
    it("canvasId 匹配且 pod 存在時應呼叫 updatePod", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "updatePod");
      const pod = { id: "pod-1", name: "Pod 1" };

      findHandler("pod:integration:bound")({ canvasId: "canvas-1", pod });

      expect(spy).toHaveBeenCalledWith(pod);
    });

    it("canvasId 不匹配時不應執行", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "updatePod");

      findHandler("pod:integration:bound")({
        canvasId: "other-canvas",
        pod: { id: "pod-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handlePodIntegrationUnbound", () => {
    it("canvasId 匹配且 pod 存在時應呼叫 updatePod", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "updatePod");
      const pod = { id: "pod-1", name: "Pod 1" };

      findHandler("pod:integration:unbound")({ canvasId: "canvas-1", pod });

      expect(spy).toHaveBeenCalledWith(pod);
    });

    it("canvasId 不匹配時不應執行", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "updatePod");

      findHandler("pod:integration:unbound")({
        canvasId: "other-canvas",
        pod: { id: "pod-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handleIntegrationConnectionStatusChanged（standalone）", () => {
    it("應呼叫 integrationStore.updateAppStatus", () => {
      const store = useIntegrationStore();
      const spy = vi.spyOn(store, "updateAppStatus");

      handleIntegrationConnectionStatusChanged({
        provider: "slack",
        appId: "app-1",
        connectionStatus: "connected",
        resources: [{ id: "r-1", name: "Resource 1" }],
      });

      expect(spy).toHaveBeenCalledWith("slack", "app-1", "connected", [
        { id: "r-1", name: "Resource 1" },
      ]);
    });
  });
});
