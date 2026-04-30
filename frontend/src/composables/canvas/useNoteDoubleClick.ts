import type { useCommandStore } from "@/stores/note";

type EditableNoteType = "command";
type NoteType = "repository" | "command";

interface UseNoteDoubleClickStores {
  commandStore: ReturnType<typeof useCommandStore>;
}

export function useNoteDoubleClick(
  stores: UseNoteDoubleClickStores,
  handleOpenEditModal: (
    type: EditableNoteType,
    id: string,
  ) => Promise<void> | void,
): {
  handleNoteDoubleClick: (data: {
    noteId: string;
    noteType: NoteType;
  }) => Promise<void>;
} {
  const { commandStore } = stores;

  const editableNoteResourceIdGetters: Record<
    EditableNoteType,
    (noteId: string) => string | undefined
  > = {
    command: (noteId) =>
      commandStore.typedNotes.find((note) => note.id === noteId)?.commandId,
  };

  const handleNoteDoubleClick = async (data: {
    noteId: string;
    noteType: NoteType;
  }): Promise<void> => {
    const { noteId, noteType } = data;

    const getResourceId =
      editableNoteResourceIdGetters[noteType as EditableNoteType];
    if (!getResourceId) return;

    const resourceId = getResourceId(noteId);

    if (resourceId) {
      await handleOpenEditModal(noteType as EditableNoteType, resourceId);
    } else {
      if (import.meta.env.DEV) {
        console.error(
          `無法找到 Note (id: ${noteId}, type: ${noteType}) 的資源 ID`,
        );
      }
    }
  };

  return { handleNoteDoubleClick };
}
