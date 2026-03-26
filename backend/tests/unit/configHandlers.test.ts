import { describe, it, expect, vi, beforeEach } from "vitest";

// --- mock 函式 ---
const mockEmitToConnection = vi.fn();
const mockGetBackupConfig = vi.fn();
const mockConfigStoreUpdate = vi.fn();
const mockReload = vi.fn();
const mockLoggerLog = vi.fn();
const mockLoggerWarn = vi.fn();
const mockLoggerError = vi.fn();
const mockFsRm = vi.fn();

// --- vi.mock ---

vi.mock("../../src/services/socketService.js", () => ({
  socketService: {
    emitToConnection: mockEmitToConnection,
  },
}));

vi.mock("../../src/services/configStore.js", () => ({
  configStore: {
    getAll: vi.fn().mockReturnValue({
      summaryModel: "sonnet",
      aiDecideModel: "sonnet",
      timezoneOffset: 8,
      backupGitRemoteUrl: "",
      backupTime: "03:00",
      backupEnabled: false,
    }),
    getBackupConfig: mockGetBackupConfig,
    update: mockConfigStoreUpdate,
  },
}));

vi.mock("../../src/services/backupScheduleService.js", () => ({
  backupScheduleService: {
    reload: mockReload,
  },
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    appDataRoot: "/mock/app/data",
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    log: mockLoggerLog,
    warn: mockLoggerWarn,
    error: mockLoggerError,
  },
}));

vi.mock("../../src/schemas/index.js", () => ({
  WebSocketResponseEvents: {
    CONFIG_GET_RESULT: "config:getResult",
    CONFIG_UPDATED: "config:updated",
  },
}));

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      rm: mockFsRm,
    },
  };
});

const { handleConfigUpdate } =
  await import("../../src/handlers/configHandlers.js");

const CONNECTION_ID = "conn-1";
const REQUEST_ID = "req-1";

const makeUpdatedConfig = (overrides = {}) => ({
  summaryModel: "sonnet",
  aiDecideModel: "sonnet",
  timezoneOffset: 8,
  backupGitRemoteUrl: "https://github.com/user/repo.git",
  backupTime: "03:00",
  backupEnabled: true,
  ...overrides,
});

describe("handleConfigUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFsRm.mockResolvedValue(undefined);
  });

  describe(".git 目錄刪除邏輯", () => {
    it("backupEnabled 從 true 變 false 時，應刪除 .git 目錄", async () => {
      mockGetBackupConfig.mockReturnValue({
        backupGitRemoteUrl: "https://github.com/user/repo.git",
        backupTime: "03:00",
        backupEnabled: true,
      });
      mockConfigStoreUpdate.mockReturnValue(
        makeUpdatedConfig({ backupEnabled: false, backupGitRemoteUrl: "" }),
      );

      await handleConfigUpdate(
        CONNECTION_ID,
        { backupEnabled: false },
        REQUEST_ID,
      );

      expect(mockFsRm).toHaveBeenCalledWith("/mock/app/data/.git", {
        recursive: true,
        force: true,
      });
    });

    it("backupEnabled 本來就是 false 再傳 false，不應嘗試刪除 .git 目錄", async () => {
      mockGetBackupConfig.mockReturnValue({
        backupGitRemoteUrl: "",
        backupTime: "03:00",
        backupEnabled: false,
      });
      mockConfigStoreUpdate.mockReturnValue(
        makeUpdatedConfig({ backupEnabled: false, backupGitRemoteUrl: "" }),
      );

      await handleConfigUpdate(
        CONNECTION_ID,
        { backupEnabled: false },
        REQUEST_ID,
      );

      expect(mockFsRm).not.toHaveBeenCalled();
    });

    it("backupEnabled 為 true 時，不應刪除 .git 目錄", async () => {
      mockGetBackupConfig.mockReturnValue({
        backupGitRemoteUrl: "",
        backupTime: "03:00",
        backupEnabled: false,
      });
      mockConfigStoreUpdate.mockReturnValue(
        makeUpdatedConfig({ backupEnabled: true }),
      );

      await handleConfigUpdate(
        CONNECTION_ID,
        { backupEnabled: true },
        REQUEST_ID,
      );

      expect(mockFsRm).not.toHaveBeenCalled();
    });

    it(".git 不存在時刪除操作拋出例外，應呼叫 logger.warn 及 logger.error，不應拋出", async () => {
      mockGetBackupConfig.mockReturnValue({
        backupGitRemoteUrl: "https://github.com/user/repo.git",
        backupTime: "03:00",
        backupEnabled: true,
      });
      mockConfigStoreUpdate.mockReturnValue(
        makeUpdatedConfig({ backupEnabled: false, backupGitRemoteUrl: "" }),
      );
      const deleteError = new Error("ENOENT: no such file or directory");
      mockFsRm.mockRejectedValue(deleteError);

      await expect(
        handleConfigUpdate(CONNECTION_ID, { backupEnabled: false }, REQUEST_ID),
      ).resolves.not.toThrow();

      expect(mockLoggerWarn).toHaveBeenCalledWith(
        "Backup",
        "Delete",
        "刪除備份 .git 目錄失敗",
      );
      expect(mockLoggerError).toHaveBeenCalledWith(
        "Backup",
        "Error",
        "刪除備份 .git 目錄時發生錯誤",
        deleteError,
      );
    });
  });

  describe("backupGitRemoteUrl 清空邏輯", () => {
    it("backupEnabled 為 false 時，configStore.update 應以空字串呼叫 backupGitRemoteUrl", async () => {
      mockGetBackupConfig.mockReturnValue({
        backupGitRemoteUrl: "https://github.com/user/repo.git",
        backupTime: "03:00",
        backupEnabled: true,
      });
      mockConfigStoreUpdate.mockReturnValue(
        makeUpdatedConfig({ backupEnabled: false, backupGitRemoteUrl: "" }),
      );

      await handleConfigUpdate(
        CONNECTION_ID,
        {
          backupEnabled: false,
          backupGitRemoteUrl: "https://github.com/user/repo.git",
        },
        REQUEST_ID,
      );

      expect(mockConfigStoreUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ backupGitRemoteUrl: "" }),
      );
    });

    it("backupEnabled 為 false 時，payload 本身不應被修改", async () => {
      mockGetBackupConfig.mockReturnValue({
        backupGitRemoteUrl: "https://github.com/user/repo.git",
        backupTime: "03:00",
        backupEnabled: true,
      });
      mockConfigStoreUpdate.mockReturnValue(
        makeUpdatedConfig({ backupEnabled: false, backupGitRemoteUrl: "" }),
      );

      const payload = {
        backupEnabled: false as const,
        backupGitRemoteUrl: "https://github.com/user/repo.git",
      };

      await handleConfigUpdate(CONNECTION_ID, payload, REQUEST_ID);

      // payload 不應被 mutate
      expect(payload.backupGitRemoteUrl).toBe(
        "https://github.com/user/repo.git",
      );
    });

    it("backupEnabled 為 true 時，backupGitRemoteUrl 應保持原值傳入 configStore.update", async () => {
      mockGetBackupConfig.mockReturnValue({
        backupGitRemoteUrl: "",
        backupTime: "03:00",
        backupEnabled: false,
      });
      const remoteUrl = "https://github.com/user/repo.git";
      mockConfigStoreUpdate.mockReturnValue(
        makeUpdatedConfig({
          backupEnabled: true,
          backupGitRemoteUrl: remoteUrl,
        }),
      );

      await handleConfigUpdate(
        CONNECTION_ID,
        { backupEnabled: true, backupGitRemoteUrl: remoteUrl },
        REQUEST_ID,
      );

      expect(mockConfigStoreUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ backupGitRemoteUrl: remoteUrl }),
      );
    });
  });

  describe("成功刪除 .git 後記錄 log", () => {
    it("成功刪除 .git 目錄時，應呼叫 logger.log", async () => {
      mockGetBackupConfig.mockReturnValue({
        backupGitRemoteUrl: "https://github.com/user/repo.git",
        backupTime: "03:00",
        backupEnabled: true,
      });
      mockConfigStoreUpdate.mockReturnValue(
        makeUpdatedConfig({ backupEnabled: false, backupGitRemoteUrl: "" }),
      );

      await handleConfigUpdate(
        CONNECTION_ID,
        { backupEnabled: false },
        REQUEST_ID,
      );

      expect(mockLoggerLog).toHaveBeenCalledWith(
        "Backup",
        "Delete",
        "已刪除備份 .git 目錄",
      );
    });
  });
});
