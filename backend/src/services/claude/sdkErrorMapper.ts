/** 檢查函式的回傳型別，使用 discriminated union 讓 TypeScript 能正確 narrow */
export type SdkErrorCheckResult =
  | { shouldAbort: true; userMessage: string }
  | { shouldAbort: false };

/** SDK 錯誤類型對應使用者可讀訊息（zh-TW） */
export const SDK_ERROR_MESSAGES: Record<string, string> = {
  rate_limit: "已達到 API 速率限制，請稍後再試",
  authentication_failed: "API 認證失敗，請確認 API Key 是否正確",
  billing_error: "帳戶用量已達上限，請確認帳戶狀態",
  server_error: "Claude 服務暫時不可用，請稍後再試",
};

/** 根據 SDK 錯誤類型從映射表取使用者可讀訊息，找不到時回傳預設訊息 */
export function getSdkErrorMessage(errorType: string): string {
  return (
    SDK_ERROR_MESSAGES[errorType] ?? "與 Claude 通訊時發生錯誤，請稍後再試"
  );
}

/** 判斷 rate_limit_event 是否應中斷執行 */
export function checkRateLimitEvent(rateLimitInfo: {
  status: string;
}): SdkErrorCheckResult {
  if (rateLimitInfo.status !== "rejected") {
    return { shouldAbort: false };
  }

  return {
    shouldAbort: true,
    userMessage: SDK_ERROR_MESSAGES.billing_error,
  };
}

/** 判斷 auth_status 是否應中斷執行 */
export function checkAuthStatus(error?: string): SdkErrorCheckResult {
  if (!error) {
    return { shouldAbort: false };
  }

  return {
    shouldAbort: true,
    userMessage: SDK_ERROR_MESSAGES.authentication_failed,
  };
}

/** 格式化 api_retry 的使用者訊息 */
export function formatApiRetryMessage(
  attempt: number,
  maxRetries: number,
  errorStatus: number | null,
): string {
  const statusPart = errorStatus != null ? `（${errorStatus}）` : "";
  return `⚠️ API 請求失敗${statusPart}，正在重試（第 ${attempt}/${maxRetries} 次）...`;
}

/** 判斷 assistant.error 是否應中斷執行 */
export function checkAssistantError(error?: string): SdkErrorCheckResult {
  if (!error) {
    return { shouldAbort: false };
  }

  return {
    shouldAbort: true,
    userMessage: getSdkErrorMessage(error),
  };
}
