/**
 * CodexProvider
 *
 * 透過 `codex exec` subprocess 執行 OpenAI Codex CLI，
 * 將其 JSON line 輸出轉換為 NormalizedEvent 串流。
 *
 * 實作 AgentProvider 介面，支援基本聊天（chat=true）。
 *
 * CLI 指令組合：
 *   - 新對話：`codex exec - --json --yolo --skip-git-repo-check --model <model>`
 *   - 恢復對話：`codex exec resume <id> - --json --yolo`
 *   - `-` 表示從 stdin 讀取 prompt
 */

import { CODEX_CAPABILITIES } from "./capabilities.js";
import { normalize } from "./codexNormalizer.js";
import type {
  AgentProvider,
  ChatRequestContext,
  NormalizedEvent,
} from "./types.js";
import { logger } from "../../utils/logger.js";

/** Codex provider 的預設模型 */
const CODEX_DEFAULT_MODEL = "gpt-5.4";

/** 合法 resumeSessionId 格式（防止 CLI 旗標注入） */
const SESSION_ID_RE = /^[a-zA-Z0-9_-]+$/;

/** 合法 attachment MIME 類型副檔名白名單 */
const ALLOWED_IMAGE_EXTS = new Set(["jpg", "png", "gif", "webp"]);

/** 合法 base64 字元集（防止換行符造成 prompt injection） */
const BASE64_RE = /^[A-Za-z0-9+/=]+$/;

/**
 * 傳入 codex subprocess 的環境變數白名單。
 * 僅傳遞 codex 實際需要的 key，避免洩漏其他 API key、DB 連線字串等敏感資訊。
 */
const CODEX_ENV_WHITELIST = new Set([
  "PATH", // 讓 codex 找到可執行檔與依賴
  "HOME", // 讀取使用者設定檔
  "LANG", // 避免 CLI 輸出亂碼
  "LC_ALL", // locale override
  "OPENAI_API_KEY", // codex 的 API 認證
  "TERM", // 終端機類型
]);

/** 篩選環境變數，僅保留白名單與 CODEX_ 前綴的 key */
function buildCodexEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (CODEX_ENV_WHITELIST.has(key) || key.startsWith("CODEX_")) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * 將 ContentBlock[] 轉換為 codex 可接受的純文字 prompt。
 * 圖片附件以 base64 data URI 內聯（禁止使用 --image，因為 --image + --json 會 hang）。
 */
function buildPromptText(
  message: string | import("../../types/message.js").ContentBlock[],
): string {
  if (typeof message === "string") return message;

  const parts: string[] = [];

  for (const block of message) {
    if (block.type === "text") {
      parts.push(block.text);
      continue;
    }

    if (block.type === "image") {
      // 驗證 base64 格式，防止換行符等字元造成 prompt injection
      if (!BASE64_RE.test(block.base64Data)) {
        logger.warn(
          "Chat",
          "Warn",
          "[CodexProvider] 附件 base64 格式不合法，已略過",
        );
        continue;
      }

      // 驗證 MIME 類型
      const rawExt = block.mediaType
        .split("/")[1]
        ?.toLowerCase()
        .replace("jpeg", "jpg");
      if (!rawExt || !ALLOWED_IMAGE_EXTS.has(rawExt)) {
        logger.warn(
          "Chat",
          "Warn",
          `[CodexProvider] 附件 MIME 類型不在白名單內，已略過（mediaType: ${block.mediaType}）`,
        );
        continue;
      }

      parts.unshift(
        `[image: data:${block.mediaType};base64,${block.base64Data}]`,
      );
    }
  }

  return parts.join("\n");
}

export class CodexProvider implements AgentProvider {
  readonly name = "codex" as const;
  readonly capabilities = CODEX_CAPABILITIES;

  /** 正在執行中的 subprocess，以 podSessionKey 為 key */
  private readonly activeProcesses = new Map<string, Bun.Subprocess>();

  async *chat(ctx: ChatRequestContext): AsyncIterable<NormalizedEvent> {
    const {
      podId,
      message,
      workspacePath,
      resumeSessionId,
      abortSignal,
      providerConfig,
    } = ctx;

    // 從 providerConfig 取得模型，預設 CODEX_DEFAULT_MODEL
    const model =
      typeof providerConfig?.model === "string"
        ? providerConfig.model
        : CODEX_DEFAULT_MODEL;

    // ── 組合 CLI 參數 ──────────────────────────────────────────────
    const codexArgs: string[] = [];

    if (resumeSessionId) {
      if (!SESSION_ID_RE.test(resumeSessionId)) {
        // resumeSessionId 格式不合法，防止旗標注入，改走新對話
        logger.warn(
          "Chat",
          "Warn",
          `[CodexProvider] resumeSessionId 格式不合法，已略過並改為新對話：${resumeSessionId}`,
        );
        codexArgs.push(
          "exec",
          "-",
          "--json",
          "--yolo",
          "--skip-git-repo-check",
          "--model",
          model,
        );
      } else {
        // 恢復對話模式：不帶 --model（由 session 決定）
        codexArgs.push(
          "exec",
          "resume",
          resumeSessionId,
          "-",
          "--json",
          "--yolo",
        );
      }
    } else {
      // 新對話模式
      codexArgs.push(
        "exec",
        "-",
        "--json",
        "--yolo",
        "--skip-git-repo-check",
        "--model",
        model,
      );
    }

    // ── 組合 prompt 文字 ───────────────────────────────────────────
    const promptText = buildPromptText(message);

    // ── Spawn subprocess ───────────────────────────────────────────
    let proc: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;

    try {
      proc = Bun.spawn(["codex", ...codexArgs], {
        cwd: workspacePath,
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: buildCodexEnv(),
      });
    } catch (err: unknown) {
      // ENOENT：codex CLI 尚未安裝
      const isNotFound =
        err instanceof Error &&
        ("code" in err
          ? (err as NodeJS.ErrnoException).code === "ENOENT"
          : err.message.includes("ENOENT"));

      if (isNotFound) {
        yield {
          type: "error",
          message: "codex CLI 尚未安裝或不在 PATH 中，請執行 codex login",
          fatal: true,
        };
      } else {
        yield {
          type: "error",
          message: `啟動 codex 子程序失敗：${err instanceof Error ? err.message : String(err)}`,
          fatal: true,
        };
      }
      return;
    }

    // 以 podId 作為 session key 管理 subprocess
    const sessionKey = podId;
    this.activeProcesses.set(sessionKey, proc);

    // ── abort signal 處理 ──────────────────────────────────────────
    const onAbort = (): void => {
      try {
        proc?.kill();
      } catch {
        // 已結束則忽略
      }
      this.activeProcesses.delete(sessionKey);
    };

    if (abortSignal.aborted) {
      onAbort();
      return;
    }
    abortSignal.addEventListener("abort", onAbort, { once: true });

    try {
      // ── 寫入 prompt 到 stdin 後關閉 ────────────────────────────
      // Bun.Subprocess.stdin 是 FileSink，直接呼叫 write/end
      proc.stdin.write(promptText);
      await proc.stdin.end();

      // ── 逐行讀取 stdout ─────────────────────────────────────────
      let buffer = "";
      let hasTurnComplete = false;

      for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
        if (abortSignal.aborted) break;

        buffer += Buffer.from(chunk as Uint8Array).toString("utf-8");

        const lines = buffer.split("\n");
        // 最後一段可能不完整，保留在 buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const event = normalize(line);
          if (event !== null) {
            if (event.type === "turn_complete") {
              hasTurnComplete = true;
            }
            yield event;
          }
        }
      }

      // 處理 stdout 結束時剩餘的 buffer 內容
      if (buffer.trim()) {
        const event = normalize(buffer);
        if (event !== null) {
          if (event.type === "turn_complete") {
            hasTurnComplete = true;
          }
          yield event;
        }
      }

      // ── 收集 stderr（僅用於 exit code 處理時的 server log） ─────
      const stderrChunks: Buffer[] = [];
      for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
        stderrChunks.push(Buffer.from(chunk as Uint8Array));
      }
      const stderrText = Buffer.concat(stderrChunks).toString("utf-8").trim();

      // ── exit code 檢查 ──────────────────────────────────────────
      const exitCode = await proc.exited;

      if (exitCode !== 0 && !abortSignal.aborted && !hasTurnComplete) {
        logger.error(
          "Chat",
          "Error",
          `[CodexProvider] codex 子程序以非零 exit code 結束（exit code: ${exitCode}，podId: ${podId}）${stderrText ? "，stderr 詳見下行" : "，無 stderr 輸出"}`,
        );
        if (stderrText) {
          // stderr 原文只輸出到 server log，不對外廣播（避免洩漏 API key 等敏感資訊）
          console.error(stderrText);
        }
        yield {
          type: "error",
          message: `Codex 執行時發生錯誤（exit code: ${exitCode}），請查閱伺服器日誌`,
          fatal: false,
        };
      }
    } finally {
      abortSignal.removeEventListener("abort", onAbort);
      this.activeProcesses.delete(sessionKey);
    }
  }

  /**
   * 取消指定 podSessionKey 的進行中 subprocess。
   * @returns 是否成功找到並 kill subprocess
   */
  cancel(podSessionKey: string): boolean {
    const proc = this.activeProcesses.get(podSessionKey);
    if (!proc) return false;

    try {
      proc.kill();
    } catch {
      // 已結束則忽略
    }
    this.activeProcesses.delete(podSessionKey);
    return true;
  }
}

export const codexProvider = new CodexProvider();
