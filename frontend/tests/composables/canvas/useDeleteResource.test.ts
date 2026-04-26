import { describe, it, expect, beforeEach, vi } from "vitest";
import { useDeleteResource } from "@/composables/canvas/useDeleteResource";

describe("useDeleteResource", () => {
  let mockStores: {
    repositoryStore: {
      isItemInUse: ReturnType<typeof vi.fn>;
      deleteRepository: ReturnType<typeof vi.fn>;
    };
    commandStore: {
      isItemInUse: ReturnType<typeof vi.fn>;
      deleteCommand: ReturnType<typeof vi.fn>;
      deleteGroup: ReturnType<typeof vi.fn>;
    };
    // TODO Phase 4: mcpServerStore 重構後補回
  };

  beforeEach(() => {
    mockStores = {
      repositoryStore: {
        isItemInUse: vi.fn().mockReturnValue(false),
        deleteRepository: vi.fn().mockResolvedValue(undefined),
      },
      commandStore: {
        isItemInUse: vi.fn().mockReturnValue(false),
        deleteCommand: vi.fn().mockResolvedValue(undefined),
        deleteGroup: vi.fn().mockResolvedValue({ success: true }),
      },
    };
  });

  describe("handleOpenDeleteModal - 開啟刪除確認 Modal", () => {
    it("開啟刪除 Modal 時應設定 deleteTarget 並顯示 Modal", () => {
      const composable = useDeleteResource(mockStores as any);

      composable.handleOpenDeleteModal("repository", "repo-1", "My Repo");

      expect(composable.showDeleteModal.value).toBe(true);
      expect(composable.deleteTarget.value).toEqual({
        type: "repository",
        id: "repo-1",
        name: "My Repo",
      });
    });

    it("開啟不同類型的刪除 Modal 時應正確設定 type", () => {
      const composable = useDeleteResource(mockStores as any);

      composable.handleOpenDeleteModal("command", "cmd-1", "My Command");

      expect(composable.deleteTarget.value?.type).toBe("command");
    });
  });

  describe("isDeleteTargetInUse - 檢查目標是否被使用", () => {
    it("repository 被使用中時應回傳 true", () => {
      mockStores.repositoryStore.isItemInUse.mockReturnValue(true);
      const composable = useDeleteResource(mockStores as any);
      composable.handleOpenDeleteModal("repository", "repo-1", "My Repo");

      expect(composable.isDeleteTargetInUse.value).toBe(true);
    });

    it("repository 未被使用時應回傳 false", () => {
      mockStores.repositoryStore.isItemInUse.mockReturnValue(false);
      const composable = useDeleteResource(mockStores as any);
      composable.handleOpenDeleteModal("repository", "repo-1", "My Repo");

      expect(composable.isDeleteTargetInUse.value).toBe(false);
    });

    it("commandGroup 應永遠回傳 false（不支援 isItemInUse）", () => {
      const composable = useDeleteResource(mockStores as any);
      composable.handleOpenDeleteGroupModal("group-1", "My Group");

      expect(composable.isDeleteTargetInUse.value).toBe(false);
    });
  });

  describe("handleConfirmDelete - 確認刪除", () => {
    it("沒有 deleteTarget 時不應呼叫任何刪除函式", async () => {
      const composable = useDeleteResource(mockStores as any);

      await composable.handleConfirmDelete();

      expect(
        mockStores.repositoryStore.deleteRepository,
      ).not.toHaveBeenCalled();
      expect(mockStores.commandStore.deleteCommand).not.toHaveBeenCalled();
    });

    it("確認刪除 repository 後應呼叫 deleteRepository", async () => {
      const composable = useDeleteResource(mockStores as any);
      composable.handleOpenDeleteModal("repository", "repo-1", "My Repo");

      await composable.handleConfirmDelete();

      expect(mockStores.repositoryStore.deleteRepository).toHaveBeenCalledWith(
        "repo-1",
      );
    });

    // TODO Phase 4: 「確認刪除 mcpServer 後應呼叫 deleteMcpServer」測試重構後補回

    it("確認刪除 commandGroup 後應呼叫 commandStore.deleteGroup", async () => {
      const composable = useDeleteResource(mockStores as any);
      composable.handleOpenDeleteGroupModal("cmd-group-1", "My CMD Group");

      await composable.handleConfirmDelete();

      expect(mockStores.commandStore.deleteGroup).toHaveBeenCalledWith(
        "cmd-group-1",
      );
    });

    it("刪除失敗時不應關閉 Modal", async () => {
      const composable = useDeleteResource(mockStores as any);
      mockStores.commandStore.deleteGroup.mockResolvedValue({
        success: false,
        error: "刪除失敗",
      });
      composable.handleOpenDeleteGroupModal("group-1", "My Group");

      await composable.handleConfirmDelete();

      expect(composable.showDeleteModal.value).toBe(true);
      expect(composable.deleteTarget.value).not.toBeNull();
    });
  });
});
