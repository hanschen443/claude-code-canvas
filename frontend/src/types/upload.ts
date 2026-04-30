import type { UploadFailureReason } from "@/api/uploadApi";

// 重新導出，讓其他模組可從 types/upload 取得此型別
export type { UploadFailureReason };

/** 單一檔案的上傳狀態 */
export type UploadFileStatus = "pending" | "uploading" | "success" | "failed";

/** 單一檔案上傳項目（前端狀態） */
export interface UploadFileEntry {
  /** 前端產生的 UUID，作為 list key */
  id: string;
  /** 原始 File 物件 */
  file: File;
  /** 檔案名稱 */
  name: string;
  /** 檔案大小（bytes） */
  size: number;
  /** 已上傳 bytes */
  loaded: number;
  /** 上傳狀態 */
  status: UploadFileStatus;
  /** 失敗原因（僅 status === 'failed' 時存在） */
  failureReason?: UploadFailureReason;
}

/** Pod 層級的上傳狀態 */
export type PodUploadStatus = "idle" | "uploading" | "upload-failed";

/** Pod 整體上傳狀態（供 chatStore / Pod 元件使用） */
export interface PodUploadState {
  /** Pod 層級的上傳狀態 */
  status: PodUploadStatus;
  /** 上傳 Session ID（由後端核發，對應一批檔案） */
  uploadSessionId: string;
  /** 本次批次所有檔案的上傳項目 */
  files: UploadFileEntry[];
  /** 整體進度（0～100，整數），由各檔案 loaded/size 加權計算 */
  aggregateProgress: number;
}
