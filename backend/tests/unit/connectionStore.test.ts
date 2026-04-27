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
 */

vi.mock("../../src/services/podStore.js", () => ({
  podStore: {
    getById: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectionStore } from "../../src/services/connectionStore.js";
import { podStore } from "../../src/services/podStore.js";
import { initTestDb, closeDb } from "../../src/database/index.js";
import { resetStatements } from "../../src/database/statements.js";

const CANVAS_ID = "test-canvas-model";

/** 建立 mock Pod（只含 connectionStore.create 需要的 provider 欄位） */
function makePod(provider: string) {
  return { id: "pod-src", provider };
}

describe("connectionStore — summaryModel 驗證邏輯", () => {
  beforeEach(() => {
    resetStatements();
    const db = initTestDb();
    db.exec(
      `INSERT INTO canvases (id, name, sort_index) VALUES ('${CANVAS_ID}', 'test canvas', 0)`,
    );
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
      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("claude"),
      );

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
      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("codex"),
      );

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
      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("claude"),
      );

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
      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("codex"),
      );

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

    it("上游 Pod 找不到（podStore.getById 回 undefined）→ fallback 到 claude 預設（opus）", () => {
      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(undefined);

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
    function createBaseConnection() {
      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("claude"),
      );
      return connectionStore.create(CANVAS_ID, {
        sourcePodId: "pod-src",
        sourceAnchor: "right",
        targetPodId: "pod-dst",
        targetAnchor: "left",
      });
    }

    it("update 帶入合法 Claude 模型 → summaryModel 更新為新值", () => {
      const base = createBaseConnection();

      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("claude"),
      );

      const updated = connectionStore.update(CANVAS_ID, base.id, {
        summaryModel: "sonnet",
      });

      expect(updated?.summaryModel).toBe("sonnet");
    });

    it("update 帶入不合法模型（Codex 模型給 Claude）→ fallback 到 Claude 預設", () => {
      const base = createBaseConnection();

      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("claude"),
      );

      const updated = connectionStore.update(CANVAS_ID, base.id, {
        summaryModel: "gpt-5.4", // Codex 模型，不合法
      });

      expect(updated?.summaryModel).toBe("opus");
    });

    it("update 帶入合法 Codex 模型（上游為 Codex）→ summaryModel 更新為新值", () => {
      // 先建立一條 Codex 上游的 connection
      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("codex"),
      );
      const base = connectionStore.create(CANVAS_ID, {
        sourcePodId: "pod-src",
        sourceAnchor: "right",
        targetPodId: "pod-dst",
        targetAnchor: "left",
      });

      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("codex"),
      );

      const updated = connectionStore.update(CANVAS_ID, base.id, {
        summaryModel: "gpt-5.5",
      });

      expect(updated?.summaryModel).toBe("gpt-5.5");
    });

    it("update 帶入不合法模型（Claude 模型給 Codex）→ fallback 到 Codex 預設", () => {
      // 先建立 Codex 上游 connection
      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("codex"),
      );
      const base = connectionStore.create(CANVAS_ID, {
        sourcePodId: "pod-src",
        sourceAnchor: "right",
        targetPodId: "pod-dst",
        targetAnchor: "left",
      });

      (podStore.getById as ReturnType<typeof vi.fn>).mockReturnValue(
        makePod("codex"),
      );

      const updated = connectionStore.update(CANVAS_ID, base.id, {
        summaryModel: "sonnet", // Claude 模型，對 Codex 不合法
      });

      expect(updated?.summaryModel).toBe("gpt-5.4");
    });
  });
});
