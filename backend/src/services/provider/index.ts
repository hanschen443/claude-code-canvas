import type {
  AgentProvider,
  ProviderCapabilities,
  ProviderName,
} from "./types.js";
import { CLAUDE_CAPABILITIES, CODEX_CAPABILITIES } from "./capabilities.js";
import { claudeProvider } from "./claudeProvider.js";
import { codexProvider } from "./codexProvider.js";

/** 所有支援的 Provider 名稱列表，供遍歷使用 */
export const PROVIDER_NAMES: readonly ProviderName[] = [
  "claude",
  "codex",
] as const;

/**
 * Provider singleton 快取：ProviderName -> AgentProvider 實例
 *
 * Provider 採用 singleton 設計，生命週期與程序相同，不需動態釋放，
 * 因此 cache 永不過期。若未來支援動態 provider（例如熱重載或多版本並存），
 * 需在此加入對應的清理機制。
 */
const providerCache = new Map<ProviderName, AgentProvider>();

/**
 * 取得指定 Provider 的能力矩陣（純函式，無副作用）
 * 直接從 capabilities.ts 常數讀取，不需要 instantiate provider
 */
export function getCapabilities(name: ProviderName): ProviderCapabilities {
  switch (name) {
    case "claude":
      return CLAUDE_CAPABILITIES;
    case "codex":
      return CODEX_CAPABILITIES;
  }
}

/**
 * 取得指定 Provider 的 singleton 實例（lazy instantiation）
 * 第一次呼叫時才進行建立，之後從快取直接返回
 *
 * @throws Error 若 Provider 模組匯出格式不符預期
 */
export async function getProvider(name: ProviderName): Promise<AgentProvider> {
  // 已有快取直接返回
  const cached = providerCache.get(name);
  if (cached) return cached;

  let provider: AgentProvider;

  switch (name) {
    case "claude": {
      provider = claudeProvider;
      break;
    }

    case "codex": {
      provider = codexProvider;
      break;
    }

    default: {
      // TypeScript exhaust check：確保所有 ProviderName 都有處理
      const _exhaustive: never = name;
      throw new Error(`[ProviderRegistry] 未知的 Provider：${_exhaustive}`);
    }
  }

  providerCache.set(name, provider);
  return provider;
}

/**
 * 清除 Provider singleton 快取（主要供測試使用）
 */
export function clearProviderCache(): void {
  providerCache.clear();
}

// ─── Re-exports ───────────────────────────────────────────────────────────────
export type {
  AgentProvider,
  ProviderCapabilities,
  ProviderName,
} from "./types.js";
export { CLAUDE_CAPABILITIES, CODEX_CAPABILITIES } from "./capabilities.js";
