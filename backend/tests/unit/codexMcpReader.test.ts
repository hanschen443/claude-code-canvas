import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";

// mock fs 模組（需在 import 之前設定）
vi.mock("fs");

// mock logger（避免測試輸出雜訊）
vi.mock("../../src/utils/logger.js", () => ({
  logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const mockReadFileSync = vi.mocked(fs.readFileSync);

// 動態 import codexMcpReader，需在 mock 設定後才 import
const { readCodexMcpServers, resetCodexMcpCache } =
  await import("../../src/services/mcp/codexMcpReader.js");

// 建立合法 TOML 字串的輔助函式
function makeStdioToml(name: string, command: string): string {
  return `[mcp_servers.${name}]\ncommand = "${command}"\n`;
}

function makeHttpToml(name: string, url: string): string {
  return `[mcp_servers.${name}]\nurl = "${url}"\n`;
}

function makeBothToml(
  stdioName: string,
  stdioCmd: string,
  httpName: string,
  httpUrl: string,
): string {
  return (
    `[mcp_servers.${stdioName}]\ncommand = "${stdioCmd}"\n\n` +
    `[mcp_servers.${httpName}]\nurl = "${httpUrl}"\n`
  );
}

describe("codexMcpReader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCodexMcpCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("~/.codex/config.toml 不存在時", () => {
    it("應回傳空陣列", () => {
      mockReadFileSync.mockImplementation(() => {
        const err = new Error("ENOENT: no such file or directory");
        (err as NodeJS.ErrnoException).code = "ENOENT";
        throw err;
      });

      const result = readCodexMcpServers();

      expect(result).toEqual([]);
    });
  });

  describe("mcp_servers 區塊不存在時", () => {
    it("應回傳空陣列", () => {
      // 有效 TOML 但無 mcp_servers 區塊
      mockReadFileSync.mockReturnValue('[model]\nname = "gpt-5.5"\n');

      const result = readCodexMcpServers();

      expect(result).toEqual([]);
    });
  });

  describe("TOML 解析失敗時", () => {
    it("無效 TOML 應回傳空陣列", () => {
      // 故意給一個不合法的 TOML 字串
      mockReadFileSync.mockReturnValue("[[[[invalid toml content");

      const result = readCodexMcpServers();

      expect(result).toEqual([]);
    });
  });

  describe("stdio 類型（含 command）判斷", () => {
    it("含 command 欄位的 entry 應判斷為 stdio 類型", () => {
      mockReadFileSync.mockReturnValue(makeStdioToml("context7", "npx"));

      const result = readCodexMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: "context7", type: "stdio" });
    });

    it("含 command 欄位（同時有其他欄位）的 entry 應判斷為 stdio 類型", () => {
      mockReadFileSync.mockReturnValue(
        '[mcp_servers.my-server]\ncommand = "npx"\nargs = ["-y", "some-pkg"]\n',
      );

      const result = readCodexMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("stdio");
    });
  });

  describe("http 類型（含 url）判斷", () => {
    it("含 url 欄位的 entry 應判斷為 http 類型", () => {
      mockReadFileSync.mockReturnValue(
        makeHttpToml("figma", "https://mcp.figma.com/mcp"),
      );

      const result = readCodexMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ name: "figma", type: "http" });
    });
  });

  describe("stdio 與 http 混合時", () => {
    it("應同時正確判斷兩種類型", () => {
      mockReadFileSync.mockReturnValue(
        makeBothToml("context7", "npx", "figma", "https://mcp.figma.com/mcp"),
      );

      const result = readCodexMcpServers();

      expect(result).toHaveLength(2);
      const stdioEntry = result.find((s) => s.name === "context7");
      const httpEntry = result.find((s) => s.name === "figma");
      expect(stdioEntry?.type).toBe("stdio");
      expect(httpEntry?.type).toBe("http");
    });
  });

  describe("command 與 url 皆無時", () => {
    it("應靜默略過該 entry", () => {
      mockReadFileSync.mockReturnValue(
        "[mcp_servers.invalid]\nsome_other_field = true\n",
      );

      const result = readCodexMcpServers();

      expect(result).toHaveLength(0);
    });
  });

  describe("5 秒 TTL 快取", () => {
    it("5 秒內重複呼叫應走快取，只讀一次磁碟", () => {
      mockReadFileSync.mockReturnValue(makeStdioToml("cached-server", "node"));

      // 第一次呼叫
      const result1 = readCodexMcpServers();
      // 第二次呼叫（快取內）
      const result2 = readCodexMcpServers();

      expect(result1).toEqual(result2);
      // readFileSync 只應呼叫一次
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    it("resetCodexMcpCache 後應重新讀取檔案", () => {
      mockReadFileSync.mockReturnValue(makeStdioToml("first-server", "node"));

      const result1 = readCodexMcpServers();
      expect(result1).toHaveLength(1);
      expect(result1[0].name).toBe("first-server");

      // 清除快取
      resetCodexMcpCache();

      // 變更 mock 回傳值，模擬設定檔已更新
      mockReadFileSync.mockReturnValue(
        makeHttpToml("updated-server", "https://example.com/mcp"),
      );

      const result2 = readCodexMcpServers();
      expect(result2).toHaveLength(1);
      expect(result2[0].name).toBe("updated-server");
      expect(result2[0].type).toBe("http");

      // 共呼叫兩次（reset 後重新讀）
      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
    });
  });
});
