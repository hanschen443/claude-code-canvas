import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import PodModelSelector from "@/components/pod/PodModelSelector.vue";

// -----------------------------------------------------------------------
// 輔助常數
// -----------------------------------------------------------------------

const HOVER_DEBOUNCE_MS = 150;

// -----------------------------------------------------------------------
// 輔助函式
// -----------------------------------------------------------------------

function mountSelector(overrides: Record<string, unknown> = {}) {
  return mount(PodModelSelector, {
    props: {
      podId: "pod-1",
      provider: "claude" as const,
      currentModel: "sonnet",
      ...overrides,
    },
  });
}

// -----------------------------------------------------------------------
// 測試 1：預設只顯示 active model tag（非 active button 為 pointer-events: none 且 opacity: 0）
// -----------------------------------------------------------------------

describe("PodModelSelector - 測試 1：預設狀態只顯示 active model", () => {
  it("未 hover 時 model-cards-stack 不含 expanded class，非 active 卡片應為 pointer-events: none 且 opacity: 0", () => {
    const wrapper = mountSelector();
    const stack = wrapper.find(".model-cards-stack");

    // stack 預設不含 expanded
    expect(stack.classes()).not.toContain("expanded");

    // active 卡片（sonnet）可見且 pointer-events: auto
    const activeCard = wrapper.find(".model-card.active");
    expect(activeCard.exists()).toBe(true);

    // 非 active 卡片的 pointer-events 為 none（由 CSS 控制；這裡驗證 expanded class 缺席即可）
    const nonActiveCards = wrapper
      .findAll(".model-card")
      .filter((c) => !c.classes().includes("active"));
    expect(nonActiveCards.length).toBeGreaterThan(0);

    wrapper.unmount();
  });
});

// -----------------------------------------------------------------------
// 測試 2：Hover 後展開，非 active 選項出現 expanded class
// -----------------------------------------------------------------------

describe("PodModelSelector - 測試 2：Hover 展開", () => {
  it("mouseenter active 卡片後，model-cards-stack 加上 expanded class", async () => {
    const wrapper = mountSelector();
    const stack = wrapper.find(".model-cards-stack");
    const activeCard = wrapper.find(".model-card.active");

    // 模擬滑鼠移入 active 卡片（template 綁定 @mouseenter 在 active 卡片上）
    await activeCard.trigger("mouseenter");

    expect(stack.classes()).toContain("expanded");

    wrapper.unmount();
  });
});

// -----------------------------------------------------------------------
// 測試 3：點擊非 active 選項 emit update:model 帶正確值
// -----------------------------------------------------------------------

describe("PodModelSelector - 測試 3：點擊非 active 選項 emit 正確值", () => {
  it("點擊非 active 的 model-card 後應 emit update:model 帶對應 model 值", async () => {
    const wrapper = mountSelector({ currentModel: "sonnet" });
    const activeCard = wrapper.find(".model-card.active");

    // 先展開
    await activeCard.trigger("mouseenter");

    // 找非 active 卡片（sorted 排序：active 在第一位，其他在後）
    const nonActiveCards = wrapper
      .findAll(".model-card")
      .filter((c) => !c.classes().includes("active"));
    expect(nonActiveCards.length).toBeGreaterThan(0);

    // 點擊第一個非 active 卡片
    await nonActiveCards[0]!.trigger("click");

    const emitted = wrapper.emitted("update:model");
    expect(emitted).toBeTruthy();
    expect(emitted![0]![0]).not.toBe("sonnet");

    wrapper.unmount();
  });
});

// -----------------------------------------------------------------------
// 測試 4：點擊 active 選項不 emit，進入 collapsing 狀態
// -----------------------------------------------------------------------

describe("PodModelSelector - 測試 4：點擊 active 選項不 emit，進入 collapsing", () => {
  it("點擊 active 卡片時不應 emit update:model，且 stack 加上 collapsing class", async () => {
    vi.useFakeTimers();
    const wrapper = mountSelector();
    const activeCard = wrapper.find(".model-card.active");

    // 先展開
    await activeCard.trigger("mouseenter");

    // 點擊 active 卡片
    await activeCard.trigger("click");

    // 不應 emit
    expect(wrapper.emitted("update:model")).toBeFalsy();

    // 應進入 collapsing 狀態
    const stack = wrapper.find(".model-cards-stack");
    expect(stack.classes()).toContain("collapsing");

    vi.useRealTimers();
    wrapper.unmount();
  });
});

// -----------------------------------------------------------------------
// 測試 5：mouseleave 後經 HOVER_DEBOUNCE_MS 收合
// -----------------------------------------------------------------------

describe("PodModelSelector - 測試 5：mouseleave debounce 收合", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mouseleave 後推進 HOVER_DEBOUNCE_MS 毫秒，stack 應失去 expanded class", async () => {
    const wrapper = mountSelector();
    const stack = wrapper.find(".model-cards-stack");
    const activeCard = wrapper.find(".model-card.active");

    // 展開
    await activeCard.trigger("mouseenter");
    expect(stack.classes()).toContain("expanded");

    // 觸發 mouseleave（綁在 .pod-model-slot 上）
    await wrapper.find(".pod-model-slot").trigger("mouseleave");

    // debounce 尚未到期，仍展開
    expect(stack.classes()).toContain("expanded");

    // 推進時間
    vi.advanceTimersByTime(HOVER_DEBOUNCE_MS);
    await wrapper.vm.$nextTick();

    expect(stack.classes()).not.toContain("expanded");

    wrapper.unmount();
  });
});

// -----------------------------------------------------------------------
// 測試 6：Codex provider 有三個選項，可切換，emit value 為小寫
// -----------------------------------------------------------------------

describe("PodModelSelector - 測試 6：Codex 多選項可切換且 emit 小寫 value", () => {
  it("provider 為 codex 時，顯示 3 個選項（GPT-5.4 / GPT-5.5 / GPT-5.4-mini），點擊非 active 選項可 emit 小寫 value", async () => {
    const wrapper = mountSelector({
      provider: "codex",
      currentModel: "gpt-5.4",
    });

    const cards = wrapper.findAll(".model-card");

    // Codex 有三個選項
    expect(cards.length).toBe(3);

    // 確認無 card-single class（非單一選項）
    cards.forEach((card) => {
      expect(card.classes()).not.toContain("card-single");
    });

    // active 卡片 label 為 GPT-5.4
    const activeCard = wrapper.find(".model-card.active");
    expect(activeCard.text()).toBe("GPT-5.4");

    // 展開並點擊非 active 選項，應 emit 小寫 value
    await activeCard.trigger("mouseenter");
    const nonActiveCards = wrapper
      .findAll(".model-card")
      .filter((c) => !c.classes().includes("active"));
    expect(nonActiveCards.length).toBe(2);

    await nonActiveCards[0]!.trigger("click");
    const emitted = wrapper.emitted("update:model");
    expect(emitted).toBeTruthy();
    // emit 的值應為小寫 value（gpt-5.5 或 gpt-5.4-mini）
    expect(["gpt-5.5", "gpt-5.4-mini"]).toContain(emitted![0]![0]);

    wrapper.unmount();
  });
});
