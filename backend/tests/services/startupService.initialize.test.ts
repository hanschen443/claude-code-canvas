import { vi, describe, it, expect, beforeEach } from "vitest";

// mock 所有重型依賴，僅測試 initialize() 的流程邏輯

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockAccess = vi.fn().mockRejectedValue({ code: "ENOENT" });
const mockRm = vi.fn().mockResolvedValue(undefined);
const mockRename = vi.fn().mockResolvedValue(undefined);

vi.mock("fs", () => ({
  promises: {
    mkdir: mockMkdir,
    access: mockAccess,
    rm: mockRm,
    rename: mockRename,
    readFile: vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      ),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockScheduleStart = vi.fn();
const mockBackupScheduleStart = vi.fn();

vi.mock("../../src/services/scheduleService.js", () => ({
  scheduleService: { start: mockScheduleStart },
}));

vi.mock("../../src/services/backupScheduleService.js", () => ({
  backupScheduleService: { start: mockBackupScheduleStart },
}));

const mockCanvasList = vi.fn();
const mockCanvasCreate = vi.fn();

vi.mock("../../src/services/canvasStore.js", () => ({
  canvasStore: {
    list: mockCanvasList,
    create: mockCanvasCreate,
  },
}));

const mockGetDb = vi.fn().mockReturnValue({ exec: vi.fn() });

vi.mock("../../src/database/index.js", () => ({
  getDb: mockGetDb,
}));

const mockEncryptionInit = vi.fn().mockResolvedValue(undefined);
const mockMigrateUnencrypted = vi.fn().mockReturnValue(0);

vi.mock("../../src/services/encryptionService.js", () => ({
  encryptionService: {
    initializeKey: mockEncryptionInit,
  },
}));

const mockIntegrationRegistryList = vi.fn().mockReturnValue([]);
const mockIntegrationAppStoreList = vi.fn().mockReturnValue([]);
const mockIntegrationAppStoreMigrateUnencrypted = vi.fn().mockReturnValue(0);

vi.mock("../../src/services/integration/index.js", () => ({
  integrationRegistry: { list: mockIntegrationRegistryList },
  integrationAppStore: {
    list: mockIntegrationAppStoreList,
    migrateUnencryptedConfigs: mockIntegrationAppStoreMigrateUnencrypted,
  },
}));

// 避免 side-effect import
vi.mock("../../src/services/integration/providers/index.js", () => ({}));

const { startupService } = await import("../../src/services/startupService.js");

describe("StartupService.initialize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 預設: 目錄建立成功
    mockMkdir.mockResolvedValue(undefined);
    // 預設: 舊路徑不存在（不觸發 migrate）
    mockAccess.mockRejectedValue(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );
    // 預設: 加密遷移 0 筆
    mockIntegrationAppStoreMigrateUnencrypted.mockReturnValue(0);
    // 預設: 已有 canvas，不建立預設
    mockCanvasList.mockReturnValue([
      { id: "c1", name: "default", sortIndex: 0 },
    ]);
    mockIntegrationRegistryList.mockReturnValue([]);
    mockGetDb.mockReturnValue({ exec: vi.fn() });
  });

  it("正常流程回傳 ok(undefined)", async () => {
    const result = await startupService.initialize();
    expect(result.success).toBe(true);
  });

  it("無 canvas 時成功建立預設 canvas", async () => {
    mockCanvasList.mockReturnValue([]);
    mockCanvasCreate.mockResolvedValue({
      success: true,
      data: { id: "new", name: "default", sortIndex: 0 },
    });

    const result = await startupService.initialize();

    expect(result.success).toBe(true);
    expect(mockCanvasCreate).toHaveBeenCalledWith("default");
  });

  it("ensureDirectories 失敗時提早回傳 err", async () => {
    const dirError = Object.assign(new Error("EACCES"), { code: "EACCES" });
    mockMkdir.mockRejectedValue(dirError);

    const result = await startupService.initialize();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("伺服器初始化失敗");
    }
    // scheduleService.start 不應被呼叫
    expect(mockScheduleStart).not.toHaveBeenCalled();
  });

  it("canvasStore.create 失敗時回傳 err", async () => {
    mockCanvasList.mockReturnValue([]);
    mockCanvasCreate.mockResolvedValue({
      success: false,
      error: "DB 寫入失敗",
    });

    const result = await startupService.initialize();

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("建立預設 Canvas 失敗");
    }
    expect(mockScheduleStart).not.toHaveBeenCalled();
  });

  it("成功後啟動 scheduleService 與 backupScheduleService", async () => {
    const result = await startupService.initialize();

    expect(result.success).toBe(true);
    expect(mockScheduleStart).toHaveBeenCalled();
    expect(mockBackupScheduleStart).toHaveBeenCalled();
  });
});
