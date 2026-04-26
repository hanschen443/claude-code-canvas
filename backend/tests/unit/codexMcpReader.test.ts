import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

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

  describe("讀取路徑驗證", () => {
    it("未設定 CODEX_CONFIG_PATH 時，readFileSync 第一個參數應為 ~/.codex/config.toml", () => {
      // 確保環境變數不存在，測試預設路徑邏輯
      delete process.env.CODEX_CONFIG_PATH;

      // 讓 readFileSync 拋 ENOENT，只是要確認被呼叫的路徑
      mockReadFileSync.mockImplementation(() => {
        const err = new Error("ENOENT: no such file or directory");
        (err as NodeJS.ErrnoException).code = "ENOENT";
        throw err;
      });

      readCodexMcpServers();

      // 驗證呼叫時第一個參數是預設路徑（使用真實 os.homedir()）
      const expectedPath = path.join(os.homedir(), ".codex", "config.toml");
      expect(mockReadFileSync).toHaveBeenCalled();
      expect(mockReadFileSync.mock.calls[0][0]).toBe(expectedPath);
    });
  });

  describe("非 ENOENT 的 readFileSync 錯誤時", () => {
    it("拋出 EACCES 錯誤時應回傳空陣列、且 logger.warn 被呼叫", async () => {
      // 非「檔案不存在」的錯誤，實作應呼叫 logger.warn 並靜默回空陣列
      mockReadFileSync.mockImplementation(() => {
        const err = new Error("EACCES: permission denied");
        (err as NodeJS.ErrnoException).code = "EACCES";
        throw err;
      });

      const { logger } = await import("../../src/utils/logger.js");

      const result = readCodexMcpServers();

      expect(result).toEqual([]);
      expect(logger.warn).toHaveBeenCalled();
    });
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

  describe("server name 字元集驗證", () => {
    it("合法名稱（字母、數字、底線、連字號）應正常回傳", () => {
      mockReadFileSync.mockReturnValue(
        makeStdioToml("valid_server-123", "npx"),
      );

      const result = readCodexMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("valid_server-123");
    });

    it("含 = 號的 server name 應被略過，防止 CLI 旗標注入", () => {
      mockReadFileSync.mockReturnValue(
        '[mcp_servers."bad=name"]\ncommand = "npx"\n',
      );

      const result = readCodexMcpServers();

      expect(result).toHaveLength(0);
    });

    it("含空格的 server name 應被略過", () => {
      mockReadFileSync.mockReturnValue(
        '[mcp_servers."bad name"]\ncommand = "npx"\n',
      );

      const result = readCodexMcpServers();

      expect(result).toHaveLength(0);
    });

    it("含 -- 的 server name 應被略過，防止 CLI 旗標注入", () => {
      // TOML 中以純字串 key 方式注入 --inject
      // Bun.TOML.parse 對含特殊字元的 key 需加引號，此處驗證解析後字元驗證邏輯
      mockReadFileSync.mockReturnValue(
        '[mcp_servers."--inject"]\ncommand = "npx"\n',
      );

      const result = readCodexMcpServers();

      expect(result).toHaveLength(0);
    });

    it("含合法與不合法 name 混合時，只回傳合法的", () => {
      const toml =
        '[mcp_servers.good]\ncommand = "npx"\n\n' +
        '[mcp_servers."bad=name"]\ncommand = "node"\n';
      mockReadFileSync.mockReturnValue(toml);

      const result = readCodexMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("good");
    });
  });

  describe("5 秒 TTL 快取", () => {
    it("TTL 自然過期後應重新讀取磁碟", () => {
      const BASE_TIME = 2000000;
      // 模擬 Date.now() 初始時間
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(BASE_TIME);

      mockReadFileSync.mockReturnValue(makeStdioToml("first-server", "node"));

      // 第一次呼叫，建立快取
      const result1 = readCodexMcpServers();
      expect(result1[0].name).toBe("first-server");
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);

      // 模擬時間推進超過 5 秒 TTL
      dateSpy.mockReturnValue(BASE_TIME + 5001);

      // 更新 mock 回傳值，模擬磁碟設定檔已變更
      mockReadFileSync.mockReturnValue(
        makeHttpToml("updated-server", "https://example.com/mcp"),
      );

      // TTL 過期後應重新讀取
      const result2 = readCodexMcpServers();
      expect(result2[0].name).toBe("updated-server");
      expect(result2[0].type).toBe("http");
      expect(mockReadFileSync).toHaveBeenCalledTimes(2);

      dateSpy.mockRestore();
    });

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
