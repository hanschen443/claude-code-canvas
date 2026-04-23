import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import { ref, computed } from "vue";
import CanvasPod from "@/components/pod/CanvasPod.vue";
import type { Pod } from "@/types";

// Mock 子元件，避免各子元件自行引入複雜依賴
vi.mock("@/components/pod/PodHeader.vue", () => ({
  default: {
    name: "PodHeader",
    template: "<div class='pod-header-stub'></div>",
    props: ["name", "isEditing"],
  },
}));

vi.mock("@/components/pod/PodMiniScreen.vue", () => ({
  default: {
    name: "PodMiniScreen",
    template: "<div class='pod-mini-screen-stub'></div>",
    props: ["output"],
  },
}));

vi.mock("@/components/pod/PodSlots.vue", () => ({
  default: {
    name: "PodSlots",
    template: "<div></div>",
    props: [
      "podId",
      "podRotation",
      "boundOutputStyleNote",
      "boundSkillNotes",
      "boundSubAgentNotes",
      "boundRepositoryNote",
      "boundCommandNote",
      "boundMcpServerNotes",
    ],
  },
}));

vi.mock("@/components/pod/PodAnchors.vue", () => ({
  default: {
    name: "PodAnchors",
    template: "<div></div>",
    props: ["podId"],
  },
}));

vi.mock("@/components/pod/PodActions.vue", () => ({
  default: {
    name: "PodActions",
    template: "<div></div>",
    props: [
      "podId",
      "podName",
      "isSourcePod",
      "showScheduleButton",
      "isMultiInstanceEnabled",
      "isLoadingDownstream",
      "isClearing",
      "downstreamPods",
      "showClearDialog",
      "showDeleteDialog",
      "hasSchedule",
      "scheduleEnabled",
      "scheduleTooltip",
      "isScheduleFiredAnimating",
      "isWorkflowRunning",
      "isRunModeEnabled",
    ],
  },
}));

vi.mock("@/components/pod/PodModelSelector.vue", () => ({
  default: {
    name: "PodModelSelector",
    template: "<div></div>",
    props: ["podId", "provider", "currentModel"],
  },
}));

vi.mock("@/components/integration/IntegrationStatusIcon.vue", () => ({
  default: {
    name: "IntegrationStatusIcon",
    template: "<div></div>",
    props: ["bindings"],
  },
}));

vi.mock("@/components/canvas/ScheduleModal.vue", () => ({
  default: {
    name: "ScheduleModal",
    template: "<div></div>",
    props: ["open", "podId", "existingSchedule"],
  },
}));

// Mock composables
vi.mock("@/composables/canvas/useCanvasContext", () => ({
  useCanvasContext: () => ({
    podStore: {
      activePodId: null,
      setActivePod: vi.fn(),
      updatePodProviderConfigModel: vi.fn(),
      setMultiInstanceWithBackend: vi.fn(),
    },
    viewportStore: {},
    selectionStore: {
      selectedPodIds: [],
      toggleElement: vi.fn(),
    },
    outputStyleStore: { getNotesByPodId: vi.fn().mockReturnValue([]) },
    skillStore: { getNotesByPodId: vi.fn().mockReturnValue([]) },
    subAgentStore: { getNotesByPodId: vi.fn().mockReturnValue([]) },
    repositoryStore: { getNotesByPodId: vi.fn().mockReturnValue([]) },
    commandStore: { getNotesByPodId: vi.fn().mockReturnValue([]) },
    mcpServerStore: { getNotesByPodId: vi.fn().mockReturnValue([]) },
    connectionStore: {
      isSourcePod: vi.fn().mockReturnValue(false),
      hasUpstreamConnections: vi.fn().mockReturnValue(false),
      isWorkflowRunning: vi.fn().mockReturnValue(false),
      selectConnection: vi.fn(),
    },
    clipboardStore: {},
    chatStore: {},
    canvasStore: {},
    integrationStore: {},
  }),
}));

vi.mock("@/composables/canvas", () => ({
  useBatchDrag: () => ({
    startBatchDrag: vi.fn().mockReturnValue(false),
    isElementSelected: vi.fn().mockReturnValue(false),
    isBatchDragging: ref(false),
  }),
}));

vi.mock("@/composables/useSendCanvasAction", () => ({
  useSendCanvasAction: () => ({
    sendCanvasAction: vi.fn(),
  }),
}));

vi.mock("@/composables/pod/usePodDrag", () => ({
  usePodDrag: () => ({
    isDragging: ref(false),
    startSingleDrag: vi.fn(),
  }),
}));

vi.mock("@/composables/pod/usePodNoteBinding", () => ({
  usePodNoteBinding: () => ({
    handleNoteDrop: vi.fn(),
    handleNoteRemove: vi.fn(),
  }),
}));

vi.mock("@/composables/pod/useWorkflowClear", () => ({
  useWorkflowClear: () => ({
    showClearDialog: ref(false),
    downstreamPods: ref([]),
    isLoadingDownstream: ref(false),
    isClearing: ref(false),
    handleClearWorkflow: vi.fn(),
    handleConfirmClear: vi.fn(),
    handleCancelClear: vi.fn(),
  }),
}));

vi.mock("@/composables/pod/usePodSchedule", () => ({
  usePodSchedule: () => ({
    showScheduleModal: ref(false),
    hasSchedule: computed(() => false),
    scheduleEnabled: computed(() => false),
    scheduleTooltip: computed(() => ""),
    isScheduleFiredAnimating: ref(false),
    handleOpenScheduleModal: vi.fn(),
    handleScheduleConfirm: vi.fn(),
    handleScheduleDelete: vi.fn(),
    handleScheduleToggle: vi.fn(),
    handleClearScheduleFiredAnimation: vi.fn(),
  }),
}));

vi.mock("@/composables/pod/usePodAnchorDrag", () => ({
  usePodAnchorDrag: () => ({
    handleAnchorDragStart: vi.fn(),
    handleAnchorDragMove: vi.fn(),
    handleAnchorDragEnd: vi.fn(),
  }),
}));

vi.mock("@/composables/pod/usePodCapabilities", () => ({
  usePodCapabilities: () => ({
    isRunModeEnabled: computed(() => false),
  }),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/utils/multiInstanceGuard", () => ({
  isMultiInstanceChainPod: vi.fn().mockReturnValue(false),
  isMultiInstanceSourcePod: vi.fn().mockReturnValue(false),
}));

vi.mock("@/services/websocket", () => ({
  WebSocketRequestEvents: { POD_SET_MODEL: "pod:set_model" },
  WebSocketResponseEvents: { POD_MODEL_SET: "pod:model_set" },
}));

function createMockPod(overrides: Partial<Pod> = {}): Pod {
  return {
    id: "pod-1",
    name: "Test Pod",
    x: 0,
    y: 0,
    output: [],
    rotation: 0,
    provider: "claude",
    providerConfig: { model: "claude-sonnet-4-5" },
    ...overrides,
  };
}

function mountCanvasPod(pod: Pod) {
  return mount(CanvasPod, {
    props: { pod },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })],
    },
    attachTo: document.body,
  });
}

describe("CanvasPod Provider Pod 漸層 class 綁定", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('當 pod.provider === "claude" 時，.pod-doodle 元素套用 pod-provider-claude class，不含 pod-provider-codex', () => {
    const pod = createMockPod({ provider: "claude" });
    const wrapper = mountCanvasPod(pod);

    const podDoodle = wrapper.find(".pod-doodle");
    expect(podDoodle.exists()).toBe(true);
    expect(podDoodle.classes()).toContain("pod-provider-claude");
    expect(podDoodle.classes()).not.toContain("pod-provider-codex");

    wrapper.unmount();
  });

  it('當 pod.provider === "codex" 時，.pod-doodle 元素套用 pod-provider-codex class，不含 pod-provider-claude', () => {
    const pod = createMockPod({ provider: "codex" });
    const wrapper = mountCanvasPod(pod);

    const podDoodle = wrapper.find(".pod-doodle");
    expect(podDoodle.exists()).toBe(true);
    expect(podDoodle.classes()).toContain("pod-provider-codex");
    expect(podDoodle.classes()).not.toContain("pod-provider-claude");

    wrapper.unmount();
  });

  it("Mini screen stub 區塊不含 pod-provider-* class", () => {
    const pod = createMockPod({ provider: "claude" });
    const wrapper = mountCanvasPod(pod);

    const miniScreen = wrapper.find(".pod-mini-screen-stub");
    expect(miniScreen.exists()).toBe(true);
    expect(miniScreen.classes()).not.toContain("pod-provider-claude");
    expect(miniScreen.classes()).not.toContain("pod-provider-codex");

    wrapper.unmount();
  });
});
