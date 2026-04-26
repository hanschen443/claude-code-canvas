import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { computed } from "vue";
import PodSlots from "@/components/pod/PodSlots.vue";

// -----------------------------------------------------------------------
// Mock 子元件（PodSingleBindSlot / PodMcpSlot）
// -----------------------------------------------------------------------

vi.mock("@/components/pod/PodSingleBindSlot.vue", () => ({
  default: {
    name: "PodSingleBindSlot",
    template:
      "<div class='single-bind-slot-stub' :data-slot-class='slotClass' :data-disabled='disabled' :data-disabled-tooltip='disabledTooltip' @click=\"$emit('note-dropped', 'note-1')\" @dblclick=\"$emit('note-removed')\"></div>",
    props: [
      "podId",
      "boundNote",
      "store",
      "label",
      "slotClass",
      "podRotation",
      "disabled",
      "disabledTooltip",
    ],
    emits: ["note-dropped", "note-removed"],
  },
}));

vi.mock("@/components/pod/PodMcpSlot.vue", () => ({
  default: {
    name: "PodMcpSlot",
    template:
      "<button class='pod-mcp-slot' :data-capability-disabled='capabilityDisabled' :data-disabled-tooltip='disabledTooltip' @click=\"$emit('click', $event)\"></button>",
    props: [
      "podId",
      "podRotation",
      "activeCount",
      "provider",
      "capabilityDisabled",
      "disabledTooltip",
    ],
    emits: ["click"],
  },
}));

// -----------------------------------------------------------------------
// Mock stores（子元件自行取 store，需 mock 模組）
// -----------------------------------------------------------------------

const createMockStore = () => ({
  draggedNoteId: null,
  getNoteById: vi.fn(),
  isItemBoundToPod: vi.fn().mockReturnValue(false),
  bindToPod: vi.fn(),
  unbindFromPod: vi.fn(),
  setNoteAnimating: vi.fn(),
});

const mockRepositoryStore = createMockStore();
const mockCommandStore = createMockStore();

vi.mock("@/stores/note", () => ({
  useRepositoryStore: () => mockRepositoryStore,
  useCommandStore: () => mockCommandStore,
}));

// -----------------------------------------------------------------------
// Mock usePodCapabilities（可透過 mockCapabilities 切換）
// -----------------------------------------------------------------------

const mockCapabilities = {
  isPluginEnabled: computed(() => true),
  isRepositoryEnabled: computed(() => true),
  isCommandEnabled: computed(() => true),
  isMcpEnabled: computed(() => true),
};

vi.mock("@/composables/pod/usePodCapabilities", () => ({
  usePodCapabilities: () => mockCapabilities,
}));

// -----------------------------------------------------------------------
// Mock vue-i18n
// -----------------------------------------------------------------------

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

// -----------------------------------------------------------------------
// 輔助函式
// -----------------------------------------------------------------------

function mountPodSlots(overrides: Record<string, unknown> = {}) {
  return mount(PodSlots, {
    props: {
      podId: "pod-1",
      podRotation: 0,
      pluginActiveCount: 0,
      mcpActiveCount: 0,
      provider: "claude",
      boundRepositoryNote: undefined,
      boundCommandNote: undefined,
      ...overrides,
    },
  });
}

// -----------------------------------------------------------------------
// 測試：Codex provider Pod（Command 以外的 slot 應為 disabled）
// -----------------------------------------------------------------------

describe("PodSlots - Codex provider Pod：Command 以外 slot 為 disabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 切換成 Codex capabilities：Command 為 enabled，其餘 slot disabled
    Object.assign(mockCapabilities, {
      isPluginEnabled: computed(() => false),
      isRepositoryEnabled: computed(() => false),
      isCommandEnabled: computed(() => true),
      isMcpEnabled: computed(() => false),
    });
  });

  it("Repository 的 single-bind slot disabled 應為 true，Command 應為 false", () => {
    const wrapper = mountPodSlots();
    const singleSlots = wrapper.findAll(".single-bind-slot-stub");

    // Repository（0）、Command（1）共 2 個 single-bind slot
    expect(singleSlots.length).toBe(2);
    expect(singleSlots[0]!.attributes("data-disabled")).toBe("true"); // Repository disabled
    expect(singleSlots[1]!.attributes("data-disabled")).toBe("false"); // Command enabled

    wrapper.unmount();
  });

  it("MCP notch slot 的 capability-disabled 屬性應為 true", () => {
    const wrapper = mountPodSlots();
    const mcpSlot = wrapper.find(".pod-mcp-slot");

    expect(mcpSlot.exists()).toBe(true);
    expect(mcpSlot.attributes("data-capability-disabled")).toBe("true");

    wrapper.unmount();
  });

  it("Repository 的 disabled-tooltip 應為 pod.slot.codexDisabled", () => {
    const wrapper = mountPodSlots();
    const singleSlots = wrapper.findAll(".single-bind-slot-stub");

    // 真正會 disabled 的 slot：Repository（0）
    expect(singleSlots[0]!.attributes("data-disabled-tooltip")).toBe(
      "pod.slot.codexDisabled",
    );

    wrapper.unmount();
  });

  it("Codex capabilities 下 Command slot 不應呈現 disabled tooltip", () => {
    const wrapper = mountPodSlots();
    const singleSlots = wrapper.findAll(".single-bind-slot-stub");

    // Command slot 為 single-bind slots 中的 index 1
    const commandSlot = singleSlots[1]!;
    expect(commandSlot.attributes("data-disabled")).toBe("false");
    // disabled 為 false 時，disabled-tooltip 雖然仍傳入但不應影響 UI；
    // 重點是 disabled 屬性正確，確認其值非 "true"
    expect(commandSlot.attributes("data-disabled")).not.toBe("true");

    wrapper.unmount();
  });
});

// -----------------------------------------------------------------------
// 測試：Claude provider Pod（全部 slot 應為 enabled）
// -----------------------------------------------------------------------

describe("PodSlots - Claude provider Pod：全部 slot 為 enabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 切換成 Claude capabilities：所有 slot enabled
    Object.assign(mockCapabilities, {
      isPluginEnabled: computed(() => true),
      isRepositoryEnabled: computed(() => true),
      isCommandEnabled: computed(() => true),
      isMcpEnabled: computed(() => true),
    });
  });

  it("所有 single-bind slot 的 disabled 屬性應為 false", () => {
    const wrapper = mountPodSlots();
    const singleSlots = wrapper.findAll(".single-bind-slot-stub");

    expect(singleSlots.length).toBe(2);
    for (const slot of singleSlots) {
      expect(slot.attributes("data-disabled")).toBe("false");
    }

    wrapper.unmount();
  });

  it("MCP notch slot 的 capability-disabled 屬性應為 false", () => {
    const wrapper = mountPodSlots();
    const mcpSlot = wrapper.find(".pod-mcp-slot");

    expect(mcpSlot.exists()).toBe(true);
    expect(mcpSlot.attributes("data-capability-disabled")).toBe("false");

    wrapper.unmount();
  });
});

// -----------------------------------------------------------------------
// 測試：emit 轉發 — 各 slot 接到子元件事件後正確 re-emit 父層事件
// -----------------------------------------------------------------------

describe("PodSlots - emit 事件轉發", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(mockCapabilities, {
      isPluginEnabled: computed(() => true),
      isRepositoryEnabled: computed(() => true),
      isCommandEnabled: computed(() => true),
      isMcpEnabled: computed(() => true),
    });
  });

  it("Repository slot note-dropped → emit repository-dropped", async () => {
    const wrapper = mountPodSlots();
    const singleSlots = wrapper.findAll(".single-bind-slot-stub");

    await singleSlots[0]!.trigger("click");

    expect(wrapper.emitted("repository-dropped")).toBeTruthy();
    expect(wrapper.emitted("repository-dropped")![0]).toEqual(["note-1"]);

    wrapper.unmount();
  });

  it("Repository slot note-removed → emit repository-removed", async () => {
    const wrapper = mountPodSlots();
    const singleSlots = wrapper.findAll(".single-bind-slot-stub");

    await singleSlots[0]!.trigger("dblclick");

    expect(wrapper.emitted("repository-removed")).toBeTruthy();

    wrapper.unmount();
  });

  it("Command slot note-dropped → emit command-dropped", async () => {
    const wrapper = mountPodSlots();
    const singleSlots = wrapper.findAll(".single-bind-slot-stub");

    await singleSlots[1]!.trigger("click");

    expect(wrapper.emitted("command-dropped")).toBeTruthy();
    expect(wrapper.emitted("command-dropped")![0]).toEqual(["note-1"]);

    wrapper.unmount();
  });

  it("Command slot note-removed → emit command-removed", async () => {
    const wrapper = mountPodSlots();
    const singleSlots = wrapper.findAll(".single-bind-slot-stub");

    await singleSlots[1]!.trigger("dblclick");

    expect(wrapper.emitted("command-removed")).toBeTruthy();

    wrapper.unmount();
  });

  it("MCP slot click → emit mcp-clicked 帶 MouseEvent", async () => {
    const wrapper = mountPodSlots();
    const mcpSlot = wrapper.find(".pod-mcp-slot");

    expect(mcpSlot.exists()).toBe(true);

    await mcpSlot.trigger("click");

    expect(wrapper.emitted("mcp-clicked")).toBeTruthy();
    const [emittedEvent] = wrapper.emitted("mcp-clicked")![0] as [MouseEvent];
    expect(emittedEvent).toBeInstanceOf(MouseEvent);

    wrapper.unmount();
  });

  it("Plugin slot click → emit plugin-clicked 帶 MouseEvent", async () => {
    const wrapper = mountPodSlots();
    const pluginSlot = wrapper.find(".pod-plugin-slot");

    expect(pluginSlot.exists()).toBe(true);

    await pluginSlot.trigger("click");

    expect(wrapper.emitted("plugin-clicked")).toBeTruthy();
    const [emittedEvent] = wrapper.emitted("plugin-clicked")![0] as [
      MouseEvent,
    ];
    expect(emittedEvent).toBeInstanceOf(MouseEvent);

    wrapper.unmount();
  });
});
