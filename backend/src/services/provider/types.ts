import type { ContentBlock } from "../../types/message.js";
import type { RunContext } from "../../types/run.js";

/** 支援的 Provider 名稱 */
export type ProviderName = "claude" | "codex";

/** Provider 支援的功能能力矩陣 */
export interface ProviderCapabilities {
  /** 是否支援基本聊天 */
  chat: boolean;
  /** 是否支援輸出風格 */
  outputStyle: boolean;
  /** 是否支援 Skill */
  skill: boolean;
  /** 是否支援 Sub-Agent */
  subAgent: boolean;
  /** 是否支援 Repository */
  repository: boolean;
  /** 是否支援 Command */
  command: boolean;
  /** 是否支援 MCP */
  mcp: boolean;
  /** 是否支援 Integration */
  integration: boolean;
  /** 是否支援 Run 模式 */
  runMode: boolean;
}

/** Provider 串流事件的標準化格式（Discriminated Union） */
export type NormalizedEvent =
  | {
      type: "session_started";
      sessionId: string;
    }
  | {
      type: "text";
      content: string;
    }
  | {
      type: "thinking";
      content: string;
    }
  | {
      type: "tool_call_start";
      toolUseId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: "tool_call_result";
      toolUseId: string;
      toolName: string;
      output: string;
    }
  | {
      type: "turn_complete";
    }
  | {
      type: "error";
      message: string;
      fatal: boolean;
    };

/** Provider chat 呼叫的請求 Context */
export interface ChatRequestContext {
  podId: string;
  message: string | ContentBlock[];
  workspacePath: string;
  resumeSessionId: string | null;
  abortSignal: AbortSignal;
  runContext?: RunContext;
  /** Provider 特定設定（例如 codex 的 model 名稱），來自 Pod.providerConfig */
  providerConfig?: Record<string, unknown>;
}

/** Provider 抽象介面，所有 Provider 實作需遵循此合約 */
export interface AgentProvider {
  name: ProviderName;
  capabilities: ProviderCapabilities;
  /** 發起聊天，回傳標準化事件的 AsyncIterable */
  chat(ctx: ChatRequestContext): AsyncIterable<NormalizedEvent>;
  /** 取消指定 podSessionKey 的進行中請求，回傳是否成功取消 */
  cancel(podSessionKey: string): boolean;
}
