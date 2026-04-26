import { describe, it, expect, vi } from "vitest";
import { ref } from "vue";
import { useCanvasNoteHandlers } from "@/composables/canvas/useCanvasNoteHandlers";

vi.mock("@/composables/canvas/useNoteEventHandlers", () => ({
  useNoteEventHandlers: () => ({
    handleDragEnd: vi.fn(),
    handleDragMove: vi.fn(),
    handleDragComplete: vi.fn(),
  }),
}));

function createNoteStore(overrides: Record<string, unknown> = {}) {
  return {
    isDraggingNote: false,
    isOverTrash: false,
    notes: [] as unknown[],
    createNote: vi.fn(),
    updateNotePositionLocal: vi.fn(),
    updateNotePosition: vi.fn().mockResolvedValue(undefined),
    setIsOverTrash: vi.fn(),
    setNoteAnimating: vi.fn(),
    deleteNote: vi.fn().mockResolvedValue(undefined),
    getNoteById: vi.fn(),
    typedNotes: [] as Array<Record<string, unknown>>,
    typedAvailableItems: [] as Array<Record<string, unknown>>,
    ...overrides,
  };
}

function createOptions(overrides: Record<string, unknown> = {}) {
  const podStore = {
    podCount: 0,
    typeMenu: { position: null as { x: number; y: number } | null },
  };
  const viewportStore = { offset: { x: 0, y: 0 }, zoom: 1 };
  const repositoryStore = createNoteStore();
  const commandStore = createNoteStore();
  const trashZoneRef = ref(null);
  const handleOpenEditModal = vi.fn().mockResolvedValue(undefined);

  return {
    podStore,
    viewportStore,
    repositoryStore,
    commandStore,
    trashZoneRef,
    handleOpenEditModal,
    ...overrides,
  };
}

describe("useCanvasNoteHandlers", () => {
  describe("showTrashZone", () => {
    it("任一 store 有 isDraggingNote 時為 true", () => {
      const options = createOptions();
      options.repositoryStore.isDraggingNote = true;

      const { showTrashZone } = useCanvasNoteHandlers(
        options as unknown as Parameters<typeof useCanvasNoteHandlers>[0],
      );

      expect(showTrashZone.value).toBe(true);
    });

    it("所有 store 的 isDraggingNote 都為 false 時為 false", () => {
      const options = createOptions();

      const { showTrashZone } = useCanvasNoteHandlers(
        options as unknown as Parameters<typeof useCanvasNoteHandlers>[0],
      );

      expect(showTrashZone.value).toBe(false);
    });
  });

  describe("isCanvasEmpty", () => {
    it("podCount 為 0 且所有 notes 皆空時為 true", () => {
      const options = createOptions();

      const { isCanvasEmpty } = useCanvasNoteHandlers(
        options as unknown as Parameters<typeof useCanvasNoteHandlers>[0],
      );

      expect(isCanvasEmpty.value).toBe(true);
    });

    it("podCount 不為 0 時為 false", () => {
      const options = createOptions();
      options.podStore.podCount = 1;

      const { isCanvasEmpty } = useCanvasNoteHandlers(
        options as unknown as Parameters<typeof useCanvasNoteHandlers>[0],
      );

      expect(isCanvasEmpty.value).toBe(false);
    });

    it("任一 store 有 notes 時為 false", () => {
      const options = createOptions();
      options.repositoryStore.notes = [{ id: "note-1" }];

      const { isCanvasEmpty } = useCanvasNoteHandlers(
        options as unknown as Parameters<typeof useCanvasNoteHandlers>[0],
      );

      expect(isCanvasEmpty.value).toBe(false);
    });
  });
});
