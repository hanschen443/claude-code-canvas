import type { ProviderCapabilities } from "@/types/pod";

/** 新建 Claude Pod 的預設模型（與 enrichPod fallback 一致） */
export const CLAUDE_DEFAULT_MODEL = "opus";

/** 新建 Codex Pod 的預設模型 */
export const CODEX_DEFAULT_MODEL = "gpt-5.4";

/** Codex Provider 的功能能力（目前僅支援基本聊天） */
export const CODEX_FALLBACK_CAPABILITIES: ProviderCapabilities = {
  chat: true,
  outputStyle: false,
  skill: false,
  subAgent: false,
  repository: false,
  command: false,
  mcp: false,
  integration: false,
  runMode: false,
};

/** Claude Provider 的功能能力（全功能支援） */
export const CLAUDE_FALLBACK_CAPABILITIES: ProviderCapabilities = {
  chat: true,
  outputStyle: true,
  skill: true,
  subAgent: true,
  repository: true,
  command: true,
  mcp: true,
  integration: true,
  runMode: true,
};
