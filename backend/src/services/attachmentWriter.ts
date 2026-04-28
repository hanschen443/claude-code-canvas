/**
 * attachmentWriter — 附件寫檔模組。
 *
 * 先寫到 staging 目錄再 rename 為正式目錄，確保對外部觀察者的原子性：
 * 在 rename 完成前任何失敗都不會留下不完整的正式目錄。
 * 任一步驟失敗 → 清除 staging 後 rethrow 對應 Error class。
 */

import fs from "fs/promises";
import path from "path";
import { config } from "../config/index.js";
import type { Attachment } from "../schemas/chatSchemas.js";
import {
  AttachmentDiskFullError,
  AttachmentEmptyError,
  AttachmentInvalidNameError,
  AttachmentTooLargeError,
  AttachmentWriteError,
} from "./attachmentErrors.js";
import { checkDiskSpace } from "./diskSpace.js";

/** 10 MB（base64 解碼後 bytes，單檔上限） */
const MAX_SINGLE_BYTES = 10 * 1024 * 1024;

export interface WriteAttachmentsResult {
  /** 最終落地目錄絕對路徑（<tmpRoot>/<chatMessageId>/） */
  dir: string;
  /** 最終 filename 清單，依輸入順序 */
  files: string[];
}

/**
 * 將名稱拆成 `{ base, ext }` 以便 collision rename。
 * 例：`plan.md` → `{ base: "plan", ext: ".md" }`
 *     `a`       → `{ base: "a", ext: "" }`
 *     `.gitignore` → `{ base: ".gitignore", ext: "" }`（dot-file 不拆）
 */
function splitNameParts(filename: string): { base: string; ext: string } {
  const ext = path.extname(filename);
  // dot-file（如 .gitignore）：ext 會等於整個 filename，視為無副檔名
  if (ext === filename) {
    return { base: filename, ext: "" };
  }
  const base = ext ? filename.slice(0, -ext.length) : filename;
  return { base, ext };
}

/** collision rename 的最大嘗試次數（理論上不應達到）*/
const MAX_RENAME_COUNTER = 9999;

/**
 * 解析 collision rename 後的最終 filename。
 * 若 `name` 已在 `usedSet` 中，則嘗試 `base-1.ext`、`base-2.ext`...，直到找到空位。
 * 超過 MAX_RENAME_COUNTER 次仍無空位時拋出 AttachmentWriteError，確保不會無窮迴圈。
 */
function resolveUniqueFilename(name: string, usedSet: Set<string>): string {
  if (!usedSet.has(name)) {
    return name;
  }
  const { base, ext } = splitNameParts(name);
  for (let counter = 1; counter <= MAX_RENAME_COUNTER; counter++) {
    const candidate = `${base}-${counter}${ext}`;
    if (!usedSet.has(candidate)) {
      return candidate;
    }
  }
  throw new AttachmentWriteError(
    new Error(`無法在 ${MAX_RENAME_COUNTER} 次嘗試內找到唯一檔名：${name}`),
  );
}

/**
 * 對每個附件執行 filename sanitize（步驟 2），回傳 sanitize 後的名稱陣列。
 * 若任一名稱不合法則拋出 AttachmentInvalidNameError，中斷後續流程。
 *
 * 結果陣列直接供步驟 5（collision rename）使用，避免重複呼叫 path.basename().trim()。
 */
function resolveSanitizedFilenames(attachments: Attachment[]): string[] {
  return attachments.map((attachment) => {
    const sanitized = path.basename(attachment.filename).trim();
    if (sanitized === "" || sanitized === ".." || sanitized === ".") {
      throw new AttachmentInvalidNameError(attachment.filename);
    }
    return sanitized;
  });
}

/**
 * 對 sanitized 名稱陣列執行 collision rename（步驟 5）。
 * 使用 usedSet 追蹤已佔用名稱，同名時加 -1、-2...，副檔名保留。
 * 回傳最終唯一 filename 陣列，順序與輸入一致。
 */
function resolveUniqueFilenames(sanitized: string[]): string[] {
  const usedSet = new Set<string>();
  const finalFilenames: string[] = [];
  for (const name of sanitized) {
    const unique = resolveUniqueFilename(name, usedSet);
    usedSet.add(unique);
    finalFilenames.push(unique);
  }
  return finalFilenames;
}

/**
 * 寫入附件到 `<tmpRoot>/<chatMessageId>/`，使用 staging → rename atomic 模式。
 */
export async function writeAttachments(
  chatMessageId: string,
  attachments: Attachment[],
): Promise<WriteAttachmentsResult> {
  // defense-in-depth：防止路徑穿越攻擊，後端其他層也有驗證，此為第一道防線
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      chatMessageId,
    )
  ) {
    throw new AttachmentWriteError(
      new Error(`無效的 chatMessageId 格式：${chatMessageId}`),
    );
  }

  if (attachments.length === 0) {
    throw new AttachmentEmptyError();
  }

  const sanitizedNames = resolveSanitizedFilenames(attachments);

  const buffers: Buffer[] = [];
  let totalBytes = 0;
  for (const attachment of attachments) {
    const buf = Buffer.from(attachment.contentBase64, "base64");
    if (buf.length > MAX_SINGLE_BYTES) {
      throw new AttachmentTooLargeError();
    }
    buffers.push(buf);
    totalBytes += buf.length;
  }

  const diskResult = await checkDiskSpace(config.tmpRoot, totalBytes);
  if (!diskResult.ok) {
    throw new AttachmentDiskFullError();
  }
  // ok 或 skipped 都繼續，skipped 代表磁碟空間檢查不支援，不應因此阻擋寫入

  const finalFilenames = resolveUniqueFilenames(sanitizedNames);

  const stagingDir = path.join(config.tmpRoot, `${chatMessageId}.staging`);
  const finalDir = path.join(config.tmpRoot, chatMessageId);

  // 邊界檢查：確保 stagingDir 仍在 tmpRoot 之內（path traversal 防禦）
  if (
    !path
      .resolve(stagingDir)
      .startsWith(path.resolve(config.tmpRoot) + path.sep)
  ) {
    throw new AttachmentWriteError(
      new Error(`stagingDir 超出 tmpRoot 邊界：${stagingDir}`),
    );
  }

  try {
    await fs.mkdir(stagingDir, { recursive: true });
  } catch (err) {
    throw new AttachmentWriteError(err instanceof Error ? err : undefined);
  }

  try {
    for (let i = 0; i < attachments.length; i++) {
      const destPath = path.join(stagingDir, finalFilenames[i]);
      await fs.writeFile(destPath, buffers[i]);
    }

    // atomic rename：staging → 正式目錄，對外部觀察者只會看到完整目錄或不存在，不會有中間狀態
    await fs.rename(stagingDir, finalDir);
  } catch (err) {
    // 任一步驟失敗 → 清除 staging，避免殘留不完整目錄佔用空間
    await fs
      .rm(stagingDir, { recursive: true, force: true })
      .catch(() => void 0);
    throw new AttachmentWriteError(err instanceof Error ? err : undefined);
  }

  return {
    dir: finalDir,
    files: finalFilenames,
  };
}
