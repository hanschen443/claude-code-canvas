import type { PodPublicView } from "../pod.js";
import type { RepositoryNote } from "../repositoryNote.js";
import type { CommandNote } from "../commandNote.js";
import type { Connection } from "../connection.js";
import type { I18nError } from "../../utils/i18nError.js";

export interface PasteError {
  type: "pod" | "repositoryNote" | "commandNote";
  originalId: string;
  error: string | I18nError;
}

export interface CanvasPasteResultPayload {
  canvasId: string;
  requestId: string;
  success: boolean;
  createdPods: PodPublicView[];
  createdRepositoryNotes: RepositoryNote[];
  createdCommandNotes: CommandNote[];
  createdConnections: Connection[];
  podIdMapping: Record<string, string>;
  errors: PasteError[];
  error?: string;
}
