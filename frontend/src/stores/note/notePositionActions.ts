import { createWebSocketRequest } from "@/services/websocket";
import { getActiveCanvasIdOrWarn } from "@/utils/canvasGuard";
import type { NoteStoreConfig } from "./createNoteStore";
import type { BasePayload, BaseResponse } from "@/types";

interface NoteItem {
  id: string;
  x: number;
  y: number;
  [key: string]: unknown;
}

interface NotePositionStore {
  notes: NoteItem[];
}

export function createNotePositionActions<TItem>(
  config: NoteStoreConfig<TItem>,
): {
  updateNotePositionLocal: (
    this: NotePositionStore,
    noteId: string,
    x: number,
    y: number,
  ) => void;
  updateNotePosition: (
    this: NotePositionStore,
    noteId: string,
    x: number,
    y: number,
  ) => Promise<void>;
} {
  return {
    updateNotePositionLocal(
      this: NotePositionStore,
      noteId: string,
      x: number,
      y: number,
    ): void {
      const note = this.notes.find((note) => note.id === noteId);
      if (!note) return;
      note.x = x;
      note.y = y;
    },

    async updateNotePosition(
      this: NotePositionStore,
      noteId: string,
      x: number,
      y: number,
    ): Promise<void> {
      const note = this.notes.find((note) => note.id === noteId);
      if (!note) return;

      const originalX = note.x;
      const originalY = note.y;

      note.x = x;
      note.y = y;

      // 直接使用 createWebSocketRequest 取代 useSendCanvasAction composable，
      // 避免在非 setup 的 async 函式中呼叫 composable 違反 Vue 規範
      const canvasId = getActiveCanvasIdOrWarn("updateNotePosition");
      if (!canvasId) {
        note.x = originalX;
        note.y = originalY;
        return;
      }

      const response = await createWebSocketRequest<BasePayload, BaseResponse>({
        requestEvent: config.events.updateNote.request,
        responseEvent: config.events.updateNote.response,
        payload: { canvasId, noteId, x, y },
      }).catch(() => null);

      if (!response) {
        note.x = originalX;
        note.y = originalY;
        return;
      }

      if (response.note) {
        const index = this.notes.findIndex((note) => note.id === noteId);
        if (index !== -1) {
          this.notes[index] = response.note as NoteItem;
        }
      }
    },
  };
}
