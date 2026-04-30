/**
 * uploadConstants — HTTP 與 WebSocket 上傳共用常數（single source of truth）。
 *
 * 此檔案是所有上傳限制的單一事實來源，HTTP 路由與 WS handler 皆應從此處 import，
 * 避免兩處各自維護導致不一致。
 */

/** 單檔上限：10 MB（base64 解碼後 bytes） */
export const MAX_SINGLE_BYTES = 10 * 1024 * 1024;

/**
 * uploadSessionId（UUID v4）驗證正則。
 * 格式：xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
 */
export const UPLOAD_SESSION_ID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
