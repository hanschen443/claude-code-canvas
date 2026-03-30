/**
 * 偵測是否為 macOS 環境
 * macOS 觸控板捏合時 OS 會自動設定 ctrlKey=true，需特殊處理
 */
export const isMacOS: boolean =
  typeof navigator !== "undefined" &&
  navigator.userAgent.toUpperCase().includes("MAC");
