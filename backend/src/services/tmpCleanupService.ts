import fs from "fs/promises";
import path from "path";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

/** 6 小時的毫秒數 */
const TTL_MS = 6 * 60 * 60 * 1000;

/** 每小時執行一次清理 */
const INTERVAL_MS = 60 * 60 * 1000;

class TmpCleanupService {
  private timer: ReturnType<typeof setInterval> | null = null;

  /**
   * 啟動定期清理任務。
   * 首次立即執行一次，之後每小時執行一次。
   * timer.unref() 確保 process 可以在沒有其他活動時正常退出。
   */
  start(): void {
    // 首次不 await，讓啟動流程不受阻擋
    this.runOnce().catch((error) => {
      logger.error("Cleanup", "Error", "首次 tmp 清理失敗", error);
    });

    this.timer = setInterval(() => {
      this.runOnce().catch((error) => {
        logger.error("Cleanup", "Error", "定期 tmp 清理失敗", error);
      });
    }, INTERVAL_MS);

    // 避免 interval 阻擋 process 正常退出
    this.timer.unref();
  }

  /**
   * 停止定期清理任務（主要供測試使用）。
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 執行單次清理：掃描 tmpRoot，刪除超過 6 小時未更新的目錄。
   */
  async runOnce(): Promise<void> {
    const tmpRoot = config.tmpRoot;
    let entries: string[];

    try {
      entries = await fs.readdir(tmpRoot);
    } catch (error) {
      // tmpRoot 尚未建立（首次啟動，還沒有人上傳過附件）
      if (isEnoent(error)) {
        return;
      }
      logger.error("Cleanup", "Error", "讀取 tmp 目錄失敗", error);
      return;
    }

    const now = Date.now();
    let cleanedCount = 0;

    for (const entry of entries) {
      const entryPath = path.join(tmpRoot, entry);

      try {
        const stat = await fs.stat(entryPath);

        // 只處理目錄，且 mtime 超過 6 小時
        if (!stat.isDirectory()) {
          continue;
        }

        if (now - stat.mtimeMs < TTL_MS) {
          continue;
        }

        await fs.rm(entryPath, { recursive: true, force: true });
        cleanedCount++;
      } catch {
        // 單一目錄失敗不影響其他目錄的清理
        logger.warn("Cleanup", "Warn", `清理 tmp 目錄失敗，跳過：${entryPath}`);
      }
    }

    logger.log("Cleanup", "Complete", `清理 ${cleanedCount} 個過期 tmp 目錄`);
  }
}

/**
 * 判斷錯誤是否為 ENOENT（檔案或目錄不存在）
 */
function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export const tmpCleanupService = new TmpCleanupService();
