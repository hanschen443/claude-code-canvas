import type {
  AgentProvider,
  ProviderCapabilities,
  ProviderName,
} from "./types.js";
import { CLAUDE_CAPABILITIES, CODEX_CAPABILITIES } from "./capabilities.js";

/** 所有支援的 Provider 名稱列表，供遍歷使用 */
export const PROVIDER_NAMES: readonly ProviderName[] = [
  "claude",
  "codex",
] as const;

/** Singleton 快取：ProviderName -> AgentProvider 實例 */
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
 * 第一次呼叫時才進行 import 與建立實例，之後從快取直接返回
 *
 * @throws Error 若 Provider 模組不存在且 stub 也不可用
 */
export async function getProvider(name: ProviderName): Promise<AgentProvider> {
  // 已有快取直接返回
  const cached = providerCache.get(name);
  if (cached) return cached;

  let provider: AgentProvider;

  switch (name) {
    case "claude": {
      try {
        const mod = await import("./claudeProvider.js");
        if ("claudeProvider" in mod) {
          // named export singleton（目前實作）
          provider = (mod as { claudeProvider: AgentProvider }).claudeProvider;
        } else if ("ClaudeProvider" in mod) {
          // 支援 class 形式的 named export
          provider = new (
            mod as { ClaudeProvider: new () => AgentProvider }
          ).ClaudeProvider();
        } else {
          // default export（class 或 singleton）
          const def = (mod as { default: unknown }).default;
          provider =
            typeof def === "function"
              ? new (def as new () => AgentProvider)()
              : (def as AgentProvider);
        }
      } catch {
        // claudeProvider.ts 尚未實作，使用暫時 stub 避免 build 中斷
        console.warn(
          "[ProviderRegistry] claudeProvider.ts 尚未存在，使用 stub",
        );
        provider = new (createStubProviderClass("claude"))();
      }
      break;
    }

    case "codex": {
      // TODO: 等 codexProvider.ts 由另一 agent 完成後，移除 stub fallback
      // 使用動態路徑變數繞過 TypeScript 靜態模組解析，讓 try/catch 在執行期生效
      const codexModulePath = "./codexProvider.js";
      try {
        const mod = (await import(codexModulePath)) as Record<string, unknown>;
        if ("codexProvider" in mod) {
          // named export singleton
          provider = mod.codexProvider as AgentProvider;
        } else if ("CodexProvider" in mod) {
          // class 形式的 named export
          provider = new (mod.CodexProvider as new () => AgentProvider)();
        } else {
          // default export（class 或 singleton）
          const def = mod.default;
          provider =
            typeof def === "function"
              ? new (def as new () => AgentProvider)()
              : (def as AgentProvider);
        }
      } catch {
        // codexProvider.ts 尚未實作，使用暫時 stub 避免 build 中斷
        console.warn("[ProviderRegistry] codexProvider.ts 尚未存在，使用 stub");
        provider = new (createStubProviderClass("codex"))();
      }
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

// ─── Stub 工廠 ───────────────────────────────────────────────────────────────

/**
 * 建立暫時 stub Provider class
 * 在真實 Provider 模組還沒被寫好時，讓 Registry 不會 crash build
 * 呼叫 stub 的 chat() 時會拋出明確錯誤
 */
function createStubProviderClass(
  providerName: ProviderName,
): new () => AgentProvider {
  const capabilities = getCapabilities(providerName);

  return class StubProvider implements AgentProvider {
    readonly name: ProviderName = providerName;
    readonly capabilities: ProviderCapabilities = capabilities;

    // eslint-disable-next-line require-yield
    async *chat(): AsyncIterable<never> {
      throw new Error(
        `[ProviderRegistry] ${providerName} Provider 尚未實作，stub 不支援 chat()`,
      );
    }

    cancel(_podSessionKey: string): boolean {
      console.warn(`[ProviderRegistry] ${providerName} stub cancel() 無效`);
      return false;
    }
  };
}

// ─── Re-exports ───────────────────────────────────────────────────────────────
export type {
  AgentProvider,
  ProviderCapabilities,
  ProviderName,
} from "./types.js";
export { CLAUDE_CAPABILITIES, CODEX_CAPABILITIES } from "./capabilities.js";
