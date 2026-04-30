import { describe, it, expect } from "vitest";
import { useContextMenu } from "@/composables/canvas/useContextMenu";

describe("useContextMenu", () => {
  describe("open - 開啟選單", () => {
    it("open 後 visible 應為 true", () => {
      const { state, open } = useContextMenu({ id: "" });
      const event = { clientX: 100, clientY: 200 } as MouseEvent;

      open(event, { id: "item-1" });

      expect(state.value.visible).toBe(true);
    });

    it("open 後 position 應等於 event 座標", () => {
      const { state, open } = useContextMenu({ id: "" });
      const event = { clientX: 150, clientY: 300 } as MouseEvent;

      open(event, { id: "item-1" });

      expect(state.value.position).toEqual({ x: 150, y: 300 });
    });

    it("open 後 data 應更新為傳入的資料", () => {
      const { state, open } = useContextMenu({ id: "" });
      const event = { clientX: 0, clientY: 0 } as MouseEvent;
      const newData = { id: "item-99", name: "updated" };

      open(event, newData);

      expect(state.value.data).toEqual(newData);
    });

    it("多次 open 後應以最後一次為準", () => {
      const { state, open } = useContextMenu({ id: "" });
      const event1 = { clientX: 10, clientY: 20 } as MouseEvent;
      const event2 = { clientX: 50, clientY: 60 } as MouseEvent;

      open(event1, { id: "first" });
      open(event2, { id: "second" });

      expect(state.value.position).toEqual({ x: 50, y: 60 });
      expect(state.value.data).toEqual({ id: "second" });
    });
  });

  describe("close - 關閉選單", () => {
    it("close 後 visible 應為 false", () => {
      const { state, open, close } = useContextMenu({ id: "" });
      const event = { clientX: 100, clientY: 200 } as MouseEvent;

      open(event, { id: "item-1" });
      expect(state.value.visible).toBe(true);

      close();
      expect(state.value.visible).toBe(false);
    });

    it("close 後 position 和 data 應保持不變", () => {
      const { state, open, close } = useContextMenu({ id: "" });
      const event = { clientX: 100, clientY: 200 } as MouseEvent;
      const data = { id: "item-1" };

      open(event, data);
      close();

      expect(state.value.position).toEqual({ x: 100, y: 200 });
      expect(state.value.data).toEqual(data);
    });
  });
});
