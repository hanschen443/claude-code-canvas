/**
 * chatSendSchema / attachmentSchema 單元測試
 *
 * 覆蓋以下測試案例（依計畫書編號）：
 * 1 - attachmentSchema 合法輸入、拒絕空 filename、拒絕 ../、拒絕純空白 filename、拒絕非 base64
 * 2 - chatSendSchema superRefine：單檔 base64 解碼後 bytes > 10 MB 時 schema 失敗
 */

import { describe, expect, it } from "vitest";
import {
  attachmentSchema,
  chatSendSchema,
} from "../../src/schemas/chatSchemas.js";

/** 簡單建立 base64 字串 */
function toBase64(content: string): string {
  return Buffer.from(content).toString("base64");
}

/** 建立恰好 bytes 大小的 base64 字串 */
function makeBase64OfBytes(bytes: number): string {
  return Buffer.alloc(bytes).toString("base64");
}

/** 10 MB（單檔上限） */
const MAX_BYTES = 10 * 1024 * 1024;

/** 合法的 UUID，用於滿足 schema UUID 格式驗證 */
const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// ================================================================
// 測試案例 1 — attachmentSchema
// ================================================================
describe("attachmentSchema（案例 1）", () => {
  it("合法 filename + base64 應通過驗證", () => {
    const result = attachmentSchema.safeParse({
      filename: "document.pdf",
      contentBase64: toBase64("hello world"),
    });
    expect(result.success).toBe(true);
  });

  it("空字串 filename 應被拒絕", () => {
    const result = attachmentSchema.safeParse({
      filename: "",
      contentBase64: toBase64("hello"),
    });
    expect(result.success).toBe(false);
  });

  it("純空白 filename 應被拒絕（trim 後為空）", () => {
    const result = attachmentSchema.safeParse({
      filename: "   ",
      contentBase64: toBase64("hello"),
    });
    expect(result.success).toBe(false);
  });

  it("filename 含 '../' 路徑穿越字元應被拒絕", () => {
    const result = attachmentSchema.safeParse({
      filename: "../etc/passwd",
      contentBase64: toBase64("hello"),
    });
    expect(result.success).toBe(false);
  });

  it("filename 含斜線（含子路徑）應被拒絕", () => {
    const result = attachmentSchema.safeParse({
      filename: "subdir/file.txt",
      contentBase64: toBase64("hello"),
    });
    expect(result.success).toBe(false);
  });

  it("非 base64 字元的 contentBase64 應被拒絕", () => {
    const result = attachmentSchema.safeParse({
      filename: "file.txt",
      contentBase64: "not-valid-base64!@#$%",
    });
    expect(result.success).toBe(false);
  });

  it("合法的 base64（帶 padding）應通過驗證", () => {
    // 標準 base64 with padding
    const validBase64 = "SGVsbG8gV29ybGQ=";
    const result = attachmentSchema.safeParse({
      filename: "hello.txt",
      contentBase64: validBase64,
    });
    expect(result.success).toBe(true);
  });

  it("空 base64 字串（空檔案）應通過驗證（schema 允許空 base64）", () => {
    // schema 只要求 base64 格式合法，空字串是合法的空白 base64
    const result = attachmentSchema.safeParse({
      filename: "empty.txt",
      contentBase64: "",
    });
    expect(result.success).toBe(true);
  });
});

// ================================================================
// 測試案例 2 — chatSendSchema 單檔 bytes > 10 MB 時 schema fail
// ================================================================
describe("chatSendSchema — 單檔超過 10 MB（案例 2）", () => {
  /** 最基本合法的 chatSendSchema payload 骨架 */
  function makePayload(
    attachments?: { filename: string; contentBase64: string }[],
  ) {
    return {
      requestId: VALID_UUID,
      canvasId: VALID_UUID,
      podId: VALID_UUID,
      message: "測試訊息",
      ...(attachments !== undefined ? { attachments } : {}),
    };
  }

  it("單一附件解碼後 > 10 MB 時 schema 應失敗", () => {
    // 10 MB + 1 byte 的 base64
    const bigBase64 = makeBase64OfBytes(MAX_BYTES + 1);

    const result = chatSendSchema.safeParse(
      makePayload([{ filename: "big.bin", contentBase64: bigBase64 }]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message).join(" ");
      expect(messages).toContain("10 MB");
    }
  });

  it("多個附件各自 <= 10 MB 時 schema 應通過（不做加總限制）", () => {
    // 兩個各 9 MB 的附件，總計 18 MB，但單檔均未超 10 MB
    const nineМBBase64 = makeBase64OfBytes(9 * 1024 * 1024);

    const result = chatSendSchema.safeParse(
      makePayload([
        { filename: "part1.bin", contentBase64: nineМBBase64 },
        { filename: "part2.bin", contentBase64: nineМBBase64 },
      ]),
    );

    expect(result.success).toBe(true);
  });

  it("多個附件其中一個 > 10 MB 時 schema 應失敗，issue path 指向該附件 index", () => {
    // 第二個附件超過 10 MB
    const smallBase64 = makeBase64OfBytes(1024);
    const bigBase64 = makeBase64OfBytes(MAX_BYTES + 1);

    const result = chatSendSchema.safeParse(
      makePayload([
        { filename: "small.bin", contentBase64: smallBase64 },
        { filename: "big.bin", contentBase64: bigBase64 },
      ]),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      // issue path 應指向 ['attachments', 1, 'contentBase64']
      const paths = result.error.issues.map((i) => i.path);
      expect(paths).toContainEqual(["attachments", 1, "contentBase64"]);
    }
  });

  it("附件解碼後恰好等於 10 MB 時 schema 應通過", () => {
    // 剛好 10 MB
    const exactBase64 = makeBase64OfBytes(MAX_BYTES);

    const result = chatSendSchema.safeParse(
      makePayload([{ filename: "exact.bin", contentBase64: exactBase64 }]),
    );

    expect(result.success).toBe(true);
  });

  it("無 attachments 時 schema 應正常通過", () => {
    const result = chatSendSchema.safeParse(makePayload());
    expect(result.success).toBe(true);
  });

  it("attachments 空陣列時 schema 應失敗（min(1) 限制）", () => {
    const result = chatSendSchema.safeParse(makePayload([]));
    expect(result.success).toBe(false);
  });

  it("超過 50 個附件時 schema 應失敗（max(50) 限制）", () => {
    const attachments = Array.from({ length: 51 }, (_, i) => ({
      filename: `file${i}.txt`,
      contentBase64: toBase64("x"),
    }));

    const result = chatSendSchema.safeParse(makePayload(attachments));
    expect(result.success).toBe(false);
  });
});
