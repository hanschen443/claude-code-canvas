/**
 * GeminiService
 *
 * 提供一次性無狀態的 Gemini 查詢能力，適用於 summary 等非 Pod 場景。
 * 不會建立 session、不會寫入 podStore。
 *
 * 設計參照 codexService.executeDisposableChat，差異：
 * - 使用 gemini CLI（--approval-mode plan 為 read-only 模式，避免工具操作影響輸出）
 * - prompt 透過 --prompt 旗標傳入（與 GeminiProvider 一般對話用法一致）
 * - 不需要 semaphore（Gemini 為 API-based，無本地資源競爭問題）
 * - 沒有 timeout 環境變數設定（可未來按需加入）
 */

import path from "path";
import { normalize } from "../provider/geminiNormalizer.js";
import { logger } from "../../utils/logger.js";
import type {
  DisposableChatOptions,
  DisposableChatResult,
} from "../shared/disposableChatTypes.js";
import { buildGeminiEnv, collectStderr } from "./geminiHelpers.js";

export type {
  DisposableChatOptions,
  DisposableChatResult,
} from "../shared/disposableChatTypes.js";

// ─── 常數 ────────────────────────────────────────────────────────────────────

/**
 * 合法 model 名稱格式（防止 CLI 旗標注入）。
 * 只允許英數字、點、底線、連字號，不允許空格或 -- 前綴等旗標字元。
 */
const MODEL_RE = /^[a-zA-Z0-9._-]+$/;

/**
 * 預設模型，與 GeminiProvider.metadata.defaultOptions.model 對齊。
 */
const DEFAULT_MODEL = "gemini-2.5-pro";

/** process.env 在 process 生命週期內不會改變，模組載入時快取一次 */
const GEMINI_ENV = buildGeminiEnv();

// ─── 內部 helpers ─────────────────────────────────────────────────────────────

/**
 * 組合一次性查詢的 gemini CLI 參數。
 * 使用 --approval-mode plan（read-only 模式）避免工具操作影響輸出，適合 summary 等純文字場景。
 * prompt 透過 --prompt 旗標傳入，與 GeminiProvider 一般對話用法一致。
 *
 * @param model 模型名稱（已通過 MODEL_RE 驗證）
 * @param promptText prompt 文字（直接放入 --prompt flag）
 */
function buildDisposableArgs(model: string, promptText: string): string[] {
  return [
    "--model",
    model,
    "--output-format",
    "stream-json",
    // plan 模式為 read-only，gemini CLI 不會執行任何工具操作，適合 summary 等純文字場景
    "--approval-mode",
    "plan",
    "--skip-trust",
    "--prompt",
    promptText,
  ];
}

/**
 * 逐行讀取 stdout，累積 text 事件內容，遇到 turn_complete 時停止。
 * 回傳 { content, hasTurnComplete }。
 */
async function processStdoutToBuffer(
  proc: Bun.Subprocess<"ignore", "pipe", "pipe">,
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
        // gemini stream 層級的 error event，記 log 後繼續（由 exit code 決定最終結果）
        logger.warn(
          "Chat",
          "Warn",
          `[GeminiService] gemini stream 層級錯誤事件：${event.message}`,
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

/**
 * 依 exit code、hasTurnComplete 與 abort 狀態評估最終結果。
 */
function evaluateExitResult(
  exitCode: number,
  hasTurnComplete: boolean,
  content: string,
  stderrText: string,
  abortSignal: AbortSignal,
): DisposableChatResult {
  // abort 路徑：外部取消
  if (abortSignal.aborted) {
    return {
      content: "",
      success: false,
      error: "查詢已被取消",
    };
  }

  // 非零 exit code 且未完成 turn → 視為失敗
  if (exitCode !== 0 && !hasTurnComplete) {
    logger.error(
      "Chat",
      "Error",
      `[GeminiService] gemini 子程序以非零 exit code 結束（exit code: ${exitCode}）${stderrText ? "，stderr 詳見下行" : "，無 stderr 輸出"}`,
    );
    if (stderrText) {
      logger.error("Chat", "Error", `[GeminiService] stderr: ${stderrText}`);
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
      `[GeminiService] gemini 已完成一個 turn 但以非零 exit code 結束（exit code: ${exitCode}），可能為正常退出行為`,
    );
    if (stderrText) {
      logger.warn("Chat", "Warn", `[GeminiService] stderr: ${stderrText}`);
    }
  }

  return { content, success: true };
}

// ─── GeminiService ────────────────────────────────────────────────────────────

class GeminiService {
  /**
   * 一次性無狀態的 Gemini 查詢，適用於 summary 等非 Pod 場景。
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

    // 驗證 workspacePath 必須為絕對路徑，防止路徑穿越攻擊
    if (!path.isAbsolute(workspacePath)) {
      return {
        content: "",
        success: false,
        error: "workspacePath 必須為絕對路徑",
      };
    }

    // 驗證 model 格式，防止 CLI 旗標注入
    if (!MODEL_RE.test(model)) {
      return {
        content: "",
        success: false,
        error: `不合法的 model 名稱：${model}`,
      };
    }

    const signal = abortSignal ?? new AbortController().signal;

    if (signal.aborted) {
      return { content: "", success: false, error: "查詢已被取消" };
    }

    logger.log(
      "Chat",
      "Init",
      `[GeminiService] 啟動一次性查詢（model: ${model}，workspacePath: ${workspacePath}）`,
    );

    // 組合 prompt：[System]\n\n[User] 格式，透過 --prompt 旗標傳入（與 GeminiProvider 一般對話用法一致）
    const promptText = `[System: ${systemPrompt}]\n\n[User: ${userMessage}]`;

    // 安全警示：promptText 為未消毒的使用者輸入，必須保持陣列傳參給 Bun.spawn，禁止改為字串拼接（防止 CLI 旗標注入）
    const geminiArgs = buildDisposableArgs(model, promptText);
    let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
    try {
      proc = Bun.spawn(["gemini", ...geminiArgs], {
        cwd: workspacePath,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: GEMINI_ENV,
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
          error:
            "Gemini CLI 尚未安裝，請執行 `npm install -g @google/gemini-cli`",
        };
      }

      logger.error(
        "Chat",
        "Error",
        "[GeminiService] 啟動 gemini 子程序失敗",
        err,
      );
      return {
        content: "",
        success: false,
        error: "啟動 gemini 子程序失敗，請查閱伺服器日誌",
      };
    }

    // abort signal：kill 子程序
    const onAbort = (): void => {
      try {
        proc.kill();
      } catch (err: unknown) {
        if (
          err instanceof Error &&
          (err as NodeJS.ErrnoException).code === "ESRCH"
        ) {
          // subprocess 已結束，正常情況忽略
          return;
        }
        logger.warn(
          "Chat",
          "Warn",
          `[GeminiService] kill subprocess 時發生非預期錯誤：${err instanceof Error ? err.message : String(err)}`,
        );
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });

    try {
      // spawn 前已 abort，直接 kill 並回傳
      if (signal.aborted) {
        proc.kill();
        return { content: "", success: false, error: "查詢已被取消" };
      }

      // 並行啟動 stderr 收集（在 stdout 之前啟動，避免 buffer 滿卡住）
      const stderrPromise = collectStderr(proc, signal, "[GeminiService]");

      // 逐行讀取 stdout，累積 text 事件，遇到 turn_complete 停止
      const { content, hasTurnComplete } = await processStdoutToBuffer(
        proc,
        signal,
      );

      const stderrText = await stderrPromise;
      const exitCode = await proc.exited;

      return evaluateExitResult(
        exitCode,
        hasTurnComplete,
        content,
        stderrText,
        signal,
      );
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

export const geminiService = new GeminiService();
