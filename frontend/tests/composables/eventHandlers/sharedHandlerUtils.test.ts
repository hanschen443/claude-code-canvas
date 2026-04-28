import { describe, it, expect, vi } from "vitest";
import { setupStoreTest } from "../../helpers/testSetup";
import { useCanvasStore } from "@/stores/canvasStore";
import { createUnifiedHandler } from "@/composables/eventHandlers/sharedHandlerUtils";

const { mockLoggerWarn } = vi.hoisted(() => ({
  mockLoggerWarn: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  logger: {
    log: vi.fn(),
    warn: mockLoggerWarn,
    error: vi.fn(),
  },
}));

vi.mock("@/services/websocket/createWebSocketRequest", () => ({
  tryResolvePendingRequest: vi.fn().mockReturnValue(false),
  createWebSocketRequest: vi.fn(),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("createUnifiedHandler", () => {
  setupStoreTest(() => {
    const canvasStore = useCanvasStore();
    canvasStore.activeCanvasId = "canvas-1";
  });

  it("canvasId 為 null 時，handler 被呼叫", () => {
    const handler = vi.fn();
    const unified = createUnifiedHandler(handler);

    unified({ canvasId: null });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("canvasId 為 null 時，不觸發 logger 警告", () => {
    const handler = vi.fn();
    const unified = createUnifiedHandler(handler);

    unified({ canvasId: null });

    expect(mockLoggerWarn).not.toHaveBeenCalled();
  });

  it("canvasId 為 undefined 時，觸發 logger 警告且 handler 不被呼叫", () => {
    const handler = vi.fn();
    const unified = createUnifiedHandler(handler);

    unified({ canvasId: undefined });

    expect(mockLoggerWarn).toHaveBeenCalledOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("canvasId 為有效字串且符合當前 canvas 時，handler 被呼叫", () => {
    const handler = vi.fn();
    const unified = createUnifiedHandler(handler);

    unified({ canvasId: "canvas-1" });

    expect(handler).toHaveBeenCalledOnce();
  });

  it("canvasId 為有效字串但不符合當前 canvas 時，handler 不被呼叫", () => {
    const handler = vi.fn();
    const unified = createUnifiedHandler(handler);

    unified({ canvasId: "other-canvas" });

    expect(handler).not.toHaveBeenCalled();
  });

  it("skipCanvasCheck: true 時，canvasId 缺失也不噴 warning 且 handler 被呼叫", () => {
    const handler = vi.fn();
    const unified = createUnifiedHandler(handler, { skipCanvasCheck: true });

    unified({});

    expect(mockLoggerWarn).not.toHaveBeenCalled();
    expect(handler).toHaveBeenCalledOnce();
  });
});
