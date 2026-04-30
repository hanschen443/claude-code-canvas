/**
 * provider 共用工具函式。
 * 目前 geminiProvider 與 codexProvider 均需要，統一放此處避免重複實作。
 */

/**
 * 判斷 err 是否為 ENOENT（CLI 尚未安裝或不在 PATH 中）。
 * 供各 provider 的 setupSubprocess catch 共用，消除重複的 duck-typing 程式碼。
 */
export function isEnoentError(err: unknown): boolean {
  return (
    err instanceof Error &&
    ("code" in err
      ? (err as NodeJS.ErrnoException).code === "ENOENT"
      : err.message.includes("ENOENT"))
  );
}
