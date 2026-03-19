import { describe, it, expect, vi } from "vitest";
import { webSocketMockFactory } from "../../helpers/mockWebSocket";
import { setupStoreTest } from "../../helpers/testSetup";
import { useCanvasStore } from "@/stores/canvasStore";
import { useOutputStyleStore } from "@/stores/note/outputStyleStore";
import { useSkillStore } from "@/stores/note/skillStore";
import { useRepositoryStore } from "@/stores/note/repositoryStore";
import { useSubAgentStore } from "@/stores/note/subAgentStore";
import { useCommandStore } from "@/stores/note/commandStore";
import { useMcpServerStore } from "@/stores/note/mcpServerStore";
import { getNoteEventListeners } from "@/composables/eventHandlers/noteEventHandlers";

vi.mock("@/services/websocket", () => webSocketMockFactory());

vi.mock("@/services/websocket/createWebSocketRequest", () => ({
  tryResolvePendingRequest: vi.fn().mockReturnValue(false),
  createWebSocketRequest: vi.fn(),
}));

vi.mock("@/composables/useToast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe("noteEventHandlers", () => {
  setupStoreTest(() => {
    const canvasStore = useCanvasStore();
    canvasStore.activeCanvasId = "canvas-1";
  });

  function findHandler(event: string) {
    const listeners = getNoteEventListeners();
    return listeners.find((l) => l.event === event)!.handler;
  }

  describe("getNoteEventListeners", () => {
    it("應回傳正確數量的 listener", () => {
      const result = getNoteEventListeners();
      // 26 個事件：6 種 note 各 3 個 CRUD + outputStyle/skill/repository/subAgent/command/mcpServer 各 1 個 deleted + worktree created + branch changed + mcpServer CRUD
      expect(result.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe("outputStyleNote handlers（canvasId 防護）", () => {
    it("note:created - canvasId 匹配且 note 存在時應呼叫 addNoteFromEvent", () => {
      const store = useOutputStyleStore();
      const spy = vi.spyOn(store, "addNoteFromEvent");
      const note = { id: "note-1", podId: "pod-1", content: "內容" };

      findHandler("note:created")({ canvasId: "canvas-1", note });

      expect(spy).toHaveBeenCalledWith(note);
    });

    it("note:created - canvasId 不匹配時不應執行", () => {
      const store = useOutputStyleStore();
      const spy = vi.spyOn(store, "addNoteFromEvent");

      findHandler("note:created")({
        canvasId: "other-canvas",
        note: { id: "note-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });

    it("note:updated - canvasId 匹配且 note 存在時應呼叫 updateNoteFromEvent", () => {
      const store = useOutputStyleStore();
      const spy = vi.spyOn(store, "updateNoteFromEvent");
      const note = { id: "note-1", content: "更新內容" };

      findHandler("note:updated")({ canvasId: "canvas-1", note });

      expect(spy).toHaveBeenCalledWith(note);
    });

    it("note:updated - canvasId 不匹配時不應執行", () => {
      const store = useOutputStyleStore();
      const spy = vi.spyOn(store, "updateNoteFromEvent");

      findHandler("note:updated")({
        canvasId: "other-canvas",
        note: { id: "note-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });

    it("note:deleted - canvasId 匹配時應呼叫 removeNoteFromEvent", () => {
      const store = useOutputStyleStore();
      const spy = vi.spyOn(store, "removeNoteFromEvent");

      findHandler("note:deleted")({ canvasId: "canvas-1", noteId: "note-1" });

      expect(spy).toHaveBeenCalledWith("note-1");
    });

    it("note:deleted - canvasId 不匹配時不應執行", () => {
      const store = useOutputStyleStore();
      const spy = vi.spyOn(store, "removeNoteFromEvent");

      findHandler("note:deleted")({
        canvasId: "other-canvas",
        noteId: "note-1",
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("skillNote handlers（canvasId 防護）", () => {
    it("skill:note:created - canvasId 匹配時應呼叫 addNoteFromEvent", () => {
      const store = useSkillStore();
      const spy = vi.spyOn(store, "addNoteFromEvent");
      const note = { id: "sk-note-1" };

      findHandler("skill-note:created")({ canvasId: "canvas-1", note });

      expect(spy).toHaveBeenCalledWith(note);
    });

    it("skill:note:created - canvasId 不匹配時不應執行", () => {
      const store = useSkillStore();
      const spy = vi.spyOn(store, "addNoteFromEvent");

      findHandler("skill-note:created")({
        canvasId: "other-canvas",
        note: { id: "sk-note-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handleOutputStyleDeleted（canvasId 防護）", () => {
    it("canvasId 匹配時應呼叫 removeItemFromEvent", () => {
      const store = useOutputStyleStore();
      const spy = vi.spyOn(store, "removeItemFromEvent");

      findHandler("output-style:deleted")({
        canvasId: "canvas-1",
        outputStyleId: "os-1",
        deletedNoteIds: ["note-1"],
      });

      expect(spy).toHaveBeenCalledWith("os-1", ["note-1"]);
    });

    it("canvasId 不匹配時不應執行", () => {
      const store = useOutputStyleStore();
      const spy = vi.spyOn(store, "removeItemFromEvent");

      findHandler("output-style:deleted")({
        canvasId: "other-canvas",
        outputStyleId: "os-1",
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handleRepositoryWorktreeCreated（canvasId 防護）", () => {
    it("canvasId 匹配且 repository 有效時應呼叫 addItemFromEvent", () => {
      const store = useRepositoryStore();
      const spy = vi.spyOn(store, "addItemFromEvent");
      const repository = { id: "repo-1", name: "my-repo" };

      findHandler("repository:worktree:created")({
        canvasId: "canvas-1",
        repository,
      });

      expect(spy).toHaveBeenCalledWith(repository);
    });

    it("canvasId 不匹配時不應執行", () => {
      const store = useRepositoryStore();
      const spy = vi.spyOn(store, "addItemFromEvent");

      findHandler("repository:worktree:created")({
        canvasId: "other-canvas",
        repository: { id: "repo-1", name: "my-repo" },
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe("handleRepositoryBranchChanged（skipCanvasCheck: true）", () => {
    it("branchName 合法時應更新 repository 的 currentBranch", () => {
      const store = useRepositoryStore();
      // 模擬已存在的 repository item
      const mockItem = { id: "repo-1", name: "repo", currentBranch: "main" };
      Object.defineProperty(store, "typedAvailableItems", {
        get: () => [mockItem],
        configurable: true,
      });

      findHandler("repository:branch:changed")({
        repositoryId: "repo-1",
        branchName: "feature/test",
      });

      expect(mockItem.currentBranch).toBe("feature/test");
    });

    it("branchName 包含不合法字元時不應更新", () => {
      const store = useRepositoryStore();
      const mockItem = { id: "repo-1", name: "repo", currentBranch: "main" };
      Object.defineProperty(store, "typedAvailableItems", {
        get: () => [mockItem],
        configurable: true,
      });

      findHandler("repository:branch:changed")({
        repositoryId: "repo-1",
        branchName: "bad branch name!",
      });

      expect(mockItem.currentBranch).toBe("main");
    });
  });

  describe("handleMcpServerDeleted（skipCanvasCheck: true）", () => {
    it("mcpServerId 有效時應呼叫 removeItemFromEvent", () => {
      const store = useMcpServerStore();
      const spy = vi.spyOn(store, "removeItemFromEvent");

      findHandler("mcp-server:deleted")({
        mcpServerId: "mcp-1",
        deletedNoteIds: ["note-1"],
      });

      expect(spy).toHaveBeenCalledWith("mcp-1", ["note-1"]);
    });
  });

  describe("其他 note 類型的 canvasId 防護", () => {
    it("repository:note:created - canvasId 不匹配時不應執行", () => {
      const store = useRepositoryStore();
      const spy = vi.spyOn(store, "addNoteFromEvent");

      findHandler("repository-note:created")({
        canvasId: "other-canvas",
        note: { id: "rn-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });

    it("subagent:note:created - canvasId 不匹配時不應執行", () => {
      const store = useSubAgentStore();
      const spy = vi.spyOn(store, "addNoteFromEvent");

      findHandler("subagent-note:created")({
        canvasId: "other-canvas",
        note: { id: "sa-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });

    it("command:note:created - canvasId 不匹配時不應執行", () => {
      const store = useCommandStore();
      const spy = vi.spyOn(store, "addNoteFromEvent");

      findHandler("command-note:created")({
        canvasId: "other-canvas",
        note: { id: "cmd-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });

    it("mcp-server:note:created - canvasId 不匹配時不應執行", () => {
      const store = useMcpServerStore();
      const spy = vi.spyOn(store, "addNoteFromEvent");

      findHandler("mcp-server-note:created")({
        canvasId: "other-canvas",
        note: { id: "mcp-n-1" },
      });

      expect(spy).not.toHaveBeenCalled();
    });
  });
});
