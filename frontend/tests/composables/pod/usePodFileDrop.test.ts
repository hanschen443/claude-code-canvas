/**
 * usePodFileDrop 單元測試
 *
 * 涵蓋計畫書測試案例 1–7：
 * 1. 拖入 0 個檔案 → toast `errors.attachmentEmpty`
 * 2. 拖入內含資料夾條目 → toast `errors.attachmentEmpty`
 * 3. 單檔 > 10 MB → toast `errors.attachmentTooLarge`
 * 4. 合法多檔（圖片+文字+二進制）成功讀 base64
 * 5. disabled 為 true 時 drop 不觸發 onDrop
 * 6. dragenter / dragleave / drop 後 isDragOver 狀態正確
 * 7. FileReader 讀檔失敗 → toast `composable.chat.podDropReadFailed` 不呼叫 onDrop
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { usePodFileDrop } from "@/composables/pod/usePodFileDrop";
import { MAX_POD_DROP_FILE_BYTES } from "@/lib/constants";

// Mock useToast，讓 toast 可被 spy
const { mockToast } = vi.hoisted(() => ({
  mockToast: vi.fn(),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

// ---- 建立 DragEvent 的工具 helper ----

/**
 * 建立測試用的 DataTransferItem，模擬 webkitGetAsEntry 行為。
 */
function createDataTransferItem(isDirectory: boolean): DataTransferItem {
  return {
    webkitGetAsEntry: vi.fn().mockReturnValue({ isDirectory }),
  } as unknown as DataTransferItem;
}

/**
 * 建立 File 物件
 */
function createFile(
  name: string,
  sizeBytes: number,
  type = "text/plain",
): File {
  // 用 Blob 建立，指定 size 讓 file.size 正確
  const content = new Uint8Array(sizeBytes);
  return new File([content], name, { type });
}

/**
 * 建立帶有 items（DataTransferItemList）與 files（FileList）的 DragEvent。
 */
function createDropEvent(options: {
  files?: File[];
  hasDirectory?: boolean;
  items?: DataTransferItem[];
  currentTarget?: EventTarget | null;
  relatedTarget?: EventTarget | null;
}): DragEvent {
  const { files = [], hasDirectory = false } = options;

  // 建立 DataTransfer items
  const items: DataTransferItem[] = options.items
    ? options.items
    : [
        ...(hasDirectory ? [createDataTransferItem(true)] : []),
        ...files.map(() => createDataTransferItem(false)),
      ];

  // 建立 FileList（只讀，用物件模擬）
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

  const event = new Event("drop", { bubbles: true }) as DragEvent;

  // 注入 dataTransfer
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: fileList,
      items: {
        length: items.length,
        [Symbol.iterator]: function* () {
          for (const item of items) yield item;
        },
      } as unknown as DataTransferItemList,
      dropEffect: "copy",
    },
    writable: true,
  });

  // 注入 currentTarget / relatedTarget（用於 dragleave 測試）
  if (options.currentTarget !== undefined) {
    Object.defineProperty(event, "currentTarget", {
      value: options.currentTarget,
      writable: true,
    });
  }
  if (options.relatedTarget !== undefined) {
    Object.defineProperty(event, "relatedTarget", {
      value: options.relatedTarget,
      writable: true,
    });
  }

  return event;
}

/**
 * 建立 dragenter/dragleave 用的 DragEvent（不需要 dataTransfer.files）
 */
function createDragEvent(
  type: "dragenter" | "dragleave" | "dragover",
  options: {
    currentTarget?: EventTarget | null;
    relatedTarget?: EventTarget | null;
  } = {},
): DragEvent {
  const event = new Event(type, { bubbles: true }) as DragEvent;

  if (options.currentTarget !== undefined) {
    Object.defineProperty(event, "currentTarget", {
      value: options.currentTarget,
      writable: true,
    });
  }
  if (options.relatedTarget !== undefined) {
    Object.defineProperty(event, "relatedTarget", {
      value: options.relatedTarget,
      writable: true,
    });
  }

  return event;
}

// ---- Mock FileReader ----

/**
 * 替換全域 FileReader，讓 readAsDataURL 能以可控方式回應。
 *
 * @param mode "success" 以 base64 dataURL 回應；"error" 觸發 onerror
 */
function mockFileReader(mode: "success" | "error"): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).FileReader = class MockFileReader {
    onload: ((e: ProgressEvent) => void) | null = null;
    onerror: (() => void) | null = null;

    readAsDataURL(file: File): void {
      if (mode === "success") {
        // 模擬非同步 onload，回傳 dataURL 格式字串
        queueMicrotask(() => {
          const fakeBase64 = `data:${file.type};base64,ZmFrZWJhc2U2NA==`;
          this.onload?.({
            target: { result: fakeBase64 },
          } as unknown as ProgressEvent);
        });
      } else {
        queueMicrotask(() => {
          this.onerror?.();
        });
      }
    }
  };
}

describe("usePodFileDrop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 案例 1：拖入 0 個檔案 → toast errors.attachmentEmpty
  // -------------------------------------------------------------------------
  it("案例 1：拖入 0 個檔案時，應顯示 errors.attachmentEmpty toast", async () => {
    const onDrop = vi.fn();
    const { handleDrop } = usePodFileDrop({ disabled: () => false, onDrop });

    const event = createDropEvent({ files: [] });
    await handleDrop(event);

    // toast 應以 destructive variant 顯示，title 含 attachmentEmpty 翻譯文字
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 案例 2：拖入含資料夾條目 → toast errors.attachmentEmpty
  // -------------------------------------------------------------------------
  it("案例 2：拖入含資料夾條目時，應顯示 errors.attachmentEmpty toast 並不呼叫 onDrop", async () => {
    const onDrop = vi.fn();
    const { handleDrop } = usePodFileDrop({ disabled: () => false, onDrop });

    // hasDirectory = true 會在 items 中放入 isDirectory=true 的 entry
    const event = createDropEvent({ hasDirectory: true });
    await handleDrop(event);

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 案例 3：單檔 > 10 MB → toast errors.attachmentTooLarge
  // -------------------------------------------------------------------------
  it("案例 3：單檔超過 10 MB 時，應顯示 errors.attachmentTooLarge toast", async () => {
    const onDrop = vi.fn();
    const { handleDrop } = usePodFileDrop({ disabled: () => false, onDrop });

    // 單一檔案超過 MAX_POD_DROP_FILE_BYTES
    const bigFile = createFile("big.bin", MAX_POD_DROP_FILE_BYTES + 1);
    const event = createDropEvent({ files: [bigFile] });
    await handleDrop(event);

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  it("案例 3b：單檔剛好等於 10 MB 時，應通過大小檢查", async () => {
    mockFileReader("success");

    const onDrop = vi.fn();
    const { handleDrop } = usePodFileDrop({ disabled: () => false, onDrop });

    // 剛好等於上限，不超標
    const exactFile = createFile("exact.bin", MAX_POD_DROP_FILE_BYTES);
    const event = createDropEvent({ files: [exactFile] });
    await handleDrop(event);

    expect(onDrop).toHaveBeenCalledOnce();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("案例 3c：多檔總和超過 10 MB 但每檔均小於 10 MB 時，應全數通過", async () => {
    mockFileReader("success");

    const onDrop = vi.fn();
    const { handleDrop } = usePodFileDrop({ disabled: () => false, onDrop });

    // 每個 6 MB，兩個加總 12 MB，但單檔均未超標
    const file1 = createFile("a.bin", 6 * 1024 * 1024);
    const file2 = createFile("b.bin", 6 * 1024 * 1024);
    const event = createDropEvent({ files: [file1, file2] });
    await handleDrop(event);

    expect(onDrop).toHaveBeenCalledOnce();
    expect(mockToast).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 案例 4：合法多檔（圖片+文字+二進制）成功讀 base64 並呼叫 onDrop
  // -------------------------------------------------------------------------
  it("案例 4：合法多檔成功讀取後，應呼叫 onDrop 並帶入 attachments", async () => {
    // 替換 FileReader 為成功模式
    mockFileReader("success");

    const onDrop = vi.fn();
    const { handleDrop } = usePodFileDrop({ disabled: () => false, onDrop });

    const files = [
      createFile("image.png", 1024, "image/png"),
      createFile("doc.txt", 512, "text/plain"),
      createFile("data.bin", 256, "application/octet-stream"),
    ];
    const event = createDropEvent({ files });
    await handleDrop(event);

    expect(onDrop).toHaveBeenCalledOnce();

    // attachments 應含三個條目，每個都有 filename 與 contentBase64
    const [attachments] = onDrop.mock.calls[0] as [
      Array<{ filename: string; contentBase64: string }>,
    ];
    expect(attachments).toHaveLength(3);
    expect(attachments[0]).toMatchObject({ filename: "image.png" });
    expect(attachments[1]).toMatchObject({ filename: "doc.txt" });
    expect(attachments[2]).toMatchObject({ filename: "data.bin" });
    // contentBase64 應為純 base64（不含 data: 前綴）
    for (const att of attachments) {
      expect(att.contentBase64).not.toContain("data:");
    }
    expect(mockToast).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 案例 5：disabled 為 true 時 drop 不觸發 onDrop
  // -------------------------------------------------------------------------
  it("案例 5：disabled=true 時 drop 應直接 return，不觸發 onDrop", async () => {
    mockFileReader("success");

    const onDrop = vi.fn();
    const { handleDrop } = usePodFileDrop({ disabled: () => true, onDrop });

    const files = [createFile("file.txt", 100)];
    const event = createDropEvent({ files });
    await handleDrop(event);

    expect(onDrop).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 案例 6：dragenter / dragleave / drop 後 isDragOver 狀態正確
  // -------------------------------------------------------------------------
  describe("案例 6：isDragOver 狀態", () => {
    it("初始 isDragOver 應為 false", () => {
      const { isDragOver } = usePodFileDrop({
        disabled: () => false,
        onDrop: vi.fn(),
      });
      expect(isDragOver.value).toBe(false);
    });

    it("handleDragEnter 後 isDragOver 應變為 true", () => {
      const { isDragOver, handleDragEnter } = usePodFileDrop({
        disabled: () => false,
        onDrop: vi.fn(),
      });

      const event = createDragEvent("dragenter");
      handleDragEnter(event);

      expect(isDragOver.value).toBe(true);
    });

    it("handleDragLeave 離開容器後 isDragOver 應恢復 false", () => {
      const { isDragOver, handleDragEnter, handleDragLeave } = usePodFileDrop({
        disabled: () => false,
        onDrop: vi.fn(),
      });

      // 先進入
      handleDragEnter(createDragEvent("dragenter"));
      expect(isDragOver.value).toBe(true);

      // 離開（relatedTarget 在容器外，currentTarget.contains 回傳 false）
      const containerEl = document.createElement("div");
      const leaveEvent = createDragEvent("dragleave", {
        currentTarget: containerEl,
        relatedTarget: document.createElement("span"), // 不在容器內
      });
      // 確保 contains 回傳 false（預設外部元素不含在空 div 中）
      handleDragLeave(leaveEvent);

      expect(isDragOver.value).toBe(false);
    });

    it("handleDragLeave relatedTarget 在容器內時，isDragOver 不應重置（子元素抖動防護）", () => {
      const { isDragOver, handleDragEnter, handleDragLeave } = usePodFileDrop({
        disabled: () => false,
        onDrop: vi.fn(),
      });

      // 先進入
      handleDragEnter(createDragEvent("dragenter"));
      expect(isDragOver.value).toBe(true);

      // relatedTarget 在 currentTarget 內，應忽略離開事件
      const containerEl = document.createElement("div");
      const childEl = document.createElement("span");
      containerEl.appendChild(childEl);

      const leaveEvent = createDragEvent("dragleave", {
        currentTarget: containerEl,
        relatedTarget: childEl, // 在容器內，contains() 回傳 true
      });
      handleDragLeave(leaveEvent);

      // isDragOver 應維持 true（子元素移動，不算真正離開）
      expect(isDragOver.value).toBe(true);
    });

    it("handleDrop 後 isDragOver 應重置為 false", async () => {
      mockFileReader("success");

      const { isDragOver, handleDragEnter, handleDrop } = usePodFileDrop({
        disabled: () => false,
        onDrop: vi.fn(),
      });

      handleDragEnter(createDragEvent("dragenter"));
      expect(isDragOver.value).toBe(true);

      const files = [createFile("test.txt", 100)];
      await handleDrop(createDropEvent({ files }));

      expect(isDragOver.value).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 案例 7：FileReader 讀檔失敗 → toast podDropReadFailed 不呼叫 onDrop
  // -------------------------------------------------------------------------
  it("案例 7：FileReader 讀取失敗時，應顯示 podDropReadFailed toast 且不呼叫 onDrop", async () => {
    // 替換 FileReader 為失敗模式
    mockFileReader("error");

    const onDrop = vi.fn();
    const { handleDrop } = usePodFileDrop({ disabled: () => false, onDrop });

    const files = [createFile("bad.txt", 100)];
    const event = createDropEvent({ files });
    await handleDrop(event);

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
    expect(onDrop).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 補充：disabled=true 時 dragenter 不應更新 isDragOver
  // -------------------------------------------------------------------------
  it("disabled=true 時 dragenter 不應設定 isDragOver", () => {
    const { isDragOver, handleDragEnter } = usePodFileDrop({
      disabled: () => true,
      onDrop: vi.fn(),
    });

    handleDragEnter(createDragEvent("dragenter"));
    expect(isDragOver.value).toBe(false);
  });

  // -------------------------------------------------------------------------
  // 補充：onDrop 拋出例外時 → toast podDropSendFailed
  // -------------------------------------------------------------------------
  it("onDrop 拋出例外時，應顯示 podDropSendFailed toast", async () => {
    mockFileReader("success");

    const onDrop = vi.fn().mockRejectedValueOnce(new Error("網路錯誤"));
    const { handleDrop } = usePodFileDrop({ disabled: () => false, onDrop });

    const files = [createFile("file.txt", 100)];
    await handleDrop(createDropEvent({ files }));

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive" }),
    );
  });
});
