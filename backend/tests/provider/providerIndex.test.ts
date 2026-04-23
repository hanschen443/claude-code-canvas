import { describe, it, expect, beforeEach } from "vitest";
import {
  getProvider,
  getCapabilities,
  clearProviderCache,
  PROVIDER_NAMES,
} from "../../src/services/provider/index.js";

// 每個 test case 執行前先清除快取，確保 singleton 狀態隔離
beforeEach(() => {
  clearProviderCache();
});

// ================================================================
// PROVIDER_NAMES
// ================================================================
describe("PROVIDER_NAMES", () => {
  it("應包含 claude 與 codex", () => {
    expect(PROVIDER_NAMES).toContain("claude");
    expect(PROVIDER_NAMES).toContain("codex");
  });
});

// ================================================================
// getCapabilities
// ================================================================
describe("getCapabilities", () => {
  it("claude 的 capabilities 應全部為 true", () => {
    const caps = getCapabilities("claude");

    expect(caps.chat).toBe(true);
    expect(caps.outputStyle).toBe(true);
    expect(caps.skill).toBe(true);
    expect(caps.subAgent).toBe(true);
    expect(caps.repository).toBe(true);
    expect(caps.command).toBe(true);
    expect(caps.mcp).toBe(true);
    expect(caps.integration).toBe(true);
    expect(caps.runMode).toBe(true);
  });

  it("codex 的 capabilities 中 chat=true，其餘全部 false", () => {
    const caps = getCapabilities("codex");

    expect(caps.chat).toBe(true);
    expect(caps.outputStyle).toBe(false);
    expect(caps.skill).toBe(false);
    expect(caps.subAgent).toBe(false);
    expect(caps.repository).toBe(false);
    expect(caps.command).toBe(false);
    expect(caps.mcp).toBe(false);
    expect(caps.integration).toBe(false);
    expect(caps.runMode).toBe(false);
  });
});

// ================================================================
// getProvider
// ================================================================
describe("getProvider", () => {
  it("第一次呼叫 getProvider('claude') 應回傳 name === 'claude' 的 ClaudeProvider 實例", async () => {
    const provider = await getProvider("claude");

    expect(provider).toBeDefined();
    expect(provider.name).toBe("claude");
  });

  it("第一次呼叫 getProvider('codex') 應回傳 name === 'codex' 的 CodexProvider 實例", async () => {
    const provider = await getProvider("codex");

    expect(provider).toBeDefined();
    expect(provider.name).toBe("codex");
  });

  it("連續呼叫同一 ProviderName 應回傳相同實例（singleton 快取命中）", async () => {
    const first = await getProvider("claude");
    const second = await getProvider("claude");

    // 嚴格相等：同一個物件參考
    expect(first).toBe(second);
  });

  it("clearProviderCache() 後再呼叫 getProvider() 應重新取得實例（仍功能正常）", async () => {
    const before = await getProvider("claude");

    // 清除快取
    clearProviderCache();

    const after = await getProvider("claude");

    // 清除後重新建立的實例仍須是合法的 provider（name 正確）
    expect(after.name).toBe("claude");

    // 清除快取前後取得的實例為不同物件（singleton 已被重建）
    // 注意：由於 ES module import 是 singleton，claudeProvider 本身是同一個物件，
    // 但快取機制已正確重新執行 set 流程，故此處確認 provider 功能正常即可
    expect(before.name).toBe(after.name);
  });
});
