import type { ProviderCapabilities } from "./types.js";

/** Codex provider 的預設模型（podStore.ts 與 codexProvider.ts 共用，請一起更新） */
export const CODEX_DEFAULT_MODEL = "gpt-5.4" as const;

/** Claude Provider 支援所有功能 */
export const CLAUDE_CAPABILITIES: Readonly<ProviderCapabilities> =
  Object.freeze({
    chat: true,
    outputStyle: true,
    skill: true,
    subAgent: true,
    repository: true,
    command: true,
    mcp: true,
    integration: true,
    runMode: true,
  });

/** Codex Provider 僅支援基本聊天，其餘功能皆不支援 */
export const CODEX_CAPABILITIES: Readonly<ProviderCapabilities> = Object.freeze(
  {
    chat: true,
    outputStyle: false,
    skill: false,
    subAgent: false,
    repository: false,
    command: false,
    mcp: false,
    integration: false,
    runMode: false,
  },
);
