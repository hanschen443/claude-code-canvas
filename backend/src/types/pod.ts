import type { ScheduleConfig } from "./schedule.js";
import type { IntegrationBinding } from "./integration.js";
import type { ProviderName } from "../services/provider/types.js";

export type PodStatus = "idle" | "chatting" | "summarizing" | "error";

export function isPodBusy(
  status: PodStatus,
): status is "chatting" | "summarizing" {
  return status === "chatting" || status === "summarizing";
}

export type ModelType = "opus" | "sonnet" | "haiku";

export interface Pod {
  id: string;
  name: string;
  status: PodStatus;
  workspacePath: string;
  x: number;
  y: number;
  rotation: number;
  sessionId: string | null;
  outputStyleId: string | null;
  skillIds: string[];
  subAgentIds: string[];
  mcpServerIds: string[];
  pluginIds: string[];
  model: ModelType;
  provider: ProviderName;
  providerConfig: Record<string, unknown> | null;
  repositoryId: string | null;
  commandId: string | null;
  multiInstance: boolean;
  schedule?: ScheduleConfig;
  integrationBindings?: IntegrationBinding[];
}
