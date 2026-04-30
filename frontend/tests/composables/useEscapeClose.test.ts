import { describe, it, expect, vi, beforeEach } from "vitest";
import { defineComponent, ref } from "vue";
import type { Ref } from "vue";
import { mount } from "@vue/test-utils";
import { useEscapeClose } from "@/composables/useEscapeClose";

/** 建立一個掛載 useEscapeClose 的測試元件 */
const makeWrapper = (onClose: () => void, enabled?: Ref<boolean>) => {
  const Comp = defineComponent({
    setup() {
      useEscapeClose(onClose, enabled);
      return () => null;
    },
  });
  return mount(Comp, { attachTo: document.body });
};

/** 派送 keydown 事件至 document（與元件行為一致） */
const pressKey = (key: string) => {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
};

describe("useEscapeClose", () => {
  let onClose: () => void;

  beforeEach(() => {
    onClose = vi.fn() as () => void;
  });

  it("預設啟用：按 ESC 應呼叫 callback 一次", () => {
    const wrapper = makeWrapper(onClose);
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("enabled=ref(false)：按 ESC 不應呼叫 callback", () => {
    const enabled = ref<boolean>(false);
    const wrapper = makeWrapper(onClose, enabled);
    pressKey("Escape");
    expect(onClose).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("enabled 動態切換：false → true 後按 ESC 應呼叫 callback", () => {
    const enabled = ref<boolean>(false);
    const wrapper = makeWrapper(onClose, enabled);
    pressKey("Escape");
    expect(onClose).not.toHaveBeenCalled();
    // 切換為 true
    enabled.value = true;
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it("按 Enter 不應呼叫 callback", () => {
    const wrapper = makeWrapper(onClose);
    pressKey("Enter");
    expect(onClose).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("按 Space 不應呼叫 callback", () => {
    const wrapper = makeWrapper(onClose);
    pressKey(" ");
    expect(onClose).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("unmount 後按 ESC 不應呼叫 callback", () => {
    const wrapper = makeWrapper(onClose);
    wrapper.unmount();
    pressKey("Escape");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("多次 ESC 連按：每次都應呼叫 callback", () => {
    const wrapper = makeWrapper(onClose);
    pressKey("Escape");
    pressKey("Escape");
    pressKey("Escape");
    expect(onClose).toHaveBeenCalledTimes(3);
    wrapper.unmount();
  });
});
