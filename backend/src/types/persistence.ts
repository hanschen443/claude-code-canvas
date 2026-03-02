import type { PodStatus, ModelType } from './pod.js';
import type { AnchorPosition, ConnectionStatus } from './connection.js';
import type { PersistedScheduleConfig } from './schedule.js';
import type { PodSlackBinding } from './slack.js';

export interface PersistedToolUseInfo {
  toolUseId: string;
  toolName: string;
  input: Record<string, unknown>;
  output?: string;
  status: 'completed' | 'error';
}

export interface PersistedSubMessage {
  id: string;
  content: string;
  toolUse?: PersistedToolUseInfo[];
}

export interface PersistedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  subMessages?: PersistedSubMessage[];
}

export interface ChatHistory {
  messages: PersistedMessage[];
  lastUpdated: string;
}

export interface PersistedPod {
  id: string;
  name: string;
  status: PodStatus;
  x: number;
  y: number;
  rotation: number;
  claudeSessionId: string | null;
  outputStyleId: string | null;
  skillIds: string[];
  subAgentIds?: string[];
  mcpServerIds?: string[];
  model: ModelType;
  repositoryId: string | null;
  commandId?: string | null;
  autoClear?: boolean;
  schedule?: PersistedScheduleConfig;
  slackBinding?: PodSlackBinding;
}

export interface PersistedConnection {
  id: string;
  sourcePodId: string;
  sourceAnchor: AnchorPosition;
  targetPodId: string;
  targetAnchor: AnchorPosition;
  triggerMode: 'auto' | 'ai-decide' | 'direct';
  decideStatus?: 'none' | 'pending' | 'approved' | 'rejected' | 'error';
  decideReason?: string | null;
  connectionStatus?: ConnectionStatus;
}
