/**
 * 磁碟空間檢查 helper。
 *
 * 注意：fallback df -k 只支援 macOS / Linux，Windows runtime 不在範圍。
 */

import { execFile } from "child_process";
import fs from "fs/promises";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** 安全邊界：100 MB */
const SAFETY_MARGIN_BYTES = 100 * 1024 * 1024;

export type DiskSpaceResult =
  | { ok: true; skipped?: false }
  | { ok: false; reason: "disk-full" }
  | { ok: true; skipped: true };

/**
 * 檢查 targetDir 是否有足夠空間存放 requiredBytes 的資料（含 100 MB 安全邊界）。
 *
 * 主路徑：fs.statfs（Bun 原生支援）
 * Fallback：df -k（macOS / Linux）
 * 兩條路徑都失敗：log warn 後回傳 skipped（不阻擋寫入）
 */
export async function checkDiskSpace(
  targetDir: string,
  requiredBytes: number,
): Promise<DiskSpaceResult> {
  const needed = requiredBytes + SAFETY_MARGIN_BYTES;

  // --- 主路徑：fs.statfs ---
  if (typeof (fs as unknown as Record<string, unknown>).statfs === "function") {
    try {
      const stat = await (
        fs as unknown as {
          statfs(
            path: string,
          ): Promise<{ bavail: bigint | number; bsize: bigint | number }>;
        }
      ).statfs(targetDir);

      const bavail = Number(stat.bavail);
      const bsize = Number(stat.bsize);
      const freeBytes = bavail * bsize;

      if (freeBytes < needed) {
        return { ok: false, reason: "disk-full" };
      }
      return { ok: true };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      // ENOSYS 或 TypeError 才走 fallback，其他錯誤也走 fallback
      if (code !== "ENOSYS" && !(err instanceof TypeError)) {
        // 非預期錯誤，仍嘗試 fallback
      }
    }
  }

  // --- Fallback：df -k ---
  try {
    const { stdout } = await execFileAsync("df", ["-k", targetDir]);
    // df 輸出第二行，欄位以空白分隔，第 4 欄為 Available（KB）
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) {
      throw new Error("df 輸出格式不符預期");
    }
    const cols = lines[1].trim().split(/\s+/);
    // cols[3] = Available (KB)
    const availableKb = parseInt(cols[3], 10);
    if (isNaN(availableKb)) {
      throw new Error(`df 第 4 欄無法解析為數字：${cols[3]}`);
    }
    const freeBytes = availableKb * 1024;

    if (freeBytes < needed) {
      return { ok: false, reason: "disk-full" };
    }
    return { ok: true };
  } catch {
    // 兩條路徑都失敗，跳過檢查，不阻擋寫入
    console.warn("磁碟空間檢查失敗，跳過檢查");
    return { ok: true, skipped: true };
  }
}
