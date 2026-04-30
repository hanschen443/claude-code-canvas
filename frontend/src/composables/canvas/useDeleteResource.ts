import { ref, computed } from "vue";
import type { Ref, ComputedRef } from "vue";
import type { Group } from "@/types";
import { useToast } from "@/composables/useToast";
import { t } from "@/i18n";

type ItemType = "repository" | "command";
// 目前只有一種 group
const COMMAND_GROUP_TYPE = "commandGroup" as const;
type GroupType = typeof COMMAND_GROUP_TYPE;
type ExtendedItemType = ItemType | GroupType;

interface DeleteTarget {
  type: ExtendedItemType;
  id: string;
  name: string;
}

interface DeletableStore {
  isItemInUse: (id: string) => boolean;
}

interface DeleteResourceStores {
  repositoryStore: DeletableStore & {
    deleteRepository: (id: string) => Promise<void>;
  };
  commandStore: DeletableStore & {
    deleteCommand: (id: string) => Promise<void>;
    deleteGroup: (id: string) => Promise<{ success: boolean; error?: string }>;
  };
}

export function useDeleteResource(stores: DeleteResourceStores): {
  showDeleteModal: Ref<boolean>;
  deleteTarget: Ref<DeleteTarget | null>;
  isDeleteTargetInUse: ComputedRef<boolean>;
  handleOpenDeleteModal: (
    type: ExtendedItemType,
    id: string,
    name: string,
  ) => void;
  handleOpenDeleteGroupModal: (groupId: string, name: string) => void;
  handleConfirmDelete: () => Promise<void>;
  closeDeleteModal: () => void;
} {
  const { repositoryStore, commandStore } = stores;

  const showDeleteModal = ref(false);
  const deleteTarget = ref<DeleteTarget | null>(null);

  const isDeleteTargetInUse = computed((): boolean => {
    if (!deleteTarget.value) return false;

    const { type, id } = deleteTarget.value;

    const inUseChecks: Record<ExtendedItemType, () => boolean> = {
      repository: (): boolean => repositoryStore.isItemInUse(id),
      command: (): boolean => commandStore.isItemInUse(id),
      commandGroup: (): boolean => false,
    };

    return inUseChecks[type]();
  });

  function handleOpenDeleteModal(
    type: ExtendedItemType,
    id: string,
    name: string,
  ): void {
    deleteTarget.value = { type, id, name };
    showDeleteModal.value = true;
  }

  function handleOpenDeleteGroupModal(groupId: string, name: string): void {
    deleteTarget.value = { type: COMMAND_GROUP_TYPE, id: groupId, name };
    showDeleteModal.value = true;
  }

  async function handleConfirmDelete(): Promise<void> {
    if (!deleteTarget.value) return;

    const { type, id } = deleteTarget.value;

    const deleteActions: Record<
      ExtendedItemType,
      () => Promise<void | { success: boolean; group?: Group; error?: string }>
    > = {
      repository: (): Promise<void> => repositoryStore.deleteRepository(id),
      command: (): Promise<void> => commandStore.deleteCommand(id),
      commandGroup: () => commandStore.deleteGroup(id),
    };

    const result = await deleteActions[type]();

    if (result && typeof result === "object" && !result.success) {
      const { showErrorToast } = useToast();
      showErrorToast("Pod", t("composableDeleteResource.deleteFailed"));
      return;
    }

    showDeleteModal.value = false;
    deleteTarget.value = null;
  }

  function closeDeleteModal(): void {
    showDeleteModal.value = false;
    deleteTarget.value = null;
  }

  return {
    showDeleteModal,
    deleteTarget,
    isDeleteTargetInUse,
    handleOpenDeleteModal,
    handleOpenDeleteGroupModal,
    handleConfirmDelete,
    closeDeleteModal,
  };
}
