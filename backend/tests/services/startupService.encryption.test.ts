import { vi, describe, it, expect, beforeEach } from "vitest";

// 測試 migrateEncryptionIfNeeded 的 VACUUM 路徑 & restoreIntegrationConnections provider 失敗行為

const mockExec = vi.fn();
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi
  .fn()
  .mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
const mockRm = vi.fn().mockResolvedValue(undefined);

vi.mock("fs", () => ({
  promises: {
    mkdir: mockMkdir,
    access: mockAccess,
    rm: mockRm,
    rename: vi.fn().mockResolvedValue(undefined),
    readFile: vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      ),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/services/scheduleService.js", () => ({
  scheduleService: { start: vi.fn() },
}));

vi.mock("../../src/services/backupScheduleService.js", () => ({
  backupScheduleService: { start: vi.fn() },
}));

vi.mock("../../src/services/canvasStore.js", () => ({
  canvasStore: {
    list: vi
      .fn()
      .mockReturnValue([{ id: "c1", name: "default", sortIndex: 0 }]),
    create: vi.fn(),
  },
}));

const mockMigrateUnencrypted = vi.fn();
const mockIntegrationAppStoreList = vi.fn().mockReturnValue([]);
const mockIntegrationRegistryList = vi.fn().mockReturnValue([]);

vi.mock("../../src/services/integration/index.js", () => ({
  integrationRegistry: { list: mockIntegrationRegistryList },
  integrationAppStore: {
    list: mockIntegrationAppStoreList,
    migrateUnencryptedConfigs: mockMigrateUnencrypted,
  },
}));

vi.mock("../../src/services/integration/providers/index.js", () => ({}));

vi.mock("../../src/services/encryptionService.js", () => ({
  encryptionService: {
    initializeKey: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../src/database/index.js", () => ({
  getDb: vi.fn().mockReturnValue({ exec: mockExec }),
}));

const mockLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};
vi.mock("../../src/utils/logger.js", () => ({
  logger: mockLogger,
}));

const { startupService } = await import("../../src/services/startupService.js");

describe("StartupService.migrateEncryptionIfNeeded - VACUUM 路徑", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockAccess.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    mockRm.mockResolvedValue(undefined);
    mockIntegrationRegistryList.mockReturnValue([]);
    mockIntegrationAppStoreList.mockReturnValue([]);
  });

  it("migratedCount > 0 時執行 VACUUM 並嘗試清除 .git 目錄", async () => {
    mockMigrateUnencrypted.mockReturnValue(3);

    const result = await startupService.initialize();

    expect(result.success).toBe(true);
    expect(mockExec).toHaveBeenCalledWith("VACUUM");
    expect(mockRm).toHaveBeenCalledWith(expect.stringContaining(".git"), {
      recursive: true,
      force: true,
    });
  });

  it("migratedCount === 0 時不執行 VACUUM", async () => {
    mockMigrateUnencrypted.mockReturnValue(0);

    const result = await startupService.initialize();

    expect(result.success).toBe(true);
    expect(mockExec).not.toHaveBeenCalled();
  });
});

describe("StartupService.restoreIntegrationConnections - provider 失敗", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockAccess.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    mockMigrateUnencrypted.mockReturnValue(0);
  });

  it("provider.initialize 拋錯時記錄 error log 但流程不中斷", async () => {
    const mockApp = { id: "app-1", providerName: "slack" };
    const mockProvider = {
      name: "slack",
      initialize: vi.fn().mockRejectedValue(new Error("連線失敗")),
    };

    mockIntegrationRegistryList.mockReturnValue([mockProvider]);
    mockIntegrationAppStoreList.mockReturnValue([mockApp]);

    const result = await startupService.initialize();

    // 流程不中斷，initialize 仍回傳 ok
    expect(result.success).toBe(true);
    // 但 error 需被記錄
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Integration",
      "Error",
      expect.stringContaining("app-1"),
      expect.any(Error),
    );
  });
});
