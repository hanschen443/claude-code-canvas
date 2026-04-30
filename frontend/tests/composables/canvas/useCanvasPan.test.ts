import { describe, it, expect, beforeEach, vi } from "vitest";
import { createApp, defineComponent } from "vue";
import { setupStoreTest } from "../../helpers/testSetup";
import { useCanvasPan } from "@/composables/canvas/useCanvasPan";

// Mock useCanvasContext
const mockViewportStore = {
  offset: { x: 0, y: 0 },
  setOffset: vi.fn(),
};

vi.mock("@/composables/canvas/useCanvasContext", () => ({
  useCanvasContext: () => ({
    viewportStore: mockViewportStore,
  }),
}));

// isMacOS mock（可被各測試覆寫）
const mockPlatform = { isMacOS: false };

vi.mock("@/utils/platform", () => ({
  get isMacOS() {
    return mockPlatform.isMacOS;
  },
}));

/**
 * 在 Vue 組件上下文中執行 composable，觸發 onMounted / onUnmounted 生命週期。
 * 回傳 composable 結果與 unmount 函式。
 */
function withSetup<T>(composable: () => T): { result: T; unmount: () => void } {
  let result!: T;
  const app = createApp(
    defineComponent({
      setup() {
        result = composable();
        return {};
      },
      template: "<div></div>",
    }),
  );
  const container = document.createElement("div");
  app.mount(container);
  return {
    result,
    unmount: () => app.unmount(),
  };
}

describe("useCanvasPan", () => {
  setupStoreTest(() => {
    mockViewportStore.offset = { x: 0, y: 0 };
    // 清理任何可能殘留的事件監聽器
    document.dispatchEvent(new MouseEvent("mouseup"));
  });

  describe("startPan", () => {
    it.each([
      { desc: "左鍵（button = 0）", button: 0 },
      { desc: "中鍵（button = 1）", button: 1 },
    ])("非右鍵不應啟動拖曳：$desc", ({ button }) => {
      const { startPan, isPanning } = useCanvasPan();

      const event = new MouseEvent("mousedown", {
        button,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(event, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = event.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(event);

      expect(isPanning.value).toBe(false);
    });

    it("target id 為 canvas 時應啟動拖曳", () => {
      const { startPan, isPanning } = useCanvasPan();

      const event = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(event, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = event.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(event);

      expect(isPanning.value).toBe(true);
    });

    it.each(["canvas-grid", "canvas-content"])(
      "target class 為 %s 時應啟動拖曳",
      (className) => {
        const { startPan, isPanning } = useCanvasPan();

        const event = new MouseEvent("mousedown", {
          button: 2,
          clientX: 100,
          clientY: 200,
        });
        Object.defineProperty(event, "target", {
          value: document.createElement("div"),
          configurable: true,
        });
        const targetElement = event.target as HTMLElement;
        targetElement.classList.add(className);

        startPan(event);

        expect(isPanning.value).toBe(true);
      },
    );

    it("target 非 canvas 相關元素時不應啟動拖曳", () => {
      const { startPan, isPanning } = useCanvasPan();

      const event = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(event, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = event.target as HTMLElement;
      targetElement.id = "some-other-element";

      startPan(event);

      expect(isPanning.value).toBe(false);
    });

    it("啟動拖曳時應重置 hasPanned 為 false", () => {
      const { startPan, hasPanned } = useCanvasPan();

      // 先設定 hasPanned 為 true
      const event1 = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(event1, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement1 = event1.target as HTMLElement;
      targetElement1.id = "canvas";

      startPan(event1);

      // 模擬拖曳超過閾值
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 110,
        clientY: 210,
      });
      document.dispatchEvent(moveEvent);

      // 釋放滑鼠
      const upEvent = new MouseEvent("mouseup");
      document.dispatchEvent(upEvent);

      // 此時 hasPanned 應該為 true，再次啟動時應重置為 false
      const event2 = new MouseEvent("mousedown", {
        button: 2,
        clientX: 150,
        clientY: 150,
      });
      Object.defineProperty(event2, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement2 = event2.target as HTMLElement;
      targetElement2.id = "canvas";

      startPan(event2);

      expect(hasPanned.value).toBe(false);
    });
  });

  describe("拖曳移動", () => {
    it("拖曳時應更新 viewportStore.offset", () => {
      const { startPan } = useCanvasPan();
      mockViewportStore.offset = { x: 50, y: 50 };

      // 啟動拖曳
      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 移動滑鼠
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 150,
        clientY: 250,
      });
      document.dispatchEvent(moveEvent);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(100, 100);
    });

    it("多次拖曳移動應累積計算偏移量", () => {
      const { startPan } = useCanvasPan();
      mockViewportStore.offset = { x: 100, y: 200 };

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 第一次移動
      const moveEvent1 = new MouseEvent("mousemove", {
        clientX: 120,
        clientY: 220,
      });
      document.dispatchEvent(moveEvent1);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(120, 220);

      // 第二次移動
      const moveEvent2 = new MouseEvent("mousemove", {
        clientX: 150,
        clientY: 250,
      });
      document.dispatchEvent(moveEvent2);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(150, 250);
    });

    it("負方向拖曳應正確計算偏移量", () => {
      const { startPan } = useCanvasPan();
      mockViewportStore.offset = { x: 100, y: 100 };

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 200,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 往負方向移動
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 150,
        clientY: 150,
      });
      document.dispatchEvent(moveEvent);

      // dx = -50, dy = -50
      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(50, 50);
    });

    it("未啟動拖曳時 mousemove 不應更新 offset", () => {
      useCanvasPan();

      // 直接觸發 mousemove（未先呼叫 startPan）
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 150,
        clientY: 250,
      });
      document.dispatchEvent(moveEvent);

      expect(mockViewportStore.setOffset).not.toHaveBeenCalled();
    });
  });

  describe("拖曳閾值", () => {
    it("拖曳距離超過 3px 時 hasPanned 應為 true（X 軸）", () => {
      const { startPan, hasPanned } = useCanvasPan();

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 移動 4px（X 軸）
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 104,
        clientY: 200,
      });
      document.dispatchEvent(moveEvent);

      expect(hasPanned.value).toBe(true);
    });

    it("拖曳距離超過 3px 時 hasPanned 應為 true（Y 軸）", () => {
      const { startPan, hasPanned } = useCanvasPan();

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 移動 4px（Y 軸）
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 100,
        clientY: 204,
      });
      document.dispatchEvent(moveEvent);

      expect(hasPanned.value).toBe(true);
    });

    it.each([
      { desc: "X 和 Y 各自未超過 3px（對角線）", toX: 102, toY: 202 },
      { desc: "移動距離未超過 3px（單軸 2px）", toX: 102, toY: 200 },
      { desc: "移動距離剛好 3px（單軸邊界）", toX: 103, toY: 200 },
    ])("hasPanned 應保持 false：$desc", ({ toX, toY }) => {
      const { startPan, hasPanned } = useCanvasPan();

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      const moveEvent = new MouseEvent("mousemove", {
        clientX: toX,
        clientY: toY,
      });
      document.dispatchEvent(moveEvent);

      expect(hasPanned.value).toBe(false);
    });

    it("負方向拖曳距離超過 3px 時 hasPanned 應為 true", () => {
      const { startPan, hasPanned } = useCanvasPan();

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 往負方向移動 4px
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 96,
        clientY: 196,
      });
      document.dispatchEvent(moveEvent);

      expect(hasPanned.value).toBe(true);
    });
  });

  describe("stopPan", () => {
    it("放開滑鼠後 isPanning 應為 false", () => {
      const { startPan, isPanning } = useCanvasPan();

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      expect(isPanning.value).toBe(true);

      // 放開滑鼠
      const upEvent = new MouseEvent("mouseup");
      document.dispatchEvent(upEvent);

      expect(isPanning.value).toBe(false);
    });

    it("放開滑鼠後 hasPanned 不應自動重置", () => {
      const { startPan, hasPanned } = useCanvasPan();

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 拖曳超過閾值
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 110,
        clientY: 210,
      });
      document.dispatchEvent(moveEvent);

      expect(hasPanned.value).toBe(true);

      // 放開滑鼠
      const upEvent = new MouseEvent("mouseup");
      document.dispatchEvent(upEvent);

      // hasPanned 應保持 true
      expect(hasPanned.value).toBe(true);
    });

    it("放開滑鼠後移動滑鼠不應更新 offset", () => {
      const { startPan } = useCanvasPan();
      mockViewportStore.offset = { x: 0, y: 0 };

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 放開滑鼠
      const upEvent = new MouseEvent("mouseup");
      document.dispatchEvent(upEvent);

      vi.clearAllMocks();

      // 放開後移動滑鼠
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 150,
        clientY: 250,
      });
      document.dispatchEvent(moveEvent);

      expect(mockViewportStore.setOffset).not.toHaveBeenCalled();
    });
  });

  describe("onRightClick 回呼", () => {
    it("單純右鍵點擊（未拖曳）放開滑鼠後應觸發 onRightClick", () => {
      const onRightClick = vi.fn();
      const { startPan } = useCanvasPan({ onRightClick });

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 未移動，直接放開滑鼠
      const upEvent = new MouseEvent("mouseup");
      document.dispatchEvent(upEvent);

      expect(onRightClick).toHaveBeenCalledTimes(1);
      expect(onRightClick).toHaveBeenCalledWith(startEvent);
    });

    it("拖曳後放開滑鼠不應觸發 onRightClick", () => {
      const onRightClick = vi.fn();
      const { startPan } = useCanvasPan({ onRightClick });

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 拖曳超過閾值
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 110,
        clientY: 210,
      });
      document.dispatchEvent(moveEvent);

      // 放開滑鼠
      const upEvent = new MouseEvent("mouseup");
      document.dispatchEvent(upEvent);

      expect(onRightClick).not.toHaveBeenCalled();
    });

    it("未提供 onRightClick 選項時放開滑鼠不應報錯", () => {
      const { startPan } = useCanvasPan();

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      expect(() => {
        const upEvent = new MouseEvent("mouseup");
        document.dispatchEvent(upEvent);
      }).not.toThrow();
    });

    it("onRightClick 回呼只會在 mouseup 時觸發，不在 mousedown 時觸發", () => {
      const onRightClick = vi.fn();
      const { startPan } = useCanvasPan({ onRightClick });

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // mousedown 之後，onRightClick 不應被呼叫
      expect(onRightClick).not.toHaveBeenCalled();
    });

    it("拖曳距離未超過閾值時放開滑鼠應觸發 onRightClick", () => {
      const onRightClick = vi.fn();
      const { startPan } = useCanvasPan({ onRightClick });

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 移動距離未超過閾值（2px）
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 102,
        clientY: 200,
      });
      document.dispatchEvent(moveEvent);

      // 放開滑鼠
      const upEvent = new MouseEvent("mouseup");
      document.dispatchEvent(upEvent);

      expect(onRightClick).toHaveBeenCalledTimes(1);
    });
  });

  describe("resetPanState", () => {
    it("應重置 hasPanned 為 false", () => {
      const { startPan, resetPanState, hasPanned } = useCanvasPan();

      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 100,
        clientY: 200,
      });
      Object.defineProperty(startEvent, "target", {
        value: document.createElement("div"),
        configurable: true,
      });
      const targetElement = startEvent.target as HTMLElement;
      targetElement.id = "canvas";

      startPan(startEvent);

      // 拖曳超過閾值
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 110,
        clientY: 210,
      });
      document.dispatchEvent(moveEvent);

      expect(hasPanned.value).toBe(true);

      // 重置狀態
      resetPanState();

      expect(hasPanned.value).toBe(false);
    });

    it("多次呼叫 resetPanState 不應報錯", () => {
      const { resetPanState } = useCanvasPan();

      expect(() => {
        resetPanState();
        resetPanState();
        resetPanState();
      }).not.toThrow();
    });
  });

  describe("handleWheelPan", () => {
    function createWheelEvent(
      overrides: Partial<{
        deltaX: number;
        deltaY: number;
        deltaMode: number;
        shiftKey: boolean;
      }> = {},
    ): WheelEvent {
      const {
        deltaX = 0,
        deltaY = 0,
        deltaMode = 0,
        shiftKey = false,
      } = overrides;
      const event = new WheelEvent("wheel", {
        deltaX,
        deltaY,
        deltaMode,
        shiftKey,
        cancelable: true,
      });
      vi.spyOn(event, "preventDefault");
      return event;
    }

    it("deltaY > 0 時 offset.y 應減少（畫布向上平移）", () => {
      const { handleWheelPan } = useCanvasPan();
      mockViewportStore.offset = { x: 0, y: 100 };

      const event = createWheelEvent({ deltaY: 50 });
      handleWheelPan(event);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(0, 50);
    });

    it("deltaX > 0 時 offset.x 應減少（畫布向左平移）", () => {
      const { handleWheelPan } = useCanvasPan();
      mockViewportStore.offset = { x: 100, y: 0 };

      const event = createWheelEvent({ deltaX: 30 });
      handleWheelPan(event);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(70, 0);
    });

    it("同時有 deltaX 和 deltaY 時兩個方向都應平移", () => {
      const { handleWheelPan } = useCanvasPan();
      mockViewportStore.offset = { x: 200, y: 200 };

      const event = createWheelEvent({ deltaX: 40, deltaY: 60 });
      handleWheelPan(event);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(160, 140);
    });

    it("Firefox line mode（deltaMode=1）時 delta 應乘以 WHEEL_LINE_TO_PX（20）", () => {
      const { handleWheelPan } = useCanvasPan();
      mockViewportStore.offset = { x: 0, y: 0 };

      // deltaY=2，deltaMode=1 → 實際 deltaY = 2 * 20 = 40
      const event = createWheelEvent({ deltaY: 2, deltaMode: 1 });
      handleWheelPan(event);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(0, -40);
    });

    it("Firefox line mode 下 deltaX 也應乘以 WHEEL_LINE_TO_PX", () => {
      const { handleWheelPan } = useCanvasPan();
      mockViewportStore.offset = { x: 0, y: 0 };

      // deltaX=3，deltaMode=1 → 實際 deltaX = 3 * 20 = 60
      const event = createWheelEvent({ deltaX: 3, deltaMode: 1 });
      handleWheelPan(event);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(-60, 0);
    });

    it("Windows Shift+滾輪（非 macOS）時 deltaY 應轉為水平平移", () => {
      mockPlatform.isMacOS = false;
      const { handleWheelPan } = useCanvasPan();
      mockViewportStore.offset = { x: 0, y: 0 };

      // shiftKey=true, deltaX=0, deltaY=50 → deltaX 變為 50, deltaY 變為 0
      const event = createWheelEvent({ deltaY: 50, shiftKey: true });
      handleWheelPan(event);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(-50, 0);
    });

    it("macOS 上 Shift+滾輪不應轉換為水平平移", () => {
      mockPlatform.isMacOS = true;
      const { handleWheelPan } = useCanvasPan();
      mockViewportStore.offset = { x: 0, y: 0 };

      // macOS 不做轉換，deltaY=50 仍為垂直
      const event = createWheelEvent({ deltaY: 50, shiftKey: true });
      handleWheelPan(event);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(0, -50);

      // 恢復預設
      mockPlatform.isMacOS = false;
    });

    it("Windows Shift+滾輪但 deltaX != 0 時不應轉換", () => {
      mockPlatform.isMacOS = false;
      const { handleWheelPan } = useCanvasPan();
      mockViewportStore.offset = { x: 0, y: 0 };

      // deltaX 已有值，不觸發轉換
      const event = createWheelEvent({
        deltaX: 10,
        deltaY: 50,
        shiftKey: true,
      });
      handleWheelPan(event);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(-10, -50);
    });

    it("應呼叫 event.preventDefault()", () => {
      const { handleWheelPan } = useCanvasPan();

      const event = createWheelEvent({ deltaY: 10 });
      handleWheelPan(event);

      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    });
  });

  describe("Space 鍵狀態", () => {
    it("按下 Space 鍵後 isSpacePressed 應變為 true", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());

      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
      );

      expect(result.isSpacePressed.value).toBe(true);

      unmount();
    });

    it("放開 Space 鍵後 isSpacePressed 應變為 false", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());

      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
      );
      expect(result.isSpacePressed.value).toBe(true);

      window.dispatchEvent(
        new KeyboardEvent("keyup", { code: "Space", bubbles: true }),
      );
      expect(result.isSpacePressed.value).toBe(false);

      unmount();
    });

    it("在 input 元素中按 Space 時 isSpacePressed 不應變為 true", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());

      const input = document.createElement("input");
      const keydownEvent = new KeyboardEvent("keydown", {
        code: "Space",
        bubbles: true,
      });
      Object.defineProperty(keydownEvent, "target", {
        value: input,
        configurable: true,
      });
      window.dispatchEvent(keydownEvent);

      expect(result.isSpacePressed.value).toBe(false);

      unmount();
    });

    it("在 textarea 元素中按 Space 時 isSpacePressed 不應變為 true", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());

      const textarea = document.createElement("textarea");
      const keydownEvent = new KeyboardEvent("keydown", {
        code: "Space",
        bubbles: true,
      });
      Object.defineProperty(keydownEvent, "target", {
        value: textarea,
        configurable: true,
      });
      window.dispatchEvent(keydownEvent);

      expect(result.isSpacePressed.value).toBe(false);

      unmount();
    });

    it("在 contentEditable 元素中按 Space 時 isSpacePressed 不應變為 true", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());

      const div = document.createElement("div");
      // jsdom 的 isContentEditable getter 未完整實作，需手動定義
      Object.defineProperty(div, "isContentEditable", {
        value: true,
        configurable: true,
      });
      const keydownEvent = new KeyboardEvent("keydown", {
        code: "Space",
        bubbles: true,
      });
      Object.defineProperty(keydownEvent, "target", {
        value: div,
        configurable: true,
      });
      window.dispatchEvent(keydownEvent);

      expect(result.isSpacePressed.value).toBe(false);

      unmount();
    });

    it("重複觸發 keydown（repeat=true）時 isSpacePressed 應維持 true 不重複處理", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());

      // 第一次按下
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          bubbles: true,
          repeat: false,
        }),
      );
      expect(result.isSpacePressed.value).toBe(true);

      // repeat=true 應忽略（不影響狀態）
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: "Space",
          bubbles: true,
          repeat: true,
        }),
      );
      expect(result.isSpacePressed.value).toBe(true);

      unmount();
    });

    it("unmount 後 Space 鍵事件不應再影響狀態", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());

      unmount();

      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
      );
      expect(result.isSpacePressed.value).toBe(false);
    });
  });

  describe("startSpacePan", () => {
    it("Space 鍵按下後左鍵拖拽應更新 viewportStore.offset", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());
      mockViewportStore.offset = { x: 100, y: 100 };

      // 按下 Space
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
      );

      // 啟動 Space 拖拽
      const startEvent = new MouseEvent("mousedown", {
        button: 0,
        clientX: 200,
        clientY: 200,
      });
      result.startSpacePan(startEvent);

      expect(result.isSpacePanning.value).toBe(true);

      // 移動滑鼠
      const moveEvent = new MouseEvent("mousemove", {
        clientX: 250,
        clientY: 260,
      });
      document.dispatchEvent(moveEvent);

      expect(mockViewportStore.setOffset).toHaveBeenCalledWith(150, 160);

      unmount();
    });

    it("非左鍵呼叫 startSpacePan 不應啟動拖拽", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());

      // 按下 Space
      window.dispatchEvent(
        new KeyboardEvent("keydown", { code: "Space", bubbles: true }),
      );

      // 右鍵（button=2）不應啟動
      const startEvent = new MouseEvent("mousedown", {
        button: 2,
        clientX: 200,
        clientY: 200,
      });
      result.startSpacePan(startEvent);

      expect(result.isSpacePanning.value).toBe(false);

      unmount();
    });

    it("未按 Space 鍵時呼叫 startSpacePan 不應啟動拖拽", () => {
      const { result, unmount } = withSetup(() => useCanvasPan());

      // isSpacePressed 為 false，直接呼叫
      const startEvent = new MouseEvent("mousedown", {
        button: 0,
        clientX: 200,
        clientY: 200,
      });
      result.startSpacePan(startEvent);

      expect(result.isSpacePanning.value).toBe(false);

      unmount();
    });
  });
});
