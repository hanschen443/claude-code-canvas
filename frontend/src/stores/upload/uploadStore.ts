import { defineStore } from "pinia";
import { generateUUID } from "@/services/utils";
import type {
  PodUploadState,
  UploadFileEntry,
  UploadFailureReason,
} from "@/types/upload";

// ─────────────────────────────────────────────
// 常數與輔助函式
// ─────────────────────────────────────────────

/** idle 狀態的預設值，找不到 Pod 時回傳此物件 */
const IDLE_STATE: PodUploadState = {
  status: "idle",
  uploadSessionId: "",
  files: [],
  aggregateProgress: 0,
};

/**
 * 重新計算整批檔案的聚合進度（0～100 整數）。
 * sum(size) === 0 時視為 100，避免除以零。
 * @param files 計算範圍內的檔案（可傳入全部或僅失敗重試中的子集）
 */
function calcAggregateProgress(files: UploadFileEntry[]): number {
  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  if (totalSize === 0) return 100;
  const totalLoaded = files.reduce((acc, f) => acc + f.loaded, 0);
  return Math.floor((totalLoaded / totalSize) * 100);
}

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────

interface UploadStoreState {
  /** 以 podId 為 key，儲存各 Pod 獨立的上傳狀態 */
  uploadStateByPodId: Record<string, PodUploadState>;
}

export const useUploadStore = defineStore("upload", {
  state: (): UploadStoreState => ({
    uploadStateByPodId: {},
  }),

  getters: {
    /**
     * 取得指定 Pod 的上傳狀態。
     * 尚未有任何上傳動作時回傳 idle 預設值。
     */
    getUploadState: (state) => {
      return (podId: string): PodUploadState => {
        return state.uploadStateByPodId[podId] ?? { ...IDLE_STATE };
      };
    },

    /** 判斷指定 Pod 是否正在上傳中 */
    isUploading: (state) => {
      return (podId: string): boolean => {
        return state.uploadStateByPodId[podId]?.status === "uploading";
      };
    },
  },

  actions: {
    /**
     * 開始上傳：為指定 Pod 建立新的上傳 session，
     * 為每個 File 產生 UploadFileEntry（status=pending、loaded=0）。
     * 回傳 uploadSessionId，供 composable 後續操作使用。
     */
    startUpload(podId: string, files: File[]): string {
      const uploadSessionId = generateUUID();

      const fileEntries: UploadFileEntry[] = files.map((file) => ({
        id: generateUUID(),
        file,
        name: file.name,
        size: file.size,
        loaded: 0,
        status: "pending",
      }));

      this.uploadStateByPodId[podId] = {
        status: "uploading",
        uploadSessionId,
        files: fileEntries,
        aggregateProgress: 0,
      };

      return uploadSessionId;
    },

    /**
     * 更新單一檔案的上傳進度，並重新計算 aggregateProgress。
     * 找不到對應 Pod 或 fileId 時靜默忽略。
     *
     * 計算 aggregateProgress 的範圍：
     * - 正常上傳時：所有檔案（全部都是 pending/uploading）
     * - 重試流程中：只計非 success 的檔案，讓重試進度從 0% 起跳，不受先前成功檔案影響
     */
    updateFileProgress(podId: string, fileId: string, loaded: number): void {
      const podState = this.uploadStateByPodId[podId];
      if (!podState) return;

      const file = podState.files.find((f) => f.id === fileId);
      if (!file) return;

      file.loaded = loaded;

      // 若有已成功的檔案（代表正在重試流程），只計非 success 的檔案計算聚合進度
      const hasSuccessFiles = podState.files.some(
        (f) => f.status === "success",
      );
      const targetFiles = hasSuccessFiles
        ? podState.files.filter((f) => f.status !== "success")
        : podState.files;

      podState.aggregateProgress = calcAggregateProgress(targetFiles);
    },

    /**
     * 將指定檔案標記為上傳成功。
     * 找不到對應 Pod 或 fileId 時靜默忽略。
     */
    markFileSuccess(podId: string, fileId: string): void {
      const podState = this.uploadStateByPodId[podId];
      if (!podState) return;

      const file = podState.files.find((f) => f.id === fileId);
      if (!file) return;

      file.status = "success";
    },

    /**
     * 將指定檔案標記為上傳失敗，並記錄失敗原因。
     * 找不到對應 Pod 或 fileId 時靜默忽略。
     */
    markFileFailed(
      podId: string,
      fileId: string,
      reason: UploadFailureReason,
    ): void {
      const podState = this.uploadStateByPodId[podId];
      if (!podState) return;

      const file = podState.files.find((f) => f.id === fileId);
      if (!file) return;

      file.status = "failed";
      file.failureReason = reason;
    },

    /**
     * 結束本次上傳 session：
     * - 全部成功 → 清空 Pod 上傳狀態（回 idle），回傳 `{ ok: true, uploadSessionId }`
     * - 有任何失敗 → 將 Pod 狀態設為 upload-failed，回傳 `{ ok: false, failedFiles, uploadSessionId }`
     */
    finalizeUpload(podId: string):
      | { ok: true; uploadSessionId: string }
      | {
          ok: false;
          failedFiles: UploadFileEntry[];
          uploadSessionId: string;
        } {
      const podState = this.uploadStateByPodId[podId];
      // 找不到狀態時視為已完成（避免邊界情況報錯）
      if (!podState) {
        return { ok: true, uploadSessionId: "" };
      }

      const { uploadSessionId, files } = podState;
      const failedFiles = files.filter((f) => f.status === "failed");

      if (failedFiles.length === 0) {
        // 全部成功：清除 Pod 上傳狀態，回到 idle
        delete this.uploadStateByPodId[podId];
        return { ok: true, uploadSessionId };
      }

      // 有失敗：更新 Pod 狀態為 upload-failed
      podState.status = "upload-failed";
      return { ok: false, failedFiles, uploadSessionId };
    },

    /**
     * 將指定的失敗檔案重設為重試中狀態（status=pending、loaded=0），
     * 並將 Pod 狀態切回 uploading。
     *
     * aggregateProgress 計算時只計這些重試中的檔案（success 的檔案被排除在外），
     * 讓重試進度從 0% 起跳，不受先前成功檔案的 loaded 影響。
     * 作法：把重試檔案的 loaded 清為 0，updateFileProgress 時改以
     * 「非 success」的檔案子集計算聚合進度。
     */
    markRetrying(podId: string, fileIds: string[]): void {
      const podState = this.uploadStateByPodId[podId];
      if (!podState) return;

      const idSet = new Set(fileIds);

      for (const file of podState.files) {
        if (idSet.has(file.id)) {
          // 重設失敗檔案：清除進度與錯誤原因，回到 pending
          file.status = "pending";
          file.loaded = 0;
          file.failureReason = undefined;
        }
      }

      // 重試時只以非 success 的檔案計算聚合進度（成功的檔案不計入，讓進度從 0% 起跳）
      const retryingFiles = podState.files.filter(
        (f) => f.status !== "success",
      );
      podState.aggregateProgress = calcAggregateProgress(retryingFiles);
      podState.status = "uploading";
    },

    /**
     * 重置指定 Pod 的上傳狀態（完整清除）。
     * 用於使用者手動取消或元件卸載時清理。
     */
    resetUpload(podId: string): void {
      delete this.uploadStateByPodId[podId];
    },
  },
});
