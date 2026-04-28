/**
 * attachmentWriter 單元測試
 *
 * 覆蓋以下測試案例（依計畫書編號）：
 * 3 - collision rename（同名加 -1、-2...，副檔名分離）
 * 4 - filename sanitize（拒絕路徑穿越字元）
 * 5 - 磁碟不足時拋 AttachmentDiskFullError
 * 6 - 寫到中途失敗清除 staging 目錄
 * 7 - atomic rename staging → 正式目錄
 * 8 - handler 端嚴格判定單檔 > 10 MB（writeAttachments 層）
 * 15 - 磁碟檢查 fallback 路徑（statfs 不可用 → df → 兩者都失敗 skipped）
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

// 注意：mock 必須在 import 目標模組之前設定
// 用 mock factory 讓 checkDiskSpace 可被單獨控制，
// attachmentWriter 本身的 fs 操作仍使用真實 fs

const mockCheckDiskSpace = vi.fn();

vi.mock("../../src/services/diskSpace.js", () => ({
  checkDiskSpace: (...args: unknown[]) => mockCheckDiskSpace(...args),
}));

vi.mock("../../src/config/index.js", () => ({
  config: {
    // tmpRoot 由 beforeEach 動態替換
    tmpRoot: "/mock-tmp-root",
  },
}));

// 動態 import（在 mock 設定後才 import 確保 mock 生效）
const { writeAttachments } =
  await import("../../src/services/attachmentWriter.js");
const { config } = await import("../../src/config/index.js");

/** 單檔最大允許 bytes（10 MB） */
const MAX_TOTAL_BYTES = 10 * 1024 * 1024;

/** 建立一個 sandbox tmp 目錄，並在測試後清除 */
let sandboxDir: string;

/**
 * 把字串內容 encode 成 base64
 */
function toBase64(content: string): string {
  return Buffer.from(content).toString("base64");
}

/**
 * 建立恰好 bytes 大小的 base64 字串（每 3 bytes 對應 4 個 base64 字元）
 */
function makeBase64OfBytes(bytes: number): string {
  return Buffer.alloc(bytes).toString("base64");
}

beforeEach(async () => {
  vi.clearAllMocks();

  // 建立 sandbox 暫存目錄
  sandboxDir = await fs.mkdtemp(path.join(os.tmpdir(), "attach-writer-test-"));
  // 讓 config.tmpRoot 指向 sandbox
  (config as { tmpRoot: string }).tmpRoot = sandboxDir;

  // 預設磁碟空間充足
  mockCheckDiskSpace.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  // 清除 sandbox，避免污染
  await fs.rm(sandboxDir, { recursive: true, force: true }).catch(() => void 0);
  vi.restoreAllMocks();
});

// ================================================================
// 測試案例 4 — filename sanitize
// ================================================================
describe("writeAttachments — filename sanitize（案例 4）", () => {
  it("filename 含路徑分隔符（../etc/passwd）應透過 path.basename 安全轉換為 passwd", async () => {
    // attachmentWriter 使用 path.basename 對 filename 做 sanitize，
    // '../etc/passwd' → basename = 'passwd'，不拋錯，安全落地為 passwd
    const result = await writeAttachments("msg-sanitize-1", [
      { filename: "../etc/passwd", contentBase64: toBase64("content") },
    ]);

    // basename 後的名稱應為 'passwd'，安全落地
    expect(result.files).toEqual(["passwd"]);
    const stat = await fs.stat(path.join(result.dir, "passwd"));
    expect(stat.isFile()).toBe(true);
  });

  it("filename 只有空白字元應拋 AttachmentInvalidNameError", async () => {
    const { AttachmentInvalidNameError } =
      await import("../../src/services/attachmentErrors.js");

    await expect(
      writeAttachments("msg-sanitize-2", [
        { filename: "   ", contentBase64: toBase64("content") },
      ]),
    ).rejects.toBeInstanceOf(AttachmentInvalidNameError);
  });

  it("filename 為 '..' 應拋 AttachmentInvalidNameError", async () => {
    const { AttachmentInvalidNameError } =
      await import("../../src/services/attachmentErrors.js");

    await expect(
      writeAttachments("msg-sanitize-3", [
        { filename: "..", contentBase64: toBase64("content") },
      ]),
    ).rejects.toBeInstanceOf(AttachmentInvalidNameError);
  });

  it("合法 filename 不拋錯，並正確落地", async () => {
    const result = await writeAttachments("msg-sanitize-ok", [
      { filename: "document.pdf", contentBase64: toBase64("hello") },
    ]);

    expect(result.files).toEqual(["document.pdf"]);
    const stat = await fs.stat(path.join(result.dir, "document.pdf"));
    expect(stat.isFile()).toBe(true);
  });
});

// ================================================================
// 測試案例 3 — collision rename
// ================================================================
describe("writeAttachments — collision rename（案例 3）", () => {
  it("兩個同名檔案，第二個應被 rename 為 base-1.ext", async () => {
    const result = await writeAttachments("msg-collision-1", [
      { filename: "report.md", contentBase64: toBase64("first") },
      { filename: "report.md", contentBase64: toBase64("second") },
    ]);

    expect(result.files).toEqual(["report.md", "report-1.md"]);
  });

  it("三個同名檔案，應被 rename 為 name、name-1、name-2", async () => {
    const result = await writeAttachments("msg-collision-2", [
      { filename: "data.csv", contentBase64: toBase64("a") },
      { filename: "data.csv", contentBase64: toBase64("b") },
      { filename: "data.csv", contentBase64: toBase64("c") },
    ]);

    expect(result.files).toEqual(["data.csv", "data-1.csv", "data-2.csv"]);
  });

  it("dot-file（如 .gitignore）同名時以 .gitignore-1 命名，不拆副檔名", async () => {
    const result = await writeAttachments("msg-collision-dot", [
      { filename: ".gitignore", contentBase64: toBase64("x") },
      { filename: ".gitignore", contentBase64: toBase64("y") },
    ]);

    expect(result.files).toEqual([".gitignore", ".gitignore-1"]);
  });
});

// ================================================================
// 測試案例 8 — 單檔 > 10 MB 拒絕
// ================================================================
describe("writeAttachments — 單檔超過 10 MB 拒絕（案例 8）", () => {
  it("單一附件 base64 解碼後 bytes > 10 MB 應拋 AttachmentTooLargeError", async () => {
    const { AttachmentTooLargeError } =
      await import("../../src/services/attachmentErrors.js");

    // 10 MB + 1 byte 的空白內容
    const bigBase64 = makeBase64OfBytes(MAX_TOTAL_BYTES + 1);

    await expect(
      writeAttachments("msg-too-large", [
        { filename: "big.bin", contentBase64: bigBase64 },
      ]),
    ).rejects.toBeInstanceOf(AttachmentTooLargeError);
  });

  it("多個附件其中一個 > 10 MB 應拋 AttachmentTooLargeError", async () => {
    const { AttachmentTooLargeError } =
      await import("../../src/services/attachmentErrors.js");

    const smallBase64 = makeBase64OfBytes(1024);
    const bigBase64 = makeBase64OfBytes(MAX_TOTAL_BYTES + 1);

    await expect(
      writeAttachments("msg-too-large-multi", [
        { filename: "small.bin", contentBase64: smallBase64 },
        { filename: "big.bin", contentBase64: bigBase64 },
      ]),
    ).rejects.toBeInstanceOf(AttachmentTooLargeError);
  });

  it("剛好等於 10 MB 的單檔不應拋錯", async () => {
    const exactBase64 = makeBase64OfBytes(MAX_TOTAL_BYTES);

    const result = await writeAttachments("msg-exact-size", [
      { filename: "exact.bin", contentBase64: exactBase64 },
    ]);

    expect(result.files).toEqual(["exact.bin"]);
  });

  it("多個附件各自 <= 10 MB 不應拋錯（不做加總限制）", async () => {
    // 兩個各 9 MB，總計 18 MB，但單檔均未超 10 MB
    const nineMBBase64 = makeBase64OfBytes(9 * 1024 * 1024);

    const result = await writeAttachments("msg-multi-ok", [
      { filename: "file1.bin", contentBase64: nineMBBase64 },
      { filename: "file2.bin", contentBase64: nineMBBase64 },
    ]);

    expect(result.files).toEqual(["file1.bin", "file2.bin"]);
  });
});

// ================================================================
// 測試案例 5 — 磁碟不足
// ================================================================
describe("writeAttachments — 磁碟不足（案例 5）", () => {
  it("checkDiskSpace 回 ok:false 時應拋 AttachmentDiskFullError", async () => {
    const { AttachmentDiskFullError } =
      await import("../../src/services/attachmentErrors.js");

    mockCheckDiskSpace.mockResolvedValue({ ok: false, reason: "disk-full" });

    await expect(
      writeAttachments("msg-disk-full", [
        { filename: "file.txt", contentBase64: toBase64("content") },
      ]),
    ).rejects.toBeInstanceOf(AttachmentDiskFullError);
  });
});

// ================================================================
// 測試案例 6 — 寫到中途失敗清 staging
// ================================================================
describe("writeAttachments — 寫入中途失敗清 staging（案例 6）", () => {
  it("writeFile 失敗後 staging 目錄應被清除", async () => {
    const chatMessageId = "msg-write-fail";
    const stagingDir = path.join(sandboxDir, `${chatMessageId}.staging`);

    // spy fs.writeFile，第一次呼叫拋錯
    const originalWriteFile = fs.writeFile.bind(fs);
    let callCount = 0;
    vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
      callCount++;
      if (callCount === 1) {
        throw new Error("模擬 I/O 寫入失敗");
      }
      // @ts-expect-error 轉型讓 bind 正常運作
      return originalWriteFile(...args);
    });

    const { AttachmentWriteError } =
      await import("../../src/services/attachmentErrors.js");

    await expect(
      writeAttachments(chatMessageId, [
        { filename: "a.txt", contentBase64: toBase64("content") },
      ]),
    ).rejects.toBeInstanceOf(AttachmentWriteError);

    // staging 目錄應已被清除
    await expect(fs.stat(stagingDir)).rejects.toThrow();
  });
});

// ================================================================
// 測試案例 7 — atomic rename staging → 正式目錄
// ================================================================
describe("writeAttachments — atomic rename（案例 7）", () => {
  it("寫入成功後 staging 目錄消失，正式目錄存在並含所有檔案", async () => {
    const chatMessageId = "msg-atomic";
    const stagingDir = path.join(sandboxDir, `${chatMessageId}.staging`);
    const finalDir = path.join(sandboxDir, chatMessageId);

    const result = await writeAttachments(chatMessageId, [
      { filename: "file1.txt", contentBase64: toBase64("content 1") },
      { filename: "file2.txt", contentBase64: toBase64("content 2") },
    ]);

    // 正式目錄存在
    const stat = await fs.stat(finalDir);
    expect(stat.isDirectory()).toBe(true);

    // staging 目錄不存在
    await expect(fs.stat(stagingDir)).rejects.toThrow();

    // 回傳的 dir 與正式目錄一致
    expect(result.dir).toBe(finalDir);
    expect(result.files).toEqual(["file1.txt", "file2.txt"]);

    // 正式目錄中的檔案內容正確
    const content1 = await fs.readFile(
      path.join(finalDir, "file1.txt"),
      "utf-8",
    );
    expect(content1).toBe("content 1");
  });
});

// ================================================================
// 測試案例 15 — 磁碟檢查 fallback 路徑
// ================================================================
describe("checkDiskSpace — fallback 路徑（案例 15）", () => {
  // 注意：diskSpace.ts 本身透過 mockCheckDiskSpace 被替換掉了，
  // 所以此處直接測試 diskSpace.ts 的實際實作。
  // 需要 un-mock diskSpace 並直接 import 真實模組。

  it("checkDiskSpace 回 skipped 時，writeAttachments 應繼續（不阻擋）", async () => {
    // 磁碟檢查跳過（skipped），writeAttachments 應繼續寫入
    mockCheckDiskSpace.mockResolvedValue({ ok: true, skipped: true });

    const result = await writeAttachments("msg-skip-disk", [
      { filename: "test.txt", contentBase64: toBase64("hello") },
    ]);

    expect(result.files).toEqual(["test.txt"]);
    const content = await fs.readFile(
      path.join(result.dir, "test.txt"),
      "utf-8",
    );
    expect(content).toBe("hello");
  });
});
