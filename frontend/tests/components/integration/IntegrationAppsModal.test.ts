import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import type { IntegrationApp } from "@/types/integration";

// Dialog：內部使用 reka-ui Dialog（Teleport），jsdom 下 Teleport 目標不存在導致內容不渲染，保留 stub
vi.mock("@/components/ui/dialog", () => ({
  Dialog: {
    name: "Dialog",
    template: '<div v-if="open"><slot /></div>',
    props: ["open"],
  },
  DialogContent: { name: "DialogContent", template: "<div><slot /></div>" },
  DialogHeader: { name: "DialogHeader", template: "<div><slot /></div>" },
  DialogTitle: { name: "DialogTitle", template: "<div><slot /></div>" },
  DialogDescription: {
    name: "DialogDescription",
    template: "<div><slot /></div>",
  },
  DialogFooter: { name: "DialogFooter", template: "<div><slot /></div>" },
}));

function createMockApp(overrides?: Partial<IntegrationApp>): IntegrationApp {
  return {
    id: "app-1",
    name: "Test App",
    connectionStatus: "connected",
    provider: "slack",
    resources: [{ id: "ch-1", label: "#general" }],
    raw: {},
    ...overrides,
  };
}

async function mountComponent(props: { open: boolean; provider: string }) {
  const { default: IntegrationAppsModal } =
    await import("@/components/integration/IntegrationAppsModal.vue");

  return mount(IntegrationAppsModal, {
    props,
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: false,
        }),
      ],
    },
  });
}

describe("IntegrationAppsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Slack provider", () => {
    it("應顯示正確標題", async () => {
      const wrapper = await mountComponent({ open: true, provider: "slack" });
      expect(wrapper.text()).toContain("Slack Apps");
    });

    it("沒有 App 時應顯示空狀態提示", async () => {
      const wrapper = await mountComponent({ open: true, provider: "slack" });
      expect(wrapper.text()).toContain("尚未註冊任何 Slack App");
    });

    it("新增表單根據 provider 渲染正確欄位數（slack=3、含 2 個 password）", async () => {
      const wrapper = await mountComponent({ open: true, provider: "slack" });

      const addButton = wrapper
        .findAll("button")
        .find((b) => b.text().includes("新增 App"));
      await addButton?.trigger("click");

      const inputs = wrapper.findAll("input");
      expect(inputs).toHaveLength(3);
      const passwordInputs = inputs.filter(
        (i) => i.attributes("type") === "password",
      );
      expect(passwordInputs).toHaveLength(2);
    });
  });

  describe("Telegram provider", () => {
    it("應顯��標題且表單只有 2 個欄位", async () => {
      const wrapper = await mountComponent({
        open: true,
        provider: "telegram",
      });
      expect(wrapper.text()).toContain("Telegram Apps");

      const addButton = wrapper
        .findAll("button")
        .find((b) => b.text().includes("新增 App"));
      await addButton?.trigger("click");

      expect(wrapper.findAll("input")).toHaveLength(2);
    });
  });

  describe("Jira provider", () => {
    it("表單 3 個欄位，已有 App 時不顯示 resource badges", async () => {
      const wrapper = await mountComponent({ open: true, provider: "jira" });

      const addButton = wrapper
        .findAll("button")
        .find((b) => b.text().includes("新增 App"));
      await addButton?.trigger("click");
      expect(wrapper.findAll("input")).toHaveLength(3);

      // 注入 jira app 後確認無 resource badge
      const integrationStore = (
        await import("@/stores/integrationStore")
      ).useIntegrationStore();
      integrationStore.apps["jira"] = [
        {
          id: "jira-1",
          name: "my-project",
          connectionStatus: "connected",
          provider: "jira",
          resources: [],
          raw: {},
        },
      ];
      await wrapper.vm.$nextTick();

      // Jira hasNoResource=true，不應出現 resource badge
      expect(wrapper.findAll(".rounded-full.bg-muted")).toHaveLength(0);
    });
  });

  describe("App 列表", () => {
    it("有 App 時應渲染名稱、資源標籤與刪除按鈕", async () => {
      const wrapper = await mountComponent({ open: true, provider: "slack" });
      const integrationStore = (
        await import("@/stores/integrationStore")
      ).useIntegrationStore();
      integrationStore.apps["slack"] = [createMockApp()];

      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain("Test App");
      expect(wrapper.text()).toContain("#general");
      const deleteButtons = wrapper
        .findAll("button")
        .filter((b) => b.find("svg").exists());
      expect(deleteButtons.length).toBeGreaterThan(0);
    });
  });

  describe("表單驗證", () => {
    it("表單未填時確認按鈕 disabled；取消按鈕隱藏表單", async () => {
      const wrapper = await mountComponent({ open: true, provider: "slack" });

      const addButton = wrapper
        .findAll("button")
        .find((b) => b.text().includes("新增 App"));
      await addButton?.trigger("click");

      const confirmButton = wrapper
        .findAll("button")
        .find((b) => b.text().includes("確認新增"));
      expect(confirmButton?.attributes("disabled")).toBeDefined();

      const cancelButton = wrapper
        .findAll("button")
        .find((b) => b.text().includes("取消"));
      await cancelButton?.trigger("click");
      expect(wrapper.findAll("input")).toHaveLength(0);
    });
  });

  describe("關閉行為", () => {
    it("open 為 false 時不應渲染內容", async () => {
      const wrapper = await mountComponent({ open: false, provider: "slack" });
      expect(wrapper.text()).toBe("");
    });
  });

  describe("開啟時自動 refresh", () => {
    it.each([
      ["connected app 觸發 refreshAppResources", "slack", "connected", true],
      [
        "disconnected app 不觸發 refreshAppResources",
        "slack",
        "disconnected",
        false,
      ],
    ])("%s", async (_label, provider, status, shouldCall) => {
      const wrapper = await mountComponent({ open: false, provider });
      const integrationStore = (
        await import("@/stores/integrationStore")
      ).useIntegrationStore();
      integrationStore.apps[provider] = [
        createMockApp({
          id: "app-1",
          connectionStatus: status as "connected" | "disconnected",
        }),
      ];
      integrationStore.refreshAppResources = vi
        .fn()
        .mockResolvedValue(undefined);

      await wrapper.setProps({ open: true });
      await wrapper.vm.$nextTick();

      if (shouldCall) {
        expect(integrationStore.refreshAppResources).toHaveBeenCalledWith(
          provider,
          "app-1",
        );
      } else {
        expect(integrationStore.refreshAppResources).not.toHaveBeenCalled();
      }
    });

    it("Jira provider 開啟時不應觸發 refreshAppResources", async () => {
      const wrapper = await mountComponent({ open: false, provider: "jira" });
      const integrationStore = (
        await import("@/stores/integrationStore")
      ).useIntegrationStore();
      integrationStore.apps["jira"] = [
        {
          id: "jira-1",
          name: "my-project",
          connectionStatus: "connected",
          provider: "jira",
          resources: [],
          raw: {},
        },
      ];
      integrationStore.refreshAppResources = vi
        .fn()
        .mockResolvedValue(undefined);

      await wrapper.setProps({ open: true });
      await wrapper.vm.$nextTick();

      expect(integrationStore.refreshAppResources).not.toHaveBeenCalled();
    });

    it("關閉 modal 時不應觸發 refreshAppResources", async () => {
      const wrapper = await mountComponent({ open: true, provider: "slack" });
      const integrationStore = (
        await import("@/stores/integrationStore")
      ).useIntegrationStore();
      integrationStore.apps["slack"] = [createMockApp()];
      integrationStore.refreshAppResources = vi
        .fn()
        .mockResolvedValue(undefined);

      await wrapper.setProps({ open: false });
      await wrapper.vm.$nextTick();

      expect(integrationStore.refreshAppResources).not.toHaveBeenCalled();
    });
  });
});
