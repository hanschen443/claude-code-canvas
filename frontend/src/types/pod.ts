import type { Component } from "vue";
import type { IntegrationBinding } from "./integration";

export type ModelType = "opus" | "sonnet" | "haiku";

export type PodStatus = "idle" | "chatting" | "summarizing" | "error";

export type PodProvider = "claude" | "codex";

export type ProviderConfig = { model: string };

/** 各 Provider 支援的功能能力表 */
export interface ProviderCapabilities {
  chat: boolean;
  outputStyle: boolean;
  skill: boolean;
  subAgent: boolean;
  repository: boolean;
  command: boolean;
  mcp: boolean;
  integration: boolean;
  runMode: boolean;
}

export type FrequencyType =
  | "every-second"
  | "every-x-minute"
  | "every-x-hour"
  | "every-day"
  | "every-week";

export interface Schedule {
  frequency: FrequencyType;
  second: number;
  intervalMinute: number;
  intervalHour: number;
  hour: number;
  minute: number;
  weekdays: number[];
  enabled: boolean;
  lastTriggeredAt: string | null;
}

export interface Pod {
  id: string;
  name: string;
  x: number;
  y: number;
  /** 僅存在於前端狀態，由 chatMessageActions 動態建構，後端不持久化此欄位 */
  output: string[];
  rotation: number;
  status?: PodStatus;
  workspacePath?: string;
  outputStyleId?: string | null;
  skillIds?: string[];
  subAgentIds?: string[];
  mcpServerIds?: string[];
  pluginIds?: string[];
  // TODO: 後端 migration 完成後移除此欄位
  /** @deprecated 將被後端 migration 移除，前端不再讀寫此欄位；僅為向後相容 TypeScript 編譯保留 */
  model?: ModelType;
  repositoryId?: string | null;
  multiInstance?: boolean;
  commandId?: string | null;
  schedule?: Schedule | null;
  integrationBindings?: IntegrationBinding[];
  provider: PodProvider;
  providerConfig: ProviderConfig;
}

export interface PodTypeConfig {
  icon: Component;
}

export interface Position {
  x: number;
  y: number;
}

export interface TypeMenuState {
  visible: boolean;
  position: Position | null;
}
