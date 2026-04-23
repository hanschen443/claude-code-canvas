import { describe, it, expect } from "vitest";
import { enrichPod } from "@/lib/podValidation";
import {
  CLAUDE_DEFAULT_MODEL,
  CODEX_DEFAULT_MODEL,
} from "@/constants/providerDefaults";
import type { Pod } from "@/types";

/** 建立最小合法的 raw Pod，方便各 case 覆寫特定欄位 */
function makeRawPod(overrides: Partial<Pod> = {}): Pod {
  return {
    id: "pod-1",
    name: "test-pod",
    x: 100,
    y: 150,
    rotation: 0,
    output: [],
    provider: "claude",
    providerConfig: { model: CLAUDE_DEFAULT_MODEL },
    ...overrides,
  };
}

describe("enrichPod", () => {
  // --- case 1：缺 provider 時補 'claude' ---
  describe("缺 provider 時預設補 claude", () => {
    it("provider 未定義時應補為 claude", () => {
      // 刻意使用 as any 繞過 TypeScript 的必填限制，模擬後端舊資料
      const raw = makeRawPod({ provider: undefined as any });
      const enriched = enrichPod(raw);
      expect(enriched.provider).toBe("claude");
    });
  });

  // --- case 2：provider='codex' 但缺 providerConfig 時補 codex 預設 ---
  describe("provider=codex 且缺 providerConfig 時補 codex 預設", () => {
    it("providerConfig 應為 codex 預設值（僅含 model，不含 provider 欄位）", () => {
      const raw = makeRawPod({
        provider: "codex",
        providerConfig: undefined as any,
      });
      const enriched = enrichPod(raw);
      expect(enriched.providerConfig).toEqual({
        model: CODEX_DEFAULT_MODEL,
      });
    });
  });

  // --- case 3：provider='claude' 但缺 providerConfig 時補 claude 預設 ---
  describe("provider=claude 且缺 providerConfig 時補 claude 預設", () => {
    it("providerConfig 應為 claude 預設值（僅含 model，不含 provider 欄位）", () => {
      const raw = makeRawPod({
        provider: "claude",
        providerConfig: undefined as any,
      });
      const enriched = enrichPod(raw);
      expect(enriched.providerConfig).toEqual({
        model: CLAUDE_DEFAULT_MODEL,
      });
    });
  });

  // --- case 4：既有 providerConfig 不被覆蓋 ---
  describe("既有 providerConfig 應原樣保留", () => {
    it("claude pod 的自訂 model 不應被覆蓋", () => {
      const customConfig = {
        model: "haiku" as any,
      };
      const raw = makeRawPod({
        provider: "claude",
        providerConfig: customConfig,
      });
      const enriched = enrichPod(raw);
      expect(enriched.providerConfig).toEqual(customConfig);
    });

    it("codex pod 的自訂 model 不應被覆蓋", () => {
      const customConfig = {
        model: "gpt-4o" as any,
      };
      const raw = makeRawPod({
        provider: "codex",
        providerConfig: customConfig,
      });
      const enriched = enrichPod(raw);
      expect(enriched.providerConfig).toEqual(customConfig);
    });
  });
});
