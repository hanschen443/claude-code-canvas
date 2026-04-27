/**
 * CodexService
 *
 * 提供一次性無狀態的 Codex 查詢能力，適用於 summary 等非 Pod 場景。
 * 不會建立 session、不會寫入 podStore。
 *
 * 內部以 Bun.spawn 啟動一次性 codex 子程序，
 * 重用 codexProvider 既有的啟動參數組合與 stdout JSON line 解析邏輯。
 */

import { normalize } from "../provider/codexNormalizer.js";
import { logger } from "../../utils/logger.js";

// ─── 公開介面 ────────────────────────────────────────────────────────────────

export interface DisposableChatOptions {
  systemPrompt: string;
  userMessage: string;
  workspacePath: string;
  model?: string;
}

export interface DisposableChatResult {
  content: string;
  success: boolean;
  error?: string;
}

// ─── 常數 ────────────────────────────────────────────────────────────────────

/**
 * 一次性查詢的 timeout 上限（毫秒）。
 * 與 claudeService.executeDisposableChat 邏輯對齊，設定合理的等待上限。
 */
const DISPOSABLE_CHAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 分鐘

/**
 * stderr 收集上限（64KB），與 codexProvider 保持一致。
 */
const STDERR_MAX_BYTES = 64 * 1024;

/**
 * 合法 model 名稱格式（防止 CLI 旗標注入）。
 * 規則與 codexProvider 保持一致。
 */
const MODEL_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * 預設模型，與 CodexProvider.metadata.defaultOptions.model 對齊。
 */
const DEFAULT_MODEL = "gpt-5.4";

/** 傳入 codex subprocess 的環境變數白名單，與 codexProvider 保持一致 */
const CODEX_ENV_WHITELIST = new Set([
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "OPENAI_API_KEY",
  "TERM",
]);

/** CODEX 專屬環境變數額外允許清單，與 codexProvider 保持一致 */
const CODEX_ENV_EXTRA_WHITELIST: ReadonlySet<string> = new Set([
  "CODEX_DISABLE_TELEMETRY",
  "CODEX_LOG_LEVEL",
]);

// ─── 內部 helpers ─────────────────────────────────────────────────────────────

/** 篩選環境變數白名單，與 codexProvider.buildCodexEnv 邏輯相同 */
function buildCodexEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (CODEX_ENV_WHITELIST.has(key) || CODEX_ENV_EXTRA_WHITELIST.has(key)) {
      out[key] = value;
    }
  }
  return out;
}

/** process.env 在 process 生命週期內不會改變，模組載入時快取一次 */
const CODEX_ENV = buildCodexEnv();

/**
 * 將 systemPrompt 與 userMessage 合併為單一 prompt 字串。
 * 格式：`[System: <systemPrompt>]\n\n[User: <userMessage>]`
 */
function buildCombinedPrompt(
  systemPrompt: string,
  userMessage: string,
): string {
  return `[System: ${systemPrompt}]\n\n[User: ${userMessage}]`;
}

/**
 * 組合一次性查詢的 codex CLI 參數（固定為新對話模式，不支援 resume）。
 * 沿用 codexProvider.buildNewSessionArgs 的旗標組合。
 */
function buildDisposableArgs(model: string, workspacePath: string): string[] {
  return [
    "exec",
    "-",
    "--json",
    "--skip-git-repo-check",
    "--cd",
    workspacePath,
    "--full-auto",
    "-c",
    "sandbox_workspace_write.network_access=true",
    "--model",
    model,
  ];
}

/**
 * 將 stderr 文字中的敏感資訊遮蔽，與 codexProvider.maskSensitiveText 邏輯相同。
 */
function maskSensitiveText(text: string): string {
  return text
    .replace(/OPENAI_API_KEY\s*=\s*\S+/gi, "OPENAI_API_KEY=[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/Authorization\s*:\s*\S+/gi, "Authorization: [REDACTED]")
    .replace(/api[_-]?key\s*[=:]\s*\S+/gi, "api_key=[REDACTED]")
    .replace(/sk-[A-Za-z0-9]{8,}/g, "sk-[REDACTED]");
}

/**
 * 並行收集 stderr，上限 STDERR_MAX_BYTES。
 * 必須在 stdout 消費之前啟動，避免 stderr buffer 滿導致 subprocess 卡住。
 */
async function collectStderr(
  proc: Bun.Subprocess<"pipe", "pipe", "pipe">,
  abortSignal: AbortSignal,
): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  let truncated = false;

  for await (const chunk of proc.stderr as ReadableStream<Uint8Array>) {
    if (abortSignal.aborted) break;
    const buf = Buffer.from(chunk as Uint8Array);
    if (totalBytes + buf.byteLength <= STDERR_MAX_BYTES) {
      chunks.push(buf);
      totalBytes += buf.byteLength;
    } else {
      truncated = true;
      break;
    }
  }

  let text = Buffer.concat(chunks).toString("utf-8").trim();
  if (truncated) {
    text += "\n[TRUNCATED]";
  }
  return maskSensitiveText(text);
}

/**
 * 逐行讀取 stdout，累積 text 事件內容，遇到 turn_complete 時停止。
 * 回傳 { content, hasTurnComplete }。
 */
async function processStdoutToBuffer(
  proc: Bun.Subprocess<"pipe", "pipe", "pipe">,
  abortSignal: AbortSignal,
): Promise<{ content: string; hasTurnComplete: boolean }> {
  let lineBuffer = "";
  let content = "";
  let hasTurnComplete = false;

  for await (const chunk of proc.stdout as ReadableStream<Uint8Array>) {
    if (abortSignal.aborted) break;

    lineBuffer += Buffer.from(chunk as Uint8Array).toString("utf-8");

    const lines = lineBuffer.split("\n");
    // 最後一段可能不完整，保留在 buffer
    lineBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = normalize(line);
      if (event === null) continue;

      if (event.type === "text") {
        content += event.content;
      } else if (event.type === "turn_complete") {
        hasTurnComplete = true;
        // 收到 turn_complete 即可結束，不需要繼續讀取
        return { content, hasTurnComplete };
      } else if (event.type === "error") {
        // codex stream 層級的 error event，記 log 後繼續（由 exit code 決定最終結果）
        logger.warn(
          "Chat",
          "Warn",
          `[CodexService] codex stream 層級錯誤事件：${event.message}`,
        );
      }
    }
  }

  // 處理 stdout 結束時剩餘的 buffer 內容
  if (lineBuffer.trim()) {
    const event = normalize(lineBuffer);
    if (event !== null) {
      if (event.type === "text") {
        content += event.content;
      } else if (event.type === "turn_complete") {
        hasTurnComplete = true;
      }
    }
  }

  return { content, hasTurnComplete };
}

// ─── CodexService ─────────────────────────────────────────────────────────────

class CodexService {
  /**
   * 一次性無狀態的 Codex 查詢，適用於 summary 等非 Pod 場景。
   * 不會建立 session、不會寫入 podStore。
   *
   * @param options - 查詢選項（systemPrompt、userMessage、workspacePath、model）
   * @param abortSignal - 外部 abort 控制，取消時 kill 子程序
   * @returns Promise<DisposableChatResult>
   */
  async executeDisposableChat(
    options: DisposableChatOptions,
    abortSignal?: AbortSignal,
  ): Promise<DisposableChatResult> {
    const { systemPrompt, userMessage, workspacePath } = options;
    const model = options.model ?? DEFAULT_MODEL;

    // 驗證 model 格式，防止 CLI 旗標注入
    if (!MODEL_RE.test(model)) {
      return {
        content: "",
        success: false,
        error: `不合法的 model 名稱：${model}`,
      };
    }

    // 建立內部 AbortController，整合外部 signal 與 timeout
    const internalController = new AbortController();
    const internalSignal = internalController.signal;

    // 外部 signal abort 時，同步取消內部 controller
    const onExternalAbort = (): void => {
      internalController.abort();
    };
    if (abortSignal) {
      if (abortSignal.aborted) {
        return { content: "", success: false, error: "查詢已被取消" };
      }
      abortSignal.addEventListener("abort", onExternalAbort, { once: true });
    }

    // timeout 計時器
    const timeoutId = setTimeout(() => {
      internalController.abort(new Error("查詢逾時"));
    }, DISPOSABLE_CHAT_TIMEOUT_MS);

    let proc: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;

    // abort signal：kill 子程序
    const onInternalAbort = (): void => {
      try {
        proc?.kill();
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err as NodeJS.ErrnoException).code === "ESRCH"
        ) {
          // subprocess 已結束，正常情況忽略
          return;
        }
        logger.error(
          "Chat",
          "Warn",
          "[CodexService] kill subprocess 時發生非預期錯誤",
          err,
        );
      }
    };
    internalSignal.addEventListener("abort", onInternalAbort, { once: true });

    try {
      const codexArgs = buildDisposableArgs(model, workspacePath);
      const promptText = buildCombinedPrompt(systemPrompt, userMessage);

      // 啟動子程序
      try {
        proc = Bun.spawn(["codex", ...codexArgs], {
          cwd: workspacePath,
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
          env: CODEX_ENV,
        });
      } catch (err: unknown) {
        const isEnoent =
          err instanceof Error &&
          ("code" in err
            ? (err as NodeJS.ErrnoException).code === "ENOENT"
            : err.message.includes("ENOENT"));

        if (isEnoent) {
          return {
            content: "",
            success: false,
            error: "codex CLI 尚未安裝或不在 PATH 中，請執行 codex login",
          };
        }

        logger.error(
          "Chat",
          "Error",
          "[CodexService] 啟動 codex 子程序失敗",
          err,
        );
        return {
          content: "",
          success: false,
          error: "啟動 codex 子程序失敗，請查閱伺服器日誌",
        };
      }

      // 若 spawn 前已 abort，直接 kill 並回傳
      if (internalSignal.aborted) {
        proc.kill();
        return { content: "", success: false, error: "查詢已被取消" };
      }

      // 寫入 prompt 到 stdin 後關閉
      proc.stdin.write(promptText);
      await proc.stdin.end();

      // 並行啟動 stderr 收集（在 stdout 之前啟動，避免 buffer 滿卡住）
      const stderrPromise = collectStderr(proc, internalSignal);

      // 逐行讀取 stdout，累積 text 事件，遇到 turn_complete 停止
      const { content, hasTurnComplete } = await processStdoutToBuffer(
        proc,
        internalSignal,
      );

      // 等待 stderr 收集完成
      const stderrText = await stderrPromise;

      // 等待子程序結束
      const exitCode = await proc.exited;

      // abort 路徑：timeout 或外部取消
      if (internalSignal.aborted) {
        const isTimeout =
          internalSignal.reason instanceof Error &&
          internalSignal.reason.message === "查詢逾時";
        return {
          content: "",
          success: false,
          error: isTimeout ? "查詢逾時，已強制終止子程序" : "查詢已被取消",
        };
      }

      // 非零 exit code 且未完成 turn → 視為失敗
      if (exitCode !== 0 && !hasTurnComplete) {
        logger.error(
          "Chat",
          "Error",
          `[CodexService] codex 子程序以非零 exit code 結束（exit code: ${exitCode}）${stderrText ? "，stderr 詳見下行" : "，無 stderr 輸出"}`,
        );
        if (stderrText) {
          logger.error("Chat", "Error", `[CodexService] stderr: ${stderrText}`);
        }
        return {
          content: "",
          success: false,
          error: "執行發生錯誤，請查閱伺服器日誌",
        };
      }

      // 已完成 turn 但非零 exit code：記 warn，保留正常輸出
      if (exitCode !== 0 && hasTurnComplete) {
        logger.warn(
          "Chat",
          "Warn",
          `[CodexService] codex 已完成一個 turn 但以非零 exit code 結束（exit code: ${exitCode}），可能為正常退出行為`,
        );
        if (stderrText) {
          logger.warn("Chat", "Warn", `[CodexService] stderr: ${stderrText}`);
        }
      }

      return { content, success: true };
    } finally {
      clearTimeout(timeoutId);
      internalSignal.removeEventListener("abort", onInternalAbort);
      if (abortSignal) {
        abortSignal.removeEventListener("abort", onExternalAbort);
      }
    }
  }
}

export const codexService = new CodexService();
