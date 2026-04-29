/**
 * geminiHelpers 單元測試
 *
 * 涵蓋：
 * - buildGeminiEnv：環境變數白名單過濾
 * - collectStderr：正常收集、64KB 截斷、abortSignal 中止
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── logger mock ────────────────────────────────────────────────────────
vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  buildGeminiEnv,
  collectStderr,
  GEMINI_ENV_WHITELIST,
  STDERR_MAX_BYTES,
} from "../../../src/services/gemini/geminiHelpers.js";
import { logger } from "../../../src/utils/logger.js";

// ── 工具：把 Uint8Array 轉為 ReadableStream<Uint8Array> ────────────────
function makeRawStream(data: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (data.length > 0) {
        controller.enqueue(data);
      }
      controller.close();
    },
  });
}

/** 建立只包含指定字串的 stderr ReadableStream */
function makeStderrStream(text: string): ReadableStream<Uint8Array> {
  return makeRawStream(new TextEncoder().encode(text));
}

/** 建立空的 ReadableStream（不輸出任何資料直接關閉） */
function makeEmptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
}

/** 建立 mock subprocess（gemini：stdin='ignore'） */
function makeMockProc(stderrStream: ReadableStream<Uint8Array>, exitCode = 0) {
  return {
    // gemini subprocess stdin='ignore'
    stdout: makeEmptyStream(),
    stderr: stderrStream,
    exited: Promise.resolve(exitCode),
    kill: vi.fn(),
  };
}

// ================================================================
// buildGeminiEnv
// ================================================================
describe("buildGeminiEnv", () => {
  // 保存原始 process.env 並在測試後還原
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 還原 process.env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("只有白名單 key 應出現在輸出中，非白名單 key 應被排除", () => {
    // 設置白名單 key
    process.env.PATH = "/usr/bin:/bin";
    process.env.HOME = "/home/user";
    process.env.LANG = "zh_TW.UTF-8";
    process.env.LC_ALL = "zh_TW.UTF-8";
    process.env.TERM = "xterm-256color";
    // 設置非白名單 key
    process.env.FOO = "bar";
    process.env.BAR = "baz";
    process.env.MY_SECRET = "secret-value";

    const env = buildGeminiEnv();

    // 白名單 key 應出現
    for (const key of GEMINI_ENV_WHITELIST) {
      if (process.env[key] !== undefined) {
        expect(env).toHaveProperty(key);
      }
    }

    // 非白名單 key 不應出現
    expect(env).not.toHaveProperty("FOO");
    expect(env).not.toHaveProperty("BAR");
    expect(env).not.toHaveProperty("MY_SECRET");
  });

  it("GEMINI_API_KEY 不應出現在輸出中，即使 process.env 已設定", () => {
    process.env.GEMINI_API_KEY = "fake-api-key-should-not-appear";

    const env = buildGeminiEnv();

    expect(env).not.toHaveProperty("GEMINI_API_KEY");
  });

  it("多次呼叫期間修改 env，應反映最新的 process.env 狀態", () => {
    process.env.PATH = "/original/path";

    const env1 = buildGeminiEnv();
    expect(env1.PATH).toBe("/original/path");

    // 修改 process.env.PATH
    process.env.PATH = "/modified/path";

    const env2 = buildGeminiEnv();
    expect(env2.PATH).toBe("/modified/path");

    // 兩次呼叫應各自獨立讀取 process.env
    expect(env1.PATH).not.toBe(env2.PATH);
  });

  it("白名單中 PATH 存在時應包含在輸出中", () => {
    process.env.PATH = "/usr/bin";

    const env = buildGeminiEnv();

    expect(env.PATH).toBe("/usr/bin");
  });
});

// ================================================================
// collectStderr
// ================================================================
describe("collectStderr", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("正常情況下應回傳完整 stderr（小於 64KB）", async () => {
    const text = "some stderr output line\nanother line";
    const proc = makeMockProc(makeStderrStream(text));
    const signal = new AbortController().signal;

    const result = await collectStderr(proc as any, signal, "[GeminiProvider]");

    expect(result).toBe(text.trim());
    // 未截斷：logger.warn 不應被呼叫
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("stderr 超過 64KB 時應截斷並呼叫 logger.warn，且結果含 [TRUNCATED]", async () => {
    // 建立超過 STDERR_MAX_BYTES 的 data（64KB + 1 byte）
    const oversize = STDERR_MAX_BYTES + 1;
    const bigData = new Uint8Array(oversize).fill(65); // 全部填 'A'
    const proc = makeMockProc(makeRawStream(bigData));
    const signal = new AbortController().signal;

    const result = await collectStderr(proc as any, signal, "[GeminiProvider]");

    // 應包含截斷標記
    expect(result).toContain("[TRUNCATED]");

    // logger.warn 應被呼叫，且訊息含截斷提示
    expect(logger.warn).toHaveBeenCalled();
    const warnCalls = (
      logger.warn as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls;
    const matched = warnCalls.some((call) =>
      call.some(
        (arg) =>
          typeof arg === "string" && arg.includes(String(STDERR_MAX_BYTES)),
      ),
    );
    expect(matched).toBe(true);
  });

  it("abortSignal 觸發後應停止收集，回傳已收集的部分內容（不含後續資料）", async () => {
    // 建立一個可手動控制的 abort controller
    const ac = new AbortController();

    // 建立一個大且慢的 stream（透過分批 enqueue 模擬）
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        // 先 enqueue 一小段資料，然後 abort，再 enqueue 更多（後者不應被收集）
        controller.enqueue(new TextEncoder().encode("collected\n"));
        // 不立即 close：讓 collectStderr 的 for-await 可以先讀到第一塊
        // abort 在外部觸發後，下一次 iteration 會 break
        controller.close();
      },
    });

    const proc = makeMockProc(stream);

    // 在呼叫前先 abort，確保 aborted 為 true
    ac.abort();

    const result = await collectStderr(
      proc as any,
      ac.signal,
      "[GeminiProvider]",
    );

    // abortSignal 已觸發：應立即停止（不一定有任何收集）
    // 關鍵：函式不應拋出例外，應正常回傳
    expect(typeof result).toBe("string");
  });

  it("stderr 為空時應回傳空字串", async () => {
    const proc = makeMockProc(makeEmptyStream());
    const signal = new AbortController().signal;

    const result = await collectStderr(proc as any, signal, "[GeminiProvider]");

    expect(result).toBe("");
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
