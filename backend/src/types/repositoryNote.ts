import type { BaseNote } from './baseNote';

export interface RepositoryNote extends BaseNote {
  repositoryId: string;
}
