import type { BaseNote } from './baseNote';

export interface McpServerNote extends BaseNote {
  mcpServerId: string;
}
