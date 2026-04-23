import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ProviderPicker from "@/components/canvas/ProviderPicker.vue";

// mock icon 元件，避免 SVG 相依問題
vi.mock("@/components/icons/AnthropicLogo.vue", () => ({
  default: { name: "AnthropicLogo", template: "<svg />" },
}));
vi.mock("@/components/icons/OpenAILogo.vue", () => ({
  default: { name: "OpenAILogo", template: "<svg />" },
}));

function mountPicker() {
  return mount(ProviderPicker, {
    attachTo: document.body,
  });
}

describe("ProviderPicker", () => {
  describe("選擇 Claude 時的 emit payload", () => {
    it("providerConfig 僅包含 model 欄位，不含 provider 欄位", async () => {
      const wrapper = mountPicker();

      const buttons = wrapper.findAll("button");
      await buttons[0]!.trigger("click");

      const emitted = wrapper.emitted("select");
      expect(emitted).toBeTruthy();

      const payload = (emitted as unknown[][])[0]![0] as {
        provider: string;
        providerConfig: Record<string, unknown>;
      };
      expect(Object.keys(payload.providerConfig)).toEqual(["model"]);
      expect("provider" in payload.providerConfig).toBe(false);
    });

    it("Pod.provider 欄位正確帶為 'claude'", async () => {
      const wrapper = mountPicker();

      const buttons = wrapper.findAll("button");
      await buttons[0]!.trigger("click");

      const emitted = wrapper.emitted("select");
      const payload = (emitted as unknown[][])[0]![0] as {
        provider: string;
        providerConfig: Record<string, unknown>;
      };
      expect(payload.provider).toBe("claude");
    });
  });

  describe("選擇 Codex 時的 emit payload", () => {
    it("providerConfig 僅包含 model 欄位，不含 provider 欄位", async () => {
      const wrapper = mountPicker();

      const buttons = wrapper.findAll("button");
      await buttons[1]!.trigger("click");

      const emitted = wrapper.emitted("select");
      expect(emitted).toBeTruthy();

      const payload = (emitted as unknown[][])[0]![0] as {
        provider: string;
        providerConfig: Record<string, unknown>;
      };
      expect(Object.keys(payload.providerConfig)).toEqual(["model"]);
      expect("provider" in payload.providerConfig).toBe(false);
    });

    it("Pod.provider 欄位正確帶為 'codex'", async () => {
      const wrapper = mountPicker();

      const buttons = wrapper.findAll("button");
      await buttons[1]!.trigger("click");

      const emitted = wrapper.emitted("select");
      const payload = (emitted as unknown[][])[0]![0] as {
        provider: string;
        providerConfig: Record<string, unknown>;
      };
      expect(payload.provider).toBe("codex");
    });
  });
});
