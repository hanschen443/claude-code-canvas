/**
 * CanvasPod 拖曳上傳整合測試
 *
 * 涵蓋計畫書測試案例 8–10、13–15、18：
 * 8:  串行 Pod idle 拖入有效檔案 → 呼叫 uploadApi.uploadFile 並送 WS 訊息
 * 9:  multi-instance source pod 允許 drop，成功後呼叫 runStore.openHistoryPanel()
 * 10: 拖入時套用高亮 class，dragleave 後移除
 * 13: 串行 Pod chatting / summarizing 時 isFileDropDisabled = true
 * 14: 下游 multi-instance pod 時 isFileDropDisabled = true
 * 15: unknown provider 時 isFileDropDisabled = true
 * 18: sendMessageWithUploadSession 拋例外 → toast podDropSendFailed
 *
 * 注意：案例 16/17（後端 pod:error 附件錯誤路徑）因測試環境無法重現完整
 *   WebSocket → chatStore 路徑，已移除（原先為空殼測試，無法驗證元件行為）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ref, nextTick } from "vue";
import { useProviderCapabilityStore } from "@/stores/providerCapabilityStore";
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

// ---- 動態 mock 狀態 ----

const mockSelectedPodIds = ref<string[]>([]);
const mockIsDragging = ref(false);
const mockIsBatchDragging = ref(false);

// toast mock
const mockToast = vi.fn();

// run store mock
const mockOpenHistoryPanel = vi.fn();

// multi-instance mock
const mockIsMultiInstanceSourcePod = vi.fn().mockReturnValue(false);
const mockIsMultiInstanceChainPod = vi.fn().mockReturnValue(false);

// uploadStore mock（usePodFileDrop 在 composable 內部直接呼叫）
const mockIsUploading = vi.fn().mockReturnValue(false);
const mockStartUpload = vi.fn().mockReturnValue("session-test");
const mockUpdateFileProgress = vi.fn();
const mockMarkFileSuccess = vi.fn();
const mockMarkFileFailed = vi.fn();
const mockFinalizeUpload = vi
  .fn()
  .mockReturnValue({ ok: true, uploadSessionId: "session-test" });
const mockGetUploadState = vi.fn();
const mockMarkRetrying = vi.fn();

// chatStore mock：sendMessageWithUploadSession 供 usePodFileDrop 呼叫
const mockSendMessageWithUploadSession = vi.fn().mockResolvedValue(undefined);
// sendMessage 不再用於 drop 流程，保留供其他測試路徑
const mockSendMessage = vi.fn().mockResolvedValue(undefined);

// uploadApi mock
const mockUploadFile = vi
  .fn()
  .mockResolvedValue({ filename: "file.txt", size: 100, mime: "text/plain" });

const mockUpdatePodProviderConfigModel = vi.fn();
const mockSendCanvasAction = vi.fn();

// ---- 建立單一 pending UploadFileEntry，供 getUploadState 回傳 ----

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

// ---- 子元件 Mock ----

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

// ---- Store / Composable Mock ----

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

// ---- 工具函式 ----

function makeFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (i: number) => files[i] ?? null,
    [Symbol.iterator]: function* () {
      for (const f of files) yield f;
    },
  };
  for (let i = 0; i < files.length; i++) {
    (fileList as Record<string | number, unknown>)[i] = files[i];
  }
  return fileList as unknown as FileList;
}

function makeDataTransfer(files: File[]): DataTransfer {
  const items = files.map(() => ({
    webkitGetAsEntry: vi.fn().mockReturnValue({ isDirectory: false }),
  }));
  return {
    files: makeFileList(files),
    items: {
      length: items.length,
      [Symbol.iterator]: function* () {
        for (const item of items) yield item;
      },
    },
    dropEffect: "copy",
  } as unknown as DataTransfer;
}

function createDropEvent(files: File[]): DragEvent {
  const event = new Event("drop", {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: makeDataTransfer(files),
    writable: true,
    configurable: true,
  });
  return event;
}

function createDragEnterEvent(): DragEvent {
  return new Event("dragenter", {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
}

function createDragLeaveEvent(options: {
  currentTarget: HTMLElement;
  relatedTarget: Node | null;
}): DragEvent {
  const event = new Event("dragleave", {
    bubbles: true,
    cancelable: true,
  }) as DragEvent;
  Object.defineProperty(event, "currentTarget", {
    value: options.currentTarget,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(event, "relatedTarget", {
    value: options.relatedTarget,
    writable: true,
    configurable: true,
  });
  return event;
}

async function flushAsync(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await nextTick();
}

function setKnownProvider(
  store: ReturnType<typeof useProviderCapabilityStore>,
): void {
  store.loaded = true;
  store.capabilitiesByProvider = {
    claude: { chat: true },
  } as unknown as typeof store.capabilitiesByProvider;
}

// ---- 測試 ----

describe("CanvasPod 拖曳上傳整合", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedPodIds.value = [];
    mockIsDragging.value = false;
    mockIsBatchDragging.value = false;
    mockIsMultiInstanceSourcePod.mockReturnValue(false);
    mockIsMultiInstanceChainPod.mockReturnValue(false);
    mockIsUploading.mockReturnValue(false);
    mockStartUpload.mockReturnValue("session-test");
    mockFinalizeUpload.mockReturnValue({
      ok: true,
      uploadSessionId: "session-test",
    });
    mockUploadFile.mockResolvedValue({
      filename: "file.txt",
      size: 100,
      mime: "text/plain",
    });
    mockSendMessageWithUploadSession.mockResolvedValue(undefined);
    mockSendMessage.mockResolvedValue(undefined);

    // 預設 getUploadState 回傳含一個 pending entry 的狀態
    mockGetUploadState.mockReturnValue({
      status: "uploading",
      uploadSessionId: "session-test",
      files: [makeEntry("f1", "test.txt")],
      aggregateProgress: 0,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // 案例 8：串行 Pod idle 拖入有效檔案 → uploadFile 被呼叫並送 WS 訊息
  // -----------------------------------------------------------------------
  it("案例 8：idle 串行 Pod 拖入有效檔案，應呼叫 uploadFile 並送 WS 訊息", async () => {
    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const store = useProviderCapabilityStore();
    setKnownProvider(store);
    await nextTick();

    const files = [
      new File([new Uint8Array(100)], "test.txt", { type: "text/plain" }),
    ];
    const dropEvent = createDropEvent(files);

    wrapper.element.dispatchEvent(dropEvent);
    await flushAsync();

    // 應呼叫 startUpload 啟動 session
    expect(mockStartUpload).toHaveBeenCalledWith("pod-1", files);
    // 應呼叫 uploadFile 上傳檔案
    expect(mockUploadFile).toHaveBeenCalledTimes(1);
    // 上傳成功後應送 WS 訊息
    expect(mockSendMessageWithUploadSession).toHaveBeenCalledWith(
      "pod-1",
      "session-test",
    );

    wrapper.unmount();
  });

  // -----------------------------------------------------------------------
  // 案例 9：multi-instance source pod 允許 drop，成功後呼叫 openHistoryPanel
  // -----------------------------------------------------------------------
  it("案例 9：multi-instance source pod 拖入成功，應呼叫 openHistoryPanel", async () => {
    mockIsMultiInstanceSourcePod.mockReturnValue(true);
    mockIsMultiInstanceChainPod.mockReturnValue(false);

    const pod = createMockPod({
      id: "pod-source",
      status: "idle",
      multiInstance: true,
    });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const store = useProviderCapabilityStore();
    setKnownProvider(store);
    await nextTick();

    const files = [
      new File([new Uint8Array(100)], "data.bin", {
        type: "application/octet-stream",
      }),
    ];
    const dropEvent = createDropEvent(files);

    wrapper.element.dispatchEvent(dropEvent);
    await flushAsync();

    // 上傳並送 WS 訊息
    expect(mockSendMessageWithUploadSession).toHaveBeenCalled();
    // 成功送出後應開啟 history panel
    expect(mockOpenHistoryPanel).toHaveBeenCalledOnce();

    wrapper.unmount();
  });

  // -----------------------------------------------------------------------
  // 案例 10：拖入時套用高亮 class，dragleave 後移除
  // -----------------------------------------------------------------------
  it("案例 10：dragenter 時 pod-glow-layer 套用高亮，dragleave 後移除", async () => {
    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const store = useProviderCapabilityStore();
    setKnownProvider(store);
    await nextTick();

    const dragEnterEvent = createDragEnterEvent();
    wrapper.element.dispatchEvent(dragEnterEvent);
    await nextTick();

    const glowLayer = wrapper.find(".pod-inner-highlight");
    expect(glowLayer.classes()).toContain("pod-glow-drop-target");

    const rootEl = wrapper.element as HTMLElement;
    const outsideEl = document.createElement("span");
    const leaveEvent = createDragLeaveEvent({
      currentTarget: rootEl,
      relatedTarget: outsideEl,
    });
    rootEl.dispatchEvent(leaveEvent);
    await nextTick();

    expect(glowLayer.classes()).not.toContain("pod-glow-drop-target");

    wrapper.unmount();
  });

  // -----------------------------------------------------------------------
  // 案例 13：串行 Pod chatting / summarizing 時 isFileDropDisabled = true
  // -----------------------------------------------------------------------
  it("案例 13a：pod status=chatting 時 drop 應被 disabled 忽略", async () => {
    const pod = createMockPod({ id: "pod-1", status: "chatting" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const store = useProviderCapabilityStore();
    setKnownProvider(store);
    await nextTick();

    const files = [
      new File([new Uint8Array(100)], "test.txt", { type: "text/plain" }),
    ];
    const dropEvent = createDropEvent(files);
    wrapper.element.dispatchEvent(dropEvent);
    await flushAsync();

    expect(mockStartUpload).not.toHaveBeenCalled();
    expect(mockSendMessageWithUploadSession).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it("案例 13b：pod status=summarizing 時 drop 應被 disabled 忽略", async () => {
    const pod = createMockPod({ id: "pod-1", status: "summarizing" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const store = useProviderCapabilityStore();
    setKnownProvider(store);
    await nextTick();

    const files = [
      new File([new Uint8Array(100)], "test.txt", { type: "text/plain" }),
    ];
    const dropEvent = createDropEvent(files);
    wrapper.element.dispatchEvent(dropEvent);
    await flushAsync();

    expect(mockStartUpload).not.toHaveBeenCalled();
    expect(mockSendMessageWithUploadSession).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  // -----------------------------------------------------------------------
  // 案例 14：下游 multi-instance pod 時 isFileDropDisabled = true
  // -----------------------------------------------------------------------
  it("案例 14：下游 multi-instance pod drop 應被 disabled 忽略", async () => {
    mockIsMultiInstanceChainPod.mockReturnValue(true);
    mockIsMultiInstanceSourcePod.mockReturnValue(false);

    const pod = createMockPod({ id: "pod-downstream", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const store = useProviderCapabilityStore();
    setKnownProvider(store);
    await nextTick();

    const files = [
      new File([new Uint8Array(100)], "test.txt", { type: "text/plain" }),
    ];
    const dropEvent = createDropEvent(files);
    wrapper.element.dispatchEvent(dropEvent);
    await flushAsync();

    expect(mockStartUpload).not.toHaveBeenCalled();
    expect(mockSendMessageWithUploadSession).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  // -----------------------------------------------------------------------
  // 案例 15：unknown provider 時 isFileDropDisabled = true
  // -----------------------------------------------------------------------
  it("案例 15：未知 provider Pod drop 應被 disabled 忽略", async () => {
    const pod = createMockPod({
      id: "pod-unknown",
      provider: "deprecated-provider" as unknown as "claude",
      status: "idle",
    });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const store = useProviderCapabilityStore();
    store.loaded = true;
    store.capabilitiesByProvider = {
      claude: { chat: true },
    } as unknown as typeof store.capabilitiesByProvider;
    await nextTick();

    const files = [
      new File([new Uint8Array(100)], "test.txt", { type: "text/plain" }),
    ];
    const dropEvent = createDropEvent(files);
    wrapper.element.dispatchEvent(dropEvent);
    await flushAsync();

    expect(mockStartUpload).not.toHaveBeenCalled();
    expect(mockSendMessageWithUploadSession).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  // -----------------------------------------------------------------------
  // 案例 33：providerCapabilityStore.loaded=false 時 drop 不被擋
  // -----------------------------------------------------------------------
  it("案例 33：providerCapabilityStore.loaded=false 時，drop 應正常啟動上傳", async () => {
    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const store = useProviderCapabilityStore();
    store.loaded = false;
    store.capabilitiesByProvider = {} as typeof store.capabilitiesByProvider;
    await nextTick();

    const files = [
      new File([new Uint8Array(100)], "test.txt", { type: "text/plain" }),
    ];
    const dropEvent = createDropEvent(files);
    wrapper.element.dispatchEvent(dropEvent);
    await flushAsync();

    // loaded=false 時不視為 unknown provider，drop 應通過
    expect(mockStartUpload).toHaveBeenCalled();

    wrapper.unmount();
  });

  // -----------------------------------------------------------------------
  // 案例 18：sendMessageWithUploadSession 拋例外 → toast podDropSendFailed
  // -----------------------------------------------------------------------
  it("案例 18：sendMessageWithUploadSession 拋出例外，usePodFileDrop catch 顯示 podDropSendFailed toast", async () => {
    mockSendMessageWithUploadSession.mockRejectedValueOnce(
      new Error("WebSocket 尚未連線"),
    );

    const pod = createMockPod({ id: "pod-1", status: "idle" });
    const wrapper = mountCanvasPod(pod);
    await nextTick();

    const store = useProviderCapabilityStore();
    setKnownProvider(store);
    await nextTick();

    const files = [
      new File([new Uint8Array(100)], "file.txt", { type: "text/plain" }),
    ];
    const dropEvent = createDropEvent(files);
    wrapper.element.dispatchEvent(dropEvent);
    await flushAsync();

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );

    wrapper.unmount();
  });
});
