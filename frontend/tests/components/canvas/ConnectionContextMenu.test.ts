import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setupStoreTest } from "../../helpers/testSetup";
import ConnectionContextMenu from "@/components/canvas/ConnectionContextMenu.vue";

const mockUpdateConnectionTriggerMode = vi.fn();
const mockUpdateConnectionSummaryModel = vi.fn();
const mockUpdateConnectionAiDecideModel = vi.fn();
const mockToast = vi.fn();

vi.mock("@/stores/connectionStore", () => ({
  useConnectionStore: () => ({
    updateConnectionTriggerMode: mockUpdateConnectionTriggerMode,
    updateConnectionSummaryModel: mockUpdateConnectionSummaryModel,
    updateConnectionAiDecideModel: mockUpdateConnectionAiDecideModel,
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock("lucide-vue-next", () => ({
  Zap: { name: "Zap", template: "<svg />" },
  Brain: { name: "Brain", template: "<svg />" },
  ArrowRight: { name: "ArrowRight", template: "<svg />" },
  ChevronRight: { name: "ChevronRight", template: "<svg />" },
}));

const defaultProps = {
  position: { x: 100, y: 200 },
  connectionId: "conn-123",
  currentTriggerMode: "auto" as const,
  currentSummaryModel: "sonnet" as const,
  currentAiDecideModel: "sonnet" as const,
};

function mountMenu(props = {}) {
  return mount(ConnectionContextMenu, {
    props: { ...defaultProps, ...props },
    attachTo: document.body,
  });
}

/** 展開 Summary Model 子選單 */
async function openSummaryMenu(wrapper: ReturnType<typeof mountMenu>) {
  // 找到 relative wrapper（子選單觸發容器）
  const summaryWrapper = wrapper.find(".relative");
  await summaryWrapper.trigger("mouseenter");
  await wrapper.vm.$nextTick();
}

/** 展開 AI Model 子選單（第二個 .relative 容器） */
async function openAiModelMenu(wrapper: ReturnType<typeof mountMenu>) {
  const relativeWrappers = wrapper.findAll(".relative");
  const aiModelWrapper = relativeWrappers[1]!!;
  await aiModelWrapper.trigger("mouseenter");
  await wrapper.vm.$nextTick();
}

describe("ConnectionContextMenu", () => {
  setupStoreTest();

  describe("Summary Model 區塊渲染", () => {
    it("應顯示 Summary Model 標題文字", () => {
      const wrapper = mountMenu();
      expect(wrapper.text()).toContain("Summary Model");
    });

    it("應顯示 Haiku 選項", async () => {
      const wrapper = mountMenu();
      await openSummaryMenu(wrapper);
      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      expect(haikuBtn).toBeDefined();
      expect(haikuBtn?.exists()).toBe(true);
    });

    it("應顯示 Sonnet 選項", async () => {
      const wrapper = mountMenu();
      await openSummaryMenu(wrapper);
      const buttons = wrapper.findAll("button");
      const sonnetBtn = buttons.find((b) => b.text().includes("Sonnet"));
      expect(sonnetBtn).toBeDefined();
      expect(sonnetBtn?.exists()).toBe(true);
    });

    it("應顯示 Opus 選項", async () => {
      const wrapper = mountMenu();
      await openSummaryMenu(wrapper);
      const buttons = wrapper.findAll("button");
      const opusBtn = buttons.find((b) => b.text().includes("Opus"));
      expect(opusBtn).toBeDefined();
      expect(opusBtn?.exists()).toBe(true);
    });
  });

  describe("Summary Model 選中狀態標記", () => {
    it("currentSummaryModel 為 sonnet 時，Sonnet 按鈕應有選中樣式", async () => {
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);
      const buttons = wrapper.findAll("button");
      const sonnetBtn = buttons.find((b) => b.text().includes("Sonnet"));
      expect(sonnetBtn?.classes()).toContain("bg-secondary");
      expect(sonnetBtn?.classes()).toContain("border-l-2");
    });

    it("currentSummaryModel 為 haiku 時，Haiku 按鈕應有選中樣式", async () => {
      const wrapper = mountMenu({ currentSummaryModel: "haiku" });
      await openSummaryMenu(wrapper);
      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      expect(haikuBtn?.classes()).toContain("bg-secondary");
      expect(haikuBtn?.classes()).toContain("border-l-2");
    });

    it("currentSummaryModel 為 opus 時，Opus 按鈕應有選中樣式", async () => {
      const wrapper = mountMenu({ currentSummaryModel: "opus" });
      await openSummaryMenu(wrapper);
      const buttons = wrapper.findAll("button");
      const opusBtn = buttons.find((b) => b.text().includes("Opus"));
      expect(opusBtn?.classes()).toContain("bg-secondary");
      expect(opusBtn?.classes()).toContain("border-l-2");
    });

    it("currentSummaryModel 為 sonnet 時，Haiku 按鈕不應有選中樣式", async () => {
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);
      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      expect(haikuBtn?.classes()).not.toContain("border-l-2");
    });
  });

  describe("點擊不同模型 - 成功流程", () => {
    it("點擊 Haiku（非當前）應呼叫 updateConnectionSummaryModel 並帶正確參數", async () => {
      mockUpdateConnectionSummaryModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockUpdateConnectionSummaryModel).toHaveBeenCalledWith(
        "conn-123",
        "haiku",
      );
    });

    it("點擊 Opus（非當前）應呼叫 updateConnectionSummaryModel 並帶正確參數", async () => {
      mockUpdateConnectionSummaryModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const opusBtn = buttons.find((b) => b.text().includes("Opus"));
      await opusBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockUpdateConnectionSummaryModel).toHaveBeenCalledWith(
        "conn-123",
        "opus",
      );
    });

    it("切換模型成功後應顯示成功 toast", async () => {
      mockUpdateConnectionSummaryModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "總結模型已變更",
          description: "已切換為 Haiku",
        }),
      );
    });

    it("切換至 Opus 成功後應顯示正確 toast description", async () => {
      mockUpdateConnectionSummaryModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const opusBtn = buttons.find((b) => b.text().includes("Opus"));
      await opusBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "總結模型已變更",
          description: "已切換為 Opus",
        }),
      );
    });

    it("切換模型成功後應 emit summary-model-changed", async () => {
      mockUpdateConnectionSummaryModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("summary-model-changed")).toBeTruthy();
    });

    it("切換模型成功後應 emit close", async () => {
      mockUpdateConnectionSummaryModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("close")).toBeTruthy();
    });
  });

  describe("點擊已選中的模型 - 直接關閉", () => {
    it("點擊已選中的 Sonnet 不應呼叫 updateConnectionSummaryModel", async () => {
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const sonnetBtn = buttons.find((b) => b.text().includes("Sonnet"));
      await sonnetBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockUpdateConnectionSummaryModel).not.toHaveBeenCalled();
    });

    it("點擊已選中的模型應直接 emit close", async () => {
      const wrapper = mountMenu({ currentSummaryModel: "haiku" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("close")).toBeTruthy();
    });

    it("點擊已選中的模型不應顯示 toast", async () => {
      const wrapper = mountMenu({ currentSummaryModel: "opus" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const opusBtn = buttons.find((b) => b.text().includes("Opus"));
      await opusBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockToast).not.toHaveBeenCalled();
    });
  });

  describe("切換模型失敗", () => {
    it("updateConnectionSummaryModel 回傳 null 時應顯示失敗 toast", async () => {
      mockUpdateConnectionSummaryModel.mockResolvedValue(null);
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "變更失敗",
          description: "無法變更總結模型",
        }),
      );
    });

    it("updateConnectionSummaryModel 失敗時不應 emit summary-model-changed", async () => {
      mockUpdateConnectionSummaryModel.mockResolvedValue(null);
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("summary-model-changed")).toBeFalsy();
    });

    it("updateConnectionSummaryModel 失敗時不應 emit close", async () => {
      mockUpdateConnectionSummaryModel.mockResolvedValue(null);
      const wrapper = mountMenu({ currentSummaryModel: "sonnet" });
      await openSummaryMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("close")).toBeFalsy();
    });
  });

  describe("AI Model 區塊渲染", () => {
    it("應顯示 AI Model 標題文字", () => {
      const wrapper = mountMenu();
      expect(wrapper.text()).toContain("AI Model");
    });

    it("triggerMode 為 ai-decide 時，hover 後子選單應出現並顯示 Haiku/Sonnet/Opus 選項", async () => {
      const wrapper = mountMenu({ currentTriggerMode: "ai-decide" });
      await openAiModelMenu(wrapper);

      const buttons = wrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      const sonnetBtn = buttons.find((b) => b.text().includes("Sonnet"));
      const opusBtn = buttons.find((b) => b.text().includes("Opus"));
      expect(haikuBtn?.exists()).toBe(true);
      expect(sonnetBtn?.exists()).toBe(true);
      expect(opusBtn?.exists()).toBe(true);
    });

    it("triggerMode 為 auto 時，AI Model 區塊應有 opacity-50 disabled 樣式", () => {
      const wrapper = mountMenu({ currentTriggerMode: "auto" });
      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      expect(aiModelWrapper.classes()).toContain("opacity-50");
    });

    it("triggerMode 為 auto 時，hover 後不應出現子選單", async () => {
      const wrapper = mountMenu({ currentTriggerMode: "auto" });
      await openAiModelMenu(wrapper);
      // isAiModelMenuOpen 不會被設為 true，因為條件判斷 currentTriggerMode === 'ai-decide'
      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      // 子選單不應存在
      expect(aiModelWrapper.find(".absolute").exists()).toBe(false);
    });

    it("triggerMode 為 direct 時，AI Model 區塊應有 opacity-50 disabled 樣式", () => {
      const wrapper = mountMenu({ currentTriggerMode: "direct" });
      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      expect(aiModelWrapper.classes()).toContain("opacity-50");
    });

    it("triggerMode 為 direct 時，hover 後不應出現子選單", async () => {
      const wrapper = mountMenu({ currentTriggerMode: "direct" });
      await openAiModelMenu(wrapper);
      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      expect(aiModelWrapper.find(".absolute").exists()).toBe(false);
    });
  });

  describe("AI Model 選中狀態標記", () => {
    it("currentAiDecideModel 為 sonnet 時，Sonnet 按鈕應有選中樣式", async () => {
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);
      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const sonnetBtn = buttons.find((b) => b.text().includes("Sonnet"));
      expect(sonnetBtn?.classes()).toContain("bg-secondary");
      expect(sonnetBtn?.classes()).toContain("border-l-2");
    });

    it("currentAiDecideModel 為 haiku 時，Haiku 按鈕應有選中樣式", async () => {
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "haiku",
      });
      await openAiModelMenu(wrapper);
      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      expect(haikuBtn?.classes()).toContain("bg-secondary");
      expect(haikuBtn?.classes()).toContain("border-l-2");
    });

    it("currentAiDecideModel 為 opus 時，Opus 按鈕應有選中樣式", async () => {
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "opus",
      });
      await openAiModelMenu(wrapper);
      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const opusBtn = buttons.find((b) => b.text().includes("Opus"));
      expect(opusBtn?.classes()).toContain("bg-secondary");
      expect(opusBtn?.classes()).toContain("border-l-2");
    });

    it("currentAiDecideModel 為 sonnet 時，Haiku 按鈕不應有選中樣式", async () => {
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);
      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      expect(haikuBtn?.classes()).not.toContain("border-l-2");
    });
  });

  describe("AI Model 點擊不同模型 - 成功流程", () => {
    it("點擊 Haiku（非當前）應呼叫 updateConnectionAiDecideModel 並帶正確參數", async () => {
      mockUpdateConnectionAiDecideModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);

      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockUpdateConnectionAiDecideModel).toHaveBeenCalledWith(
        "conn-123",
        "haiku",
      );
    });

    it("切換模型成功後應顯示 title 為 AI 決策模型已變更 的 toast", async () => {
      mockUpdateConnectionAiDecideModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);

      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "AI 決策模型已變更",
        }),
      );
    });

    it("切換模型成功後應 emit ai-decide-model-changed", async () => {
      mockUpdateConnectionAiDecideModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);

      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("ai-decide-model-changed")).toBeTruthy();
    });

    it("切換模型成功後應 emit close", async () => {
      mockUpdateConnectionAiDecideModel.mockResolvedValue({ id: "conn-123" });
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);

      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("close")).toBeTruthy();
    });
  });

  describe("AI Model 點擊已選中的模型 - 直接關閉", () => {
    it("點擊已選中的模型不應呼叫 updateConnectionAiDecideModel", async () => {
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);

      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const sonnetBtn = buttons.find((b) => b.text().includes("Sonnet"));
      await sonnetBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockUpdateConnectionAiDecideModel).not.toHaveBeenCalled();
    });

    it("點擊已選中的模型應直接 emit close", async () => {
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "haiku",
      });
      await openAiModelMenu(wrapper);

      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("close")).toBeTruthy();
    });
  });

  describe("AI Model 切換模型失敗", () => {
    it("updateConnectionAiDecideModel 回傳 null 時應顯示失敗 toast", async () => {
      mockUpdateConnectionAiDecideModel.mockResolvedValue(null);
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);

      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "變更失敗",
          description: "無法變更 AI 決策模型",
        }),
      );
    });

    it("updateConnectionAiDecideModel 失敗時不應 emit ai-decide-model-changed", async () => {
      mockUpdateConnectionAiDecideModel.mockResolvedValue(null);
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);

      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("ai-decide-model-changed")).toBeFalsy();
    });

    it("updateConnectionAiDecideModel 失敗時不應 emit close", async () => {
      mockUpdateConnectionAiDecideModel.mockResolvedValue(null);
      const wrapper = mountMenu({
        currentTriggerMode: "ai-decide",
        currentAiDecideModel: "sonnet",
      });
      await openAiModelMenu(wrapper);

      const relativeWrappers = wrapper.findAll(".relative");
      const aiModelWrapper = relativeWrappers[1]!;
      const buttons = aiModelWrapper.findAll("button");
      const haikuBtn = buttons.find((b) => b.text().includes("Haiku"));
      await haikuBtn?.trigger("click");
      await wrapper.vm.$nextTick();

      expect(wrapper.emitted("close")).toBeFalsy();
    });
  });
});
