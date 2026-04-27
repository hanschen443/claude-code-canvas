/**
 * disposableChatService
 *
 * 統一的一次性無狀態查詢抽象層，依 provider 分發到對應的 AI 服務。
 * 適用於 summary、AI decide 等非 Pod 場景。
 *
 * - provider === "claude" → claudeService.executeDisposableChat
 * - provider === "codex"  → codexService.executeDisposableChat
 * - 不合法的 model 會 fallback 到 provider 預設模型，並透過 resolvedModel 回傳實際使用值
 */

import { getProvider } from "./provider/index.js";
import type { ProviderName } from "./provider/index.js";
import { claudeService } from "./claude/claudeService.js";
import { codexService } from "./codex/codexService.js";
import { logger } from "../utils/logger.js";

// ─── 公開介面 ────────────────────────────────────────────────────────────────

export interface DisposableChatInput {
  provider: ProviderName;
  model: string;
  systemPrompt: string;
  userMessage: string;
  workspacePath: string;
}

export interface DisposableChatOutput {
  content: string;
  success: boolean;
  error?: string;
  /** 實際使用的模型名稱（可能因 fallback 與輸入不同），呼叫端可用來回寫 connection */
  resolvedModel: string;
}

// ─── 模型驗證 helper ──────────────────────────────────────────────────────────

/**
 * 驗證傳入的 model 是否在該 provider 的合法清單內。
 * 不合法時 fallback 到 provider 預設模型。
 * @returns 實際使用的 model 字串
 */
function resolveModel(provider: ProviderName, requestedModel: string): string {
  const metadata = getProvider(provider).metadata;
  const isValid = metadata.availableModelValues.has(requestedModel);

  if (isValid) {
    return requestedModel;
  }

  const defaultModel =
    (metadata.defaultOptions as { model?: string }).model ?? requestedModel;
  logger.warn(
    "Chat",
    "Warn",
    `[DisposableChatService] model "${requestedModel}" 不在 ${provider} 合法清單內，fallback 到預設模型 "${defaultModel}"`,
  );
  return defaultModel;
}

// ─── 核心函數 ─────────────────────────────────────────────────────────────────

/**
 * 依 provider 分發到對應 AI 服務執行一次性查詢。
 *
 * @param input - 查詢參數（provider、model、systemPrompt、userMessage、workspacePath）
 * @returns Promise<DisposableChatOutput> 含實際使用模型（resolvedModel）
 */
export async function executeDisposableChat(
  input: DisposableChatInput,
): Promise<DisposableChatOutput> {
  const { provider, systemPrompt, userMessage, workspacePath } = input;

  // 驗證 model，不合法則 fallback 到 provider 預設模型
  const resolvedModel = resolveModel(provider, input.model);

  if (provider === "claude") {
    const result = await claudeService.executeDisposableChat({
      systemPrompt,
      userMessage,
      workspacePath,
      model: resolvedModel,
    });
    return { ...result, resolvedModel };
  }

  if (provider === "codex") {
    const result = await codexService.executeDisposableChat({
      systemPrompt,
      userMessage,
      workspacePath,
      model: resolvedModel,
    });
    return { ...result, resolvedModel };
  }

  // 未支援的 provider（理論上 TypeScript 型別系統已防止，但防禦性處理）
  logger.error(
    "Chat",
    "Error",
    `[DisposableChatService] 不支援的 provider：${String(provider)}`,
  );
  return {
    content: "",
    success: false,
    error: `不支援的 provider：${String(provider)}`,
    resolvedModel: input.model,
  };
}
