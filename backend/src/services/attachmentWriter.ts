/**
 * attachmentWriter — 附件寫檔模組。
 *
 * 流程：
 * 1. 空陣列防線
 * 2. filename sanitize
 * 3. base64 解碼後 bytes 逐檔檢查，單檔超過 10 MB 拒絕
 * 4. 磁碟空間檢查
 * 5. collision rename（同名加 -1、-2...，副檔名分離）
 * 6. 建 staging 目錄，逐檔寫入
 * 7. atomic rename staging → 正式目錄
 * 任一步驟失敗 → 清除 staging 後 rethrow 對應 Error class
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

/**
 * 解析 collision rename 後的最終 filename。
 * 若 `name` 已在 `usedSet` 中，則嘗試 `base-1.ext`、`base-2.ext`...，直到找到空位。
 */
function resolveUniqueFilename(name: string, usedSet: Set<string>): string {
  if (!usedSet.has(name)) {
    return name;
  }
  const { base, ext } = splitNameParts(name);
  let counter = 1;
  while (true) {
    const candidate = `${base}-${counter}${ext}`;
    if (!usedSet.has(candidate)) {
      return candidate;
    }
    counter++;
  }
}

/**
 * 寫入附件到 `<tmpRoot>/<chatMessageId>/`，使用 staging → rename atomic 模式。
 */
export async function writeAttachments(
  chatMessageId: string,
  attachments: Attachment[],
): Promise<WriteAttachmentsResult> {
  // 1. 空陣列防線
  if (attachments.length === 0) {
    throw new AttachmentEmptyError();
  }

  // 2. filename sanitize
  for (const attachment of attachments) {
    const sanitized = path.basename(attachment.filename).trim();
    if (sanitized === "" || sanitized === ".." || sanitized === ".") {
      throw new AttachmentInvalidNameError(attachment.filename);
    }
  }

  // 3. 逐檔解碼，單檔超過 10 MB 拒絕
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

  // 4. 磁碟空間檢查
  const diskResult = await checkDiskSpace(config.tmpRoot, totalBytes);
  if (!diskResult.ok) {
    throw new AttachmentDiskFullError();
  }
  // ok 或 skipped 都繼續

  // 5. collision rename
  const usedSet = new Set<string>();
  const finalFilenames: string[] = [];
  for (const attachment of attachments) {
    const sanitized = path.basename(attachment.filename).trim();
    const unique = resolveUniqueFilename(sanitized, usedSet);
    usedSet.add(unique);
    finalFilenames.push(unique);
  }

  // 6. 建 staging 目錄
  const stagingDir = path.join(config.tmpRoot, `${chatMessageId}.staging`);
  const finalDir = path.join(config.tmpRoot, chatMessageId);

  try {
    await fs.mkdir(stagingDir, { recursive: true });
  } catch (err) {
    throw new AttachmentWriteError(err instanceof Error ? err : undefined);
  }

  // 7. 逐檔寫入 staging
  try {
    for (let i = 0; i < attachments.length; i++) {
      const destPath = path.join(stagingDir, finalFilenames[i]);
      await fs.writeFile(destPath, buffers[i]);
    }

    // 8. atomic rename staging → 正式目錄
    await fs.rename(stagingDir, finalDir);
  } catch (err) {
    // 任一步驟失敗 → 清除 staging
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
