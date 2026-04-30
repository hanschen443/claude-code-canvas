/**
 * PodUploadOverlay 元件測試
 *
 * 涵蓋以下情境：
 * 1. 上傳中顯示進度條與檔案總數
 * 2. 100% 完成後元件不渲染（idle 狀態）
 * 3. 失敗狀態顯示失敗清單與重試按鈕
 * 4. 所有檔案失敗時標題切 failedAllTitle
 * 5. 重試按鈕觸發 retryFailed
 * 6. 失敗訊息依 errorCode 顯示對應 i18n
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import type { UploadFileEntry } from "@/types/upload";

// ─────────────────────────────────────────────
// mock vue-i18n：t(key) => key，讓斷言以 i18n key 為依據
// ─────────────────────────────────────────────
vi.mock("vue-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (params) {
        // 簡易插值，將 {key} 替換為對應值
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, String(v)),
          key,
        );
      }
      return key;
    },
  }),
}));

// ─────────────────────────────────────────────
// mock usePodFileDrop 的 retryFailed
// ─────────────────────────────────────────────
const mockRetryFailed = vi.fn().mockResolvedValue(undefined);

vi.mock("@/composables/pod/usePodFileDrop", () => ({
  usePodFileDrop: () => ({
    retryFailed: mockRetryFailed,
    // 其他 composable 回傳值不影響此元件
    isDragOver: { value: false },
    handleDragEnter: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDragOver: vi.fn(),
    handleDropEvent: vi.fn(),
    handleDrop: vi.fn(),
  }),
}));

// ─────────────────────────────────────────────
// mock ScrollArea（避免 shadcn 依賴）
// ─────────────────────────────────────────────
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: {
    name: "ScrollArea",
    template: '<div class="scroll-area-stub"><slot /></div>',
  },
}));

// ─────────────────────────────────────────────
// mock Button（避免 shadcn 依賴）
// ─────────────────────────────────────────────
vi.mock("@/components/ui/button", () => ({
  Button: {
    name: "Button",
    template:
      '<button class="button-stub" v-bind="$attrs" @click="$emit(\'click\')"><slot /></button>',
    emits: ["click"],
  },
}));

import PodUploadOverlay from "@/components/pod/PodUploadOverlay.vue";
import { useUploadStore } from "@/stores/upload/uploadStore";

// ─────────────────────────────────────────────
// 測試輔助函式
// ─────────────────────────────────────────────

/** 建立測試用的 UploadFileEntry */
function makeEntry(
  id: string,
  name: string,
  status: "pending" | "success" | "failed" = "pending",
  failureReason?: string,
): UploadFileEntry {
  return {
    id,
    file: new File([new Uint8Array(100)], name, { type: "text/plain" }),
    name,
    size: 100,
    loaded: 0,
    status,
    failureReason: failureReason as UploadFileEntry["failureReason"],
  };
}

/** 掛載 PodUploadOverlay 並提供 Pinia（使用真實 store） */
function mountOverlay(podId = "pod-1") {
  return mount(PodUploadOverlay, {
    props: { podId },
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: false })],
    },
  });
}

// ─────────────────────────────────────────────
// 測試主體
// ─────────────────────────────────────────────

describe("PodUploadOverlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────
  // 上傳中顯示進度條與檔案總數
  // ─────────────────────────────────────────────

  describe("上傳中視圖", () => {
    it("uploading 狀態應顯示進度條與檔案總數", () => {
      const wrapper = mountOverlay();
      const store = useUploadStore();

      // 直接設定 store 狀態（uploading）
      store.uploadStateByPodId["pod-1"] = {
        status: "uploading",
        uploadSessionId: "session-1",
        files: [makeEntry("f1", "a.txt"), makeEntry("f2", "b.txt")],
        aggregateProgress: 42,
      };

      // 強制重新渲染
      return wrapper.vm.$nextTick().then(() => {
        // 進度條容器應存在
        const progressBar = wrapper.find(".bg-primary");
        expect(progressBar.exists()).toBe(true);
        // 進度條寬度應設為 42%
        expect(progressBar.attributes("style")).toContain("width: 42%");

        // 應顯示進度相關 i18n key（uploading）
        const text = wrapper.text();
        expect(text).toContain("pod.upload.uploading");

        // 應顯示檔案數量 i18n key（fileCount）
        expect(text).toContain("pod.upload.fileCount");

        wrapper.unmount();
      });
    });
  });

  // ─────────────────────────────────────────────
  // idle 狀態不渲染
  // ─────────────────────────────────────────────

  describe("idle 狀態不渲染", () => {
    it("status=idle（未上傳）時，元件應不渲染任何內容", () => {
      const wrapper = mountOverlay();
      // 不設定 store 狀態，預設為 idle

      // 頂層 div（v-if=isVisible）不應存在
      expect(wrapper.find("div").exists()).toBe(false);

      wrapper.unmount();
    });

    it("完成上傳後 status 回到 idle，元件應不渲染", () => {
      const wrapper = mountOverlay();
      const store = useUploadStore();

      // 先設定 uploading 狀態
      store.uploadStateByPodId["pod-1"] = {
        status: "uploading",
        uploadSessionId: "session-1",
        files: [makeEntry("f1", "a.txt", "success")],
        aggregateProgress: 100,
      };

      return wrapper.vm.$nextTick().then(async () => {
        // 清除上傳狀態，模擬 finalizeUpload 成功後刪除 key
        delete store.uploadStateByPodId["pod-1"];
        await wrapper.vm.$nextTick();

        // 元件應不渲染
        expect(wrapper.find("div").exists()).toBe(false);
        wrapper.unmount();
      });
    });
  });

  // ─────────────────────────────────────────────
  // 失敗狀態
  // ─────────────────────────────────────────────

  describe("失敗狀態視圖", () => {
    it("upload-failed 狀態應顯示失敗清單與重試按鈕", () => {
      const wrapper = mountOverlay();
      const store = useUploadStore();

      store.uploadStateByPodId["pod-1"] = {
        status: "upload-failed",
        uploadSessionId: "session-1",
        files: [
          makeEntry("f1", "ok.txt", "success"),
          makeEntry("f2", "bad.txt", "failed", "network"),
        ],
        aggregateProgress: 50,
      };

      return wrapper.vm.$nextTick().then(() => {
        // 應顯示失敗清單中的 bad.txt
        expect(wrapper.text()).toContain("bad.txt");

        // 重試按鈕應存在
        const retryBtn = wrapper.find(".button-stub");
        expect(retryBtn.exists()).toBe(true);
        // 重試按鈕文字應為 i18n key
        expect(retryBtn.text()).toContain("pod.upload.retry");

        wrapper.unmount();
      });
    });

    it("所有檔案失敗時標題應切換為 failedAllTitle i18n key", () => {
      const wrapper = mountOverlay();
      const store = useUploadStore();

      // 兩個檔案都失敗
      store.uploadStateByPodId["pod-1"] = {
        status: "upload-failed",
        uploadSessionId: "session-1",
        files: [
          makeEntry("f1", "a.txt", "failed", "unknown"),
          makeEntry("f2", "b.txt", "failed", "unknown"),
        ],
        aggregateProgress: 0,
      };

      return wrapper.vm.$nextTick().then(() => {
        // 全部失敗時標題應使用 failedAllTitle key
        expect(wrapper.text()).toContain("pod.upload.failedAllTitle");
        // 不應顯示 failedTitle（部分失敗）
        expect(wrapper.text()).not.toContain("pod.upload.failedTitle");

        wrapper.unmount();
      });
    });

    it("部分失敗時標題應顯示 failedTitle i18n key（而非 failedAllTitle）", () => {
      const wrapper = mountOverlay();
      const store = useUploadStore();

      // 一個成功，一個失敗
      store.uploadStateByPodId["pod-1"] = {
        status: "upload-failed",
        uploadSessionId: "session-1",
        files: [
          makeEntry("f1", "ok.txt", "success"),
          makeEntry("f2", "bad.txt", "failed", "unknown"),
        ],
        aggregateProgress: 50,
      };

      return wrapper.vm.$nextTick().then(() => {
        // 部分失敗標題應使用 failedTitle key
        expect(wrapper.text()).toContain("pod.upload.failedTitle");
        // 不應顯示 failedAllTitle
        expect(wrapper.text()).not.toContain("pod.upload.failedAllTitle");

        wrapper.unmount();
      });
    });
  });

  // ─────────────────────────────────────────────
  // 重試按鈕
  // ─────────────────────────────────────────────

  describe("重試按鈕", () => {
    it("點擊重試按鈕應觸發 retryFailed，並帶入正確的 podId", async () => {
      const wrapper = mountOverlay("pod-retry");
      const store = useUploadStore();

      store.uploadStateByPodId["pod-retry"] = {
        status: "upload-failed",
        uploadSessionId: "session-1",
        files: [makeEntry("f1", "bad.txt", "failed", "unknown")],
        aggregateProgress: 0,
      };

      await wrapper.vm.$nextTick();

      // 點擊重試按鈕
      const retryBtn = wrapper.find(".button-stub");
      await retryBtn.trigger("click");

      // retryFailed 應被呼叫，並帶入 podId
      expect(mockRetryFailed).toHaveBeenCalledWith("pod-retry");

      wrapper.unmount();
    });
  });

  // ─────────────────────────────────────────────
  // 失敗原因 i18n 顯示
  // ─────────────────────────────────────────────

  describe("失敗原因 i18n 顯示", () => {
    it("ATTACHMENT_TOO_LARGE 錯誤應顯示對應 i18n key", () => {
      const wrapper = mountOverlay();
      const store = useUploadStore();

      store.uploadStateByPodId["pod-1"] = {
        status: "upload-failed",
        uploadSessionId: "session-1",
        files: [makeEntry("f1", "big.bin", "failed", "ATTACHMENT_TOO_LARGE")],
        aggregateProgress: 0,
      };

      return wrapper.vm.$nextTick().then(() => {
        // 應顯示對應的 i18n key
        expect(wrapper.text()).toContain(
          "pod.upload.failureReason.ATTACHMENT_TOO_LARGE",
        );
        wrapper.unmount();
      });
    });

    it("network 錯誤應顯示對應 i18n key", () => {
      const wrapper = mountOverlay();
      const store = useUploadStore();

      store.uploadStateByPodId["pod-1"] = {
        status: "upload-failed",
        uploadSessionId: "session-1",
        files: [makeEntry("f1", "file.txt", "failed", "network")],
        aggregateProgress: 0,
      };

      return wrapper.vm.$nextTick().then(() => {
        expect(wrapper.text()).toContain("pod.upload.failureReason.network");
        wrapper.unmount();
      });
    });

    it("failureReason 為 undefined 時應顯示 unknown fallback i18n key", () => {
      const wrapper = mountOverlay();
      const store = useUploadStore();

      // failureReason 為 undefined（未知原因）
      store.uploadStateByPodId["pod-1"] = {
        status: "upload-failed",
        uploadSessionId: "session-1",
        files: [makeEntry("f1", "mystery.txt", "failed", undefined)],
        aggregateProgress: 0,
      };

      return wrapper.vm.$nextTick().then(() => {
        // 無 reason 時應 fallback 顯示 unknown
        expect(wrapper.text()).toContain("pod.upload.failureReason.unknown");
        wrapper.unmount();
      });
    });
  });
});
