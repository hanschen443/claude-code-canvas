import { describe, it, expect, vi } from "vitest";
import { webSocketMockFactory } from "../../helpers/mockWebSocket";
import { setupStoreTest } from "../../helpers/testSetup";
import { useCanvasStore } from "@/stores/canvasStore";
import { usePodStore } from "@/stores/pod/podStore";
import { useChatStore } from "@/stores/chat/chatStore";
import {
  getPodEventListeners,
  handlePodChatUserMessage,
  removeDeletedNotes,
} from "@/composables/eventHandlers/podEventHandlers";

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

describe("podEventHandlers", () => {
  setupStoreTest(() => {
    const canvasStore = useCanvasStore();
    canvasStore.activeCanvasId = "canvas-1";
  });

  function findHandler(event: string) {
    const listeners = getPodEventListeners();
    return listeners.find((l) => l.event === event)!.handler;
  }

  describe("getPodEventListeners", () => {
    it("應回傳正確數量的 listener", () => {
      const result = getPodEventListeners();
      expect(result.length).toBeGreaterThanOrEqual(10);
    });

    it("應包含主要的 pod 事件", () => {
      const result = getPodEventListeners();
      const events = result.map((l) => l.event);
      expect(events).toContain("pod:created");
      expect(events).toContain("pod:moved");
      expect(events).toContain("pod:renamed");
      expect(events).toContain("pod:deleted");
    });
  });

  describe("handlePodCreated", () => {
    it("canvasId 匹配且 pod 存在時應呼叫 addPodFromEvent", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "addPodFromEvent");
      const pod = { id: "pod-1", name: "Pod 1", x: 0, y: 0 };

      findHandler("pod:created")({ canvasId: "canvas-1", pod });

      expect(spy).toHaveBeenCalledWith(pod);
    });

    it("canvasId 不匹配時不應執行", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "addPodFromEvent");

      findHandler("pod:created")({
        canvasId: "other-canvas",
        pod: { id: "pod-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handlePodMoved", () => {
    it("canvasId 匹配且 pod 存在時應呼叫 updatePodPosition", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "updatePodPosition");
      const pod = { id: "pod-1", x: 100, y: 200 };

      findHandler("pod:moved")({ canvasId: "canvas-1", pod });

      expect(spy).toHaveBeenCalledWith("pod-1", 100, 200);
    });

    it("canvasId 不匹配時不應執行", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "updatePodPosition");

      findHandler("pod:moved")({
        canvasId: "other-canvas",
        pod: { id: "pod-1", x: 100, y: 200 },
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handlePodRenamed", () => {
    it("canvasId 匹配時應呼叫 updatePodName", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "updatePodName");

      findHandler("pod:renamed")({
        canvasId: "canvas-1",
        podId: "pod-1",
        name: "新名稱",
      });

      expect(spy).toHaveBeenCalledWith("pod-1", "新名稱");
    });

    it("canvasId 不匹配時不應執行", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "updatePodName");

      findHandler("pod:renamed")({
        canvasId: "other-canvas",
        podId: "pod-1",
        name: "新名稱",
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handlePodDeleted", () => {
    it("canvasId 匹配時應呼叫 removePod", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "removePod");

      findHandler("pod:deleted")({ canvasId: "canvas-1", podId: "pod-1" });

      expect(spy).toHaveBeenCalledWith("pod-1");
    });

    it("canvasId 不匹配時不應執行", () => {
      const podStore = usePodStore();
      const spy = vi.spyOn(podStore, "removePod");

      findHandler("pod:deleted")({ canvasId: "other-canvas", podId: "pod-1" });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handleWorkflowClearResult", () => {
    it("canvasId 匹配且有 clearedPodIds 時應清空對應訊息與輸出", () => {
      const chatStore = useChatStore();
      const podStore = usePodStore();
      const chatSpy = vi.spyOn(chatStore, "clearMessagesByPodIds");
      const podSpy = vi.spyOn(podStore, "clearPodOutputsByIds");

      findHandler("workflow:clear:result")({
        canvasId: "canvas-1",
        clearedPodIds: ["pod-1", "pod-2"],
      });

      expect(chatSpy).toHaveBeenCalledWith(["pod-1", "pod-2"]);
      expect(podSpy).toHaveBeenCalledWith(["pod-1", "pod-2"]);
    });

    it("canvasId 不匹配時不應執行", () => {
      const chatStore = useChatStore();
      const chatSpy = vi.spyOn(chatStore, "clearMessagesByPodIds");

      findHandler("workflow:clear:result")({
        canvasId: "other-canvas",
        clearedPodIds: ["pod-1"],
      });

      expect(chatSpy).not.toHaveBeenCalled();
    });
  });

  describe("handlePodChatUserMessage（standalone）", () => {
    it("應呼叫 chatStore.addRemoteUserMessage", () => {
      const chatStore = useChatStore();
      const spy = vi.spyOn(chatStore, "addRemoteUserMessage");

      handlePodChatUserMessage({
        podId: "pod-1",
        messageId: "msg-1",
        content: "使用者訊息",
        timestamp: "2024-01-01T00:00:00Z",
      });

      expect(spy).toHaveBeenCalledWith(
        "pod-1",
        "msg-1",
        "使用者訊息",
        "2024-01-01T00:00:00Z",
      );
    });
  });

  describe("removeDeletedNotes", () => {
    it("deletedNoteIds 為 undefined 時不應拋錯", () => {
      expect(() => removeDeletedNotes(undefined)).not.toThrow();
    });
  });
});
