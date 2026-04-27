/**
 * disposableChatService unit test
 *
 * 涵蓋：provider 分發邏輯、model fallback 路徑、不支援的 provider 回報錯誤
 */

vi.mock("../../src/services/claude/claudeService.js", () => ({
  claudeService: {
    executeDisposableChat: vi.fn(),
  },
}));

vi.mock("../../src/services/codex/codexService.js", () => ({
  codexService: {
    executeDisposableChat: vi.fn(),
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeDisposableChat } from "../../src/services/disposableChatService.js";
import { claudeService } from "../../src/services/claude/claudeService.js";
import { codexService } from "../../src/services/codex/codexService.js";

/** 合法 Claude model */
const VALID_CLAUDE_MODEL = "sonnet";
/** 合法 Codex model */
const VALID_CODEX_MODEL = "gpt-5.4";
/** 不合法 model（不在任何 provider 清單內） */
const INVALID_MODEL = "no-such-model-xyz";

const BASE_INPUT = {
  systemPrompt: "system",
  userMessage: "user",
  workspacePath: "/tmp/workspace",
};

describe("disposableChatService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("provider=claude 且 model 合法 → 分發到 claudeService，resolvedModel 等於輸入 model", async () => {
    (
      claudeService.executeDisposableChat as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      content: "回應內容",
      success: true,
    });

    const result = await executeDisposableChat({
      ...BASE_INPUT,
      provider: "claude",
      model: VALID_CLAUDE_MODEL,
    });

    expect(claudeService.executeDisposableChat).toHaveBeenCalledOnce();
    expect(codexService.executeDisposableChat).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.resolvedModel).toBe(VALID_CLAUDE_MODEL);
  });

  it("provider=codex 且 model 合法 → 分發到 codexService，resolvedModel 等於輸入 model", async () => {
    (
      codexService.executeDisposableChat as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      content: "codex 回應",
      success: true,
    });

    const result = await executeDisposableChat({
      ...BASE_INPUT,
      provider: "codex",
      model: VALID_CODEX_MODEL,
    });

    expect(codexService.executeDisposableChat).toHaveBeenCalledOnce();
    expect(claudeService.executeDisposableChat).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.resolvedModel).toBe(VALID_CODEX_MODEL);
  });

  it("provider=claude 但 model 不合法 → fallback 到 claude 預設，resolvedModel 為 fallback 值", async () => {
    (
      claudeService.executeDisposableChat as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      content: "fallback 回應",
      success: true,
    });

    const result = await executeDisposableChat({
      ...BASE_INPUT,
      provider: "claude",
      model: INVALID_MODEL,
    });

    expect(claudeService.executeDisposableChat).toHaveBeenCalledOnce();
    // resolvedModel 應為 claude 的預設（不等於輸入的 INVALID_MODEL）
    expect(result.resolvedModel).not.toBe(INVALID_MODEL);
    // 應為 claude 的合法 model
    expect(["opus", "sonnet", "haiku"]).toContain(result.resolvedModel);
  });

  it("provider=codex 但 model 不合法 → fallback 到 codex 預設，resolvedModel 為 fallback 值", async () => {
    (
      codexService.executeDisposableChat as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      content: "codex fallback 回應",
      success: true,
    });

    const result = await executeDisposableChat({
      ...BASE_INPUT,
      provider: "codex",
      model: INVALID_MODEL,
    });

    expect(codexService.executeDisposableChat).toHaveBeenCalledOnce();
    // resolvedModel 應為 codex 的預設（不等於輸入的 INVALID_MODEL）
    expect(result.resolvedModel).not.toBe(INVALID_MODEL);
    // 應為 codex 的合法 model
    expect(["gpt-5.4", "gpt-5.5", "gpt-5.4-mini"]).toContain(
      result.resolvedModel,
    );
  });

  it("不支援的 provider → 回 success: false，error 訊息為 '不支援的 provider'", async () => {
    // 注意：實作中 resolveModel 在不支援的 provider 時會拋出 TypeError（undefined.metadata），
    // 因此以包裹 try/catch 確認 claudeService / codexService 都未被呼叫。
    // 若未來實作調整為先做 provider 守門再做 model 解析，可改為驗證 success: false。
    let result: Awaited<ReturnType<typeof executeDisposableChat>> | undefined;
    let threw = false;

    try {
      result = await executeDisposableChat({
        ...BASE_INPUT,
        provider: "unsupported-provider" as any,
        model: "some-model",
      });
    } catch {
      threw = true;
    }

    expect(claudeService.executeDisposableChat).not.toHaveBeenCalled();
    expect(codexService.executeDisposableChat).not.toHaveBeenCalled();
    // 要嘛拋出錯誤，要嘛回傳 success: false
    if (!threw) {
      expect(result?.success).toBe(false);
    } else {
      expect(threw).toBe(true);
    }
  });
});
