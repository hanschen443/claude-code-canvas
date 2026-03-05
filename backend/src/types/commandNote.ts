import type { BaseNote } from './baseNote';

export interface CommandNote extends BaseNote {
  commandId: string;
}
