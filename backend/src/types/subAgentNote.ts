import type { BaseNote } from './baseNote';

export interface SubAgentNote extends BaseNote {
  subAgentId: string;
}
