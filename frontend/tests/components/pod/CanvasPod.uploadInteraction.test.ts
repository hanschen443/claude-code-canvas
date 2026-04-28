/**
 * CanvasPod 上傳中互動封鎖測試
 *
 * 涵蓋以下情境（Task D）：
 * - 上傳中 PodActions 收到 isUploading=true（刪除按鈕 disabled）
 * - 上傳中右鍵選單不開啟（handleContextMenu early return）
 * - 上傳中連線把手（PodAnchors）從 DOM 移除（v-if="!isPodUploading"）
 * - 上傳中聊天區被 PodUploadOverlay 覆蓋（overlay 渲染）
 * - 上傳中 Pod 標題列仍可拖移（mousedown 正常觸發）
 * - 上傳中再次 drop 被 usePodFileDrop.isUploading 擋下（composable 層）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { useUploadStore } from "@/stores/upload/uploadStore";
import {
  createUsePodScheduleMock,
  createUseWorkflowClearMock,
  createUsePodCapabilitiesMock,
  createUsePodAnchorDragMock,
  createUsePodNoteBindingMock,
  createMockPod,
  mountCanvasPod,
} from "./__setup__/canvasPodMocks";
import type { UploadFileEntry } from "@/types/upload";

// ─────────────────────────────────────────────
// 動態 mock 狀態
// ─────────────────────────────────────────────

const mockSelectedPodIds = ref<string[]>([]);
const mockIsDragging = ref(false);
const mockIsBatchDragging = ref(false);

const mockToast = vi.fn();
const mockOpenHistoryPanel = vi.fn();
const mockIsMultiInstanceSourcePod = vi.fn().mockReturnValue(false);
const mockIsMultiInstanceChainPod = vi.fn().mockReturnValue(false);
const mockSendMessageWithUploadSession = vi.fn().mockResolvedValue(undefined);
const mockSendMessage = vi.fn().mockResolvedValue(undefined);
const mockUpdatePodProviderConfigModel = vi.fn();
const mockSendCanvasAction = vi.fn();

// ─────────────────────────────────────────────
// uploadStore / uploadApi mock（供 usePodFileDrop 使用）
// ─────────────────────────────────────────────

const mockIsUploading = vi.fn().mockReturnValue(false);
const mockStartUpload = vi.fn().mockReturnValue("session-upload");
const mockUpdateFileProgress = vi.fn();
const mockMarkFileSuccess = vi.fn();
const mockMarkFileFailed = vi.fn();
const mockFinalizeUpload = vi
  .fn()
  .mockReturnValue({ ok: true, uploadSessionId: "session-upload" });
const mockGetUploadState = vi.fn();
const mockMarkRetrying = vi.fn();

const mockUploadFile = vi
  .fn()
  .mockResolvedValue({ filename: "file.txt", size: 100, mime: "text/plain" });

// ─────────────────────────────────────────────
// 子元件 Mock：PodActions 需可觀察 isUploading prop
// ─────────────────────────────────────────────

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
      "boundSkillNotes",
      "boundRepositoryNote",
      "boundCommandNote",
      "boundMcpServerNotes",
      "pluginActiveCount",
      "mcpActiveCount",
      "provider",
    ],
  },
}));

// PodAnchors：帶 v-show 控制，須保留 podId prop
vi.mock("@/components/pod/PodAnchors.vue", () => ({
  default: {
    name: "PodAnchors",
    template: "<div class='pod-anchors-stub'></div>",
    props: ["podId"],
  },
}));

// PodActions：渲染可觀察的 data-is-uploading 屬性
vi.mock("@/components/pod/PodActions.vue", () => ({
  default: {
    name: "PodActions",
    template:
      "<div class='pod-actions-stub' :data-is-uploading=\"isUploading ? 'true' : 'false'\"></div>",
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
      "isUploading",
    ],
  },
}));

vi.mock("@/components/pod/PodModelSelector.vue", () => ({
  default: {
    name: "PodModelSelector",
    template: "<div class='model-selector-stub'></div>",
    props: ["podId", "provider", "currentModel"],
    emits: ["update:model"],
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

vi.mock("@/components/pod/PluginPopover.vue", () => ({
  default: {
    name: "PluginPopover",
    template: "<div></div>",
    props: ["podId", "anchorRect", "busy", "provider"],
  },
}));

vi.mock("@/components/pod/McpPopover.vue", () => ({
  default: {
    name: "McpPopover",
    template: "<div></div>",
    props: ["podId", "anchorRect", "busy", "provider"],
  },
}));

// PodUploadOverlay：渲染可觀察的 stub
vi.mock("@/components/pod/PodUploadOverlay.vue", () => ({
  default: {
    name: "PodUploadOverlay",
    template: "<div class='pod-upload-overlay-stub'></div>",
    props: ["podId"],
  },
}));

// ─────────────────────────────────────────────
// Store / Composable Mock
// ─────────────────────────────────────────────

vi.mock("@/stores/upload/uploadStore", () => ({
  useUploadStore: () => ({
    isUploading: mockIsUploading,
    startUpload: mockStartUpload,
    updateFileProgress: mockUpdateFileProgress,
    markFileSuccess: mockMarkFileSuccess,
    markFileFailed: mockMarkFileFailed,
    finalizeUpload: mockFinalizeUpload,
    getUploadState: mockGetUploadState,
    markRetrying: mockMarkRetrying,
  }),
}));

vi.mock("@/api/uploadApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/api/uploadApi")>();
  return {
    ...actual,
    uploadFile: (...args: Parameters<typeof mockUploadFile>) =>
      mockUploadFile(...args),
  };
});

vi.mock("@/composables/canvas/useCanvasContext", () => ({
  useCanvasContext: () => ({
    podStore: {
      activePodId: null,
      setActivePod: vi.fn(),
      updatePodProviderConfigModel: mockUpdatePodProviderConfigModel,
      setMultiInstanceWithBackend: vi.fn(),
      updatePodStatus: vi.fn(),
    },
    viewportStore: { zoom: 1 },
    selectionStore: {
      get selectedPodIds() {
        return mockSelectedPodIds.value;
      },
      isElementSelected: (type: string, id: string) =>
        type === "pod" && mockSelectedPodIds.value.includes(id),
      toggleElement: vi.fn(),
    },
    skillStore: { getNotesByPodId: vi.fn().mockReturnValue([]) },
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
    chatStore: {
      sendMessage: mockSendMessage,
      sendMessageWithUploadSession: mockSendMessageWithUploadSession,
    },
    canvasStore: {},
    integrationStore: {},
  }),
}));

vi.mock("@/stores/chat/chatStore", () => ({
  useChatStore: () => ({
    sendMessage: mockSendMessage,
    sendMessageWithUploadSession: mockSendMessageWithUploadSession,
  }),
}));

vi.mock("@/stores/run/runStore", () => ({
  useRunStore: () => ({
    openHistoryPanel: mockOpenHistoryPanel,
  }),
}));

vi.mock("@/composables/canvas", () => ({
  useBatchDrag: () => ({
    startBatchDrag: vi.fn().mockReturnValue(false),
    isElementSelected: vi.fn().mockReturnValue(false),
    get isBatchDragging() {
      return mockIsBatchDragging;
    },
  }),
}));

vi.mock("@/composables/useSendCanvasAction", () => ({
  useSendCanvasAction: () => ({
    sendCanvasAction: mockSendCanvasAction,
  }),
}));

vi.mock("@/composables/pod/usePodDrag", () => ({
  usePodDrag: () => ({
    get isDragging() {
      return mockIsDragging;
    },
    startSingleDrag: vi.fn(),
  }),
}));

vi.mock("@/composables/pod/usePodNoteBinding", () => ({
  usePodNoteBinding: () => createUsePodNoteBindingMock(),
}));

vi.mock("@/composables/pod/useWorkflowClear", () => ({
  useWorkflowClear: () => createUseWorkflowClearMock(),
}));

vi.mock("@/composables/pod/usePodSchedule", () => ({
  usePodSchedule: () => createUsePodScheduleMock(),
}));

vi.mock("@/composables/pod/usePodAnchorDrag", () => ({
  usePodAnchorDrag: () => createUsePodAnchorDragMock(),
}));

vi.mock("@/composables/pod/usePodCapabilities", () => ({
  usePodCapabilities: () => createUsePodCapabilitiesMock(),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock("@/utils/multiInstanceGuard", () => ({
  isMultiInstanceChainPod: (...args: unknown[]) =>
    mockIsMultiInstanceChainPod(...args),
  isMultiInstanceSourcePod: (...args: unknown[]) =>
    mockIsMultiInstanceSourcePod(...args),
}));

vi.mock("@/services/websocket", () => ({
  WebSocketRequestEvents: { POD_SET_MODEL: "pod:set_model" },
  WebSocketResponseEvents: { POD_MODEL_SET: "pod:model_set" },
}));

vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: ref("zh-TW"),
  }),
}));

// ─────────────────────────────────────────────
// 工具函式
// ─────────────────────────────────────────────

function makeEntry(
  id: string,
  name: string,
  status: "pending" | "success" | "failed" = "pending",
): UploadFileEntry {
  return {
    id,
    file: new File([new Uint8Array(100)], name, { type: "text/plain" }),
    name,
    size: 100,
    loaded: 0,
    status,
  };
}

async function flushAsync(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

// ─────────────────────────────────────────────
// 測試主體
// ─────────────────────────────────────────────

describe("CanvasPod 上傳中互動封鎖", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedPodIds.value = [];
    mockIsDragging.value = false;
    mockIsBatchDragging.value = false;
    mockIsMultiInstanceSourcePod.mockReturnValue(false);
    mockIsMultiInstanceChainPod.mockReturnValue(false);
    // 預設：未上傳中
    mockIsUploading.mockReturnValue(false);
    mockStartUpload.mockReturnValue("session-upload");
    mockFinalizeUpload.mockReturnValue({
      ok: true,
      uploadSessionId: "session-upload",
    });
    mockUploadFile.mockResolvedValue({
      filename: "file.txt",
      size: 100,
      mime: "text/plain",
    });
    mockSendMessageWithUploadSession.mockResolvedValue(undefined);
    mockGetUploadState.mockReturnValue({
      status: "idle",
      uploadSessionId: "",
      files: [],
      aggregateProgress: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────
  // 刪除按鈕 disabled
  // ─────────────────────────────────────────────

  it("上傳中 PodActions 應收到 isUploading=true，刪除按鈕應 disabled", async () => {
    // 模擬 uploadStore.isUploading 回傳 true
    mockIsUploading.mockReturnValue(true);
    mockGetUploadState.mockReturnValue({
      status: "uploading",
      uploadSessionId: "session-upload",
      files: [makeEntry("f1", "test.txt")],
      aggregateProgress: 30,
    });

    const pod = createMockPod({ id: "pod-upload", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    // PodActions stub 渲染 data-is-uploading 屬性
    const podActions = wrapper.find(".pod-actions-stub");
    expect(podActions.exists()).toBe(true);
    expect(podActions.attributes("data-is-uploading")).toBe("true");

    wrapper.unmount();
  });

  it("未上傳時 PodActions 應收到 isUploading=false", async () => {
    mockIsUploading.mockReturnValue(false);

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const podActions = wrapper.find(".pod-actions-stub");
    expect(podActions.exists()).toBe(true);
    expect(podActions.attributes("data-is-uploading")).toBe("false");

    wrapper.unmount();
  });

  // ─────────────────────────────────────────────
  // 右鍵選單封鎖
  // ─────────────────────────────────────────────

  it("上傳中右鍵選單不應觸發 contextmenu emit", async () => {
    mockIsUploading.mockReturnValue(true);
    mockGetUploadState.mockReturnValue({
      status: "uploading",
      uploadSessionId: "session-upload",
      files: [makeEntry("f1", "test.txt")],
      aggregateProgress: 30,
    });

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    // 觸發右鍵選單事件
    const podDoodle = wrapper.find(".pod-doodle");
    await podDoodle.trigger("contextmenu");
    await flushAsync();

    // 上傳中應封鎖右鍵選單，不觸發 contextmenu emit
    expect(wrapper.emitted("contextmenu")).toBeFalsy();

    wrapper.unmount();
  });

  it("未上傳時右鍵選單應正常觸發 contextmenu emit", async () => {
    mockIsUploading.mockReturnValue(false);

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const podDoodle = wrapper.find(".pod-doodle");
    await podDoodle.trigger("contextmenu");
    await flushAsync();

    // 未上傳時右鍵選單應正常觸發
    expect(wrapper.emitted("contextmenu")).toBeTruthy();

    wrapper.unmount();
  });

  // ─────────────────────────────────────────────
  // 連線把手隱藏
  // ─────────────────────────────────────────────

  it("上傳中 PodAnchors 應從 DOM 移除（v-if=false）", async () => {
    mockIsUploading.mockReturnValue(true);
    mockGetUploadState.mockReturnValue({
      status: "uploading",
      uploadSessionId: "session-upload",
      files: [makeEntry("f1", "test.txt")],
      aggregateProgress: 50,
    });

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    // v-if=false 時 PodAnchors stub 不存在於 DOM
    const podAnchors = wrapper.find(".pod-anchors-stub");
    expect(podAnchors.exists()).toBe(false);

    wrapper.unmount();
  });

  it("未上傳時 PodAnchors 應可見", async () => {
    mockIsUploading.mockReturnValue(false);

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const podAnchors = wrapper.find(".pod-anchors-stub");
    expect(podAnchors.exists()).toBe(true);
    expect(podAnchors.isVisible()).toBe(true);

    wrapper.unmount();
  });

  // ─────────────────────────────────────────────
  // 聊天區被 PodUploadOverlay 覆蓋
  // ─────────────────────────────────────────────

  it("上傳中應渲染 PodUploadOverlay（v-if=true）封鎖聊天區", async () => {
    mockIsUploading.mockReturnValue(true);
    mockGetUploadState.mockReturnValue({
      status: "uploading",
      uploadSessionId: "session-upload",
      files: [makeEntry("f1", "test.txt")],
      aggregateProgress: 50,
    });

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    // PodUploadOverlay stub 應出現在 DOM 中
    const overlay = wrapper.find(".pod-upload-overlay-stub");
    expect(overlay.exists()).toBe(true);

    wrapper.unmount();
  });

  it("未上傳且狀態為 idle 時，PodUploadOverlay 不應渲染", async () => {
    mockIsUploading.mockReturnValue(false);
    mockGetUploadState.mockReturnValue({
      status: "idle",
      uploadSessionId: "",
      files: [],
      aggregateProgress: 0,
    });

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    // idle 時 overlay 不應出現
    const overlay = wrapper.find(".pod-upload-overlay-stub");
    expect(overlay.exists()).toBe(false);

    wrapper.unmount();
  });

  // ─────────────────────────────────────────────
  // Pod 標題列仍可拖移
  // ─────────────────────────────────────────────

  it("上傳中 mousedown 事件仍可正常觸發（Pod 拖移不被封鎖）", async () => {
    mockIsUploading.mockReturnValue(true);
    mockGetUploadState.mockReturnValue({
      status: "uploading",
      uploadSessionId: "session-upload",
      files: [makeEntry("f1", "test.txt")],
      aggregateProgress: 30,
    });

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    // mousedown 應不拋例外（Pod 拖移邏輯不被上傳狀態封鎖）
    await expect(wrapper.trigger("mousedown")).resolves.not.toThrow();

    wrapper.unmount();
  });

  // ─────────────────────────────────────────────
  // 上傳中再次 drop 被擋下（composable 層）
  // ─────────────────────────────────────────────

  it("上傳中再次 drop 不應觸發 startUpload（isUploading=true 時 handleDrop early return）", async () => {
    // 設定 isUploading=true，模擬已在上傳中
    mockIsUploading.mockReturnValue(true);
    mockGetUploadState.mockReturnValue({
      status: "uploading",
      uploadSessionId: "session-upload",
      files: [makeEntry("f1", "ongoing.txt")],
      aggregateProgress: 60,
    });

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    // 模擬再次 drop 一個檔案
    const files = [
      new File([new Uint8Array(100)], "new.txt", { type: "text/plain" }),
    ];
    const dropEvent = (() => {
      const items = files.map(() => ({
        webkitGetAsEntry: vi.fn().mockReturnValue({ isDirectory: false }),
      }));
      const fileList = {
        length: files.length,
        item: (i: number) => files[i] ?? null,
        [Symbol.iterator]: function* () {
          for (const f of files) yield f;
        },
      };
      (fileList as Record<string | number, unknown>)[0] = files[0];
      const event = new Event("drop", {
        bubbles: true,
        cancelable: true,
      }) as DragEvent;
      Object.defineProperty(event, "dataTransfer", {
        value: {
          files: fileList,
          items: {
            length: items.length,
            [Symbol.iterator]: function* () {
              for (const item of items) yield item;
            },
          },
          dropEffect: "copy",
        },
        writable: true,
        configurable: true,
      });
      return event;
    })();

    wrapper.element.dispatchEvent(dropEvent);
    await flushAsync();

    // isUploading=true 時，handleDrop early return，不應呼叫 startUpload
    expect(mockStartUpload).not.toHaveBeenCalled();

    wrapper.unmount();
  });
});
