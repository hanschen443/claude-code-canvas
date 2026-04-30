/**
 * connectionStore unit test
 *
 * 驗證 create 與 update 路徑的 summaryModel 邏輯：
 * - 上游 Pod 為 Claude，未帶 summaryModel → summaryModel 為 Claude 預設
 * - 上游 Pod 為 Codex，未帶 summaryModel → summaryModel 為 Codex 預設
 * - 上游 Pod 為 Claude，帶入 Codex 模型 → fallback 到 Claude 預設
 * - 上游 Pod 為 Codex，帶入 Claude 模型 → fallback 到 Codex 預設
 * - 上游 Pod 找不到 → fallback 到 claude 預設
 * - update 路徑也做 model 驗證
 *
 * 移除 podStore.getById 自家 mock，改用 initTestDb + 真實 pod 資料。
 * getProvider 保留 mock（resolveProviderConfig 與 resolveModelWithFallback 均需要 metadata）。
 */

// getProvider 是 SDK boundary，且 podStore.getById → buildPodFromRow → resolveProviderConfig 需要 metadata
// 因此保留 mock，並依 provider 回傳對應的 metadata
const { mockGetProvider } = vi.hoisted(() => ({
  mockGetProvider: vi.fn((provider: string) => {
    if (provider === "codex") {
      return {
        metadata: {
          availableModelValues: new Set(["gpt-5.4", "gpt-5.5", "gpt-5.4-mini"]),
          availableModels: [
            { label: "GPT-5.4", value: "gpt-5.4" },
            { label: "GPT-5.5", value: "gpt-5.5" },
          ],
          defaultOptions: { model: "gpt-5.4" },
          capabilities: {
            chat: true,
            plugin: false,
            mcp: false,
            repository: true,
          },
        },
      };
    }
    // 預設回傳 claude metadata
    return {
      metadata: {
        availableModelValues: new Set(["opus", "sonnet", "haiku"]),
        availableModels: [
          { label: "Opus", value: "opus" },
          { label: "Sonnet", value: "sonnet" },
        ],
        defaultOptions: { model: "opus" },
        capabilities: { chat: true, plugin: true, mcp: true, repository: true },
      },
    };
  }),
}));

vi.mock("../../src/services/provider/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/services/provider/index.js")
    >();
  return { ...actual, getProvider: mockGetProvider };
});

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectionStore } from "../../src/services/connectionStore.js";
import { initTestDb, closeDb, getDb } from "../../src/database/index.js";
import { resetStatements } from "../../src/database/statements.js";

const CANVAS_ID = "test-canvas-model";

/** 建立測試用 canvas */
function insertCanvas(): void {
  getDb()
    .prepare(
      "INSERT OR IGNORE INTO canvases (id, name, sort_index) VALUES (?, ?, ?)",
    )
    .run(CANVAS_ID, "Test Canvas", 0);
}

/** 直接用 SQL 插入 pod，指定 provider */
function insertPod(podId: string, provider: "claude" | "codex"): void {
  getDb()
    .prepare(
      `INSERT INTO pods
             (id, canvas_id, name, status, x, y, rotation, workspace_path,
              session_id, repository_id, command_id, multi_instance,
              schedule_json, provider, provider_config_json)
             VALUES (?, ?, ?, 'idle', 0, 0, 0, '/tmp/test-pod', NULL, NULL, NULL, 0, NULL, ?,
             '{"model":"sonnet"}')`,
    )
    .run(podId, CANVAS_ID, `Pod-${podId}`, provider);
}

describe("connectionStore — summaryModel 驗證邏輯", () => {
  beforeEach(() => {
    closeDb();
    resetStatements();
    initTestDb();
    insertCanvas();
    vi.clearAllMocks();
  });

  afterEach(() => {
    closeDb();
  });

  // ----------------------------------------------------------------
  // create 路徑
  // ----------------------------------------------------------------
  describe("create — summaryModel 預設與驗證", () => {
    it("上游 Pod 為 Claude，未帶 summaryModel → summaryModel 為 Claude 預設（opus）", () => {
      insertPod("pod-src", "claude");

      const conn = connectionStore.create(CANVAS_ID, {
        sourcePodId: "pod-src",
        sourceAnchor: "right",
        targetPodId: "pod-dst",
        targetAnchor: "left",
      });

      // Claude 的 defaultOptions.model = "opus"（見 claudeProvider.ts）
      expect(conn.summaryModel).toBe("opus");
    });

    it("上游 Pod 為 Codex，未帶 summaryModel → summaryModel 為 Codex 預設（gpt-5.4）", () => {
      insertPod("pod-src", "codex");

      const conn = connectionStore.create(CANVAS_ID, {
        sourcePodId: "pod-src",
        sourceAnchor: "right",
        targetPodId: "pod-dst",
        targetAnchor: "left",
      });

      // Codex 的 defaultOptions.model = "gpt-5.4"（見 codexProvider.ts）
      expect(conn.summaryModel).toBe("gpt-5.4");
    });

    it("上游 Pod 為 Claude，帶入 Codex 模型 → fallback 到 Claude 預設", () => {
      insertPod("pod-src", "claude");

      const conn = connectionStore.create(CANVAS_ID, {
        sourcePodId: "pod-src",
        sourceAnchor: "right",
        targetPodId: "pod-dst",
        targetAnchor: "left",
        summaryModel: "gpt-5.4", // Codex 模型，不在 Claude 合法清單
      });

      // fallback → Claude 預設
      expect(conn.summaryModel).toBe("opus");
    });

    it("上游 Pod 為 Codex，帶入 Claude 模型 → fallback 到 Codex 預設", () => {
      insertPod("pod-src", "codex");

      const conn = connectionStore.create(CANVAS_ID, {
        sourcePodId: "pod-src",
        sourceAnchor: "right",
        targetPodId: "pod-dst",
        targetAnchor: "left",
        summaryModel: "sonnet", // Claude 模型，不在 Codex 合法清單
      });

      // fallback → Codex 預設
      expect(conn.summaryModel).toBe("gpt-5.4");
    });

    it("上游 Pod 找不到（DB 中無該 pod）→ fallback 到 claude 預設（opus）", () => {
      // 不插入 pod，模擬找不到情況
      const conn = connectionStore.create(CANVAS_ID, {
        sourcePodId: "pod-not-exist",
        sourceAnchor: "right",
        targetPodId: "pod-dst",
        targetAnchor: "left",
      });

      // provider fallback 到 "claude"，summaryModel 為 claude 預設
      expect(conn.summaryModel).toBe("opus");
    });
  });

  // ----------------------------------------------------------------
  // update 路徑
  // ----------------------------------------------------------------
  describe("update — summaryModel 驗證", () => {
    /** 先 create 一條 connection（上游 Claude），再 update summaryModel */
    function createBaseConnection(provider: "claude" | "codex" = "claude") {
      insertPod("pod-src", provider);
      return connectionStore.create(CANVAS_ID, {
        sourcePodId: "pod-src",
        sourceAnchor: "right",
        targetPodId: "pod-dst",
        targetAnchor: "left",
      });
    }

    it("update 帶入合法 Claude 模型 → summaryModel 更新為新值", () => {
      const base = createBaseConnection("claude");

      const updated = connectionStore.update(CANVAS_ID, base.id, {
        summaryModel: "sonnet",
      });

      expect(updated?.summaryModel).toBe("sonnet");
    });

    it("update 帶入不合法模型（Codex 模型給 Claude）→ fallback 到 Claude 預設", () => {
      const base = createBaseConnection("claude");

      const updated = connectionStore.update(CANVAS_ID, base.id, {
        summaryModel: "gpt-5.4", // Codex 模型，不合法
      });

      expect(updated?.summaryModel).toBe("opus");
    });

    it("update 帶入合法 Codex 模型（上游為 Codex）→ summaryModel 更新為新值", () => {
      const base = createBaseConnection("codex");

      const updated = connectionStore.update(CANVAS_ID, base.id, {
        summaryModel: "gpt-5.5",
      });

      expect(updated?.summaryModel).toBe("gpt-5.5");
    });

    it("update 帶入不合法模型（Claude 模型給 Codex）→ fallback 到 Codex 預設", () => {
      const base = createBaseConnection("codex");

      const updated = connectionStore.update(CANVAS_ID, base.id, {
        summaryModel: "sonnet", // Claude 模型，對 Codex 不合法
      });

      expect(updated?.summaryModel).toBe("gpt-5.4");
    });
  });
});
