import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";

// mock fs 與 os 模組（需在 import 之前設定）
vi.mock("fs");
vi.mock("os");

const mockReadFileSync = vi.mocked(fs.readFileSync);
const mockHomedir = vi.mocked(os.homedir);

// 固定 homedir 回傳值，避免測試結果受環境影響
const FAKE_HOME = "/home/testuser";

// 動態 import claudeMcpReader，需在 mock 設定後才 import
const { readClaudeMcpServers, resetClaudeMcpCache } =
  await import("../../src/services/mcp/claudeMcpReader.js");

describe("claudeMcpReader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetClaudeMcpCache();
    mockHomedir.mockReturnValue(FAKE_HOME);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("檔案不存在時", () => {
    it("應回傳空陣列", () => {
      mockReadFileSync.mockImplementation(() => {
        const err = new Error("ENOENT: no such file or directory");
        (err as NodeJS.ErrnoException).code = "ENOENT";
        throw err;
      });

      const result = readClaudeMcpServers();

      expect(result).toEqual([]);
    });
  });

  describe("非 ENOENT 的 readFileSync 錯誤時", () => {
    it("拋出 EACCES 錯誤時應靜默回傳空陣列且不拋例外", () => {
      // 權限不足等非「檔案不存在」的錯誤，實作對任何 readFileSync 拋錯都應靜默回空陣列
      mockReadFileSync.mockImplementation(() => {
        throw new Error("EACCES");
      });

      expect(() => readClaudeMcpServers()).not.toThrow();
      const result = readClaudeMcpServers();
      expect(result).toEqual([]);
    });
  });

  describe("JSON parse 失敗時", () => {
    it("應回傳空陣列", () => {
      mockReadFileSync.mockReturnValue("this is not valid json{{{");

      const result = readClaudeMcpServers();

      expect(result).toEqual([]);
    });
  });

  describe("projects 欄位不存在時", () => {
    it("應回傳空陣列", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ someOtherKey: "value" }),
      );

      const result = readClaudeMcpServers();

      expect(result).toEqual([]);
    });

    it("projects 為 null 時應回傳空陣列", () => {
      mockReadFileSync.mockReturnValue(JSON.stringify({ projects: null }));

      const result = readClaudeMcpServers();

      expect(result).toEqual([]);
    });
  });

  describe("user-scoped MCP server 解析（projects[homedir].mcpServers）", () => {
    it("應正確解析 command、args、env", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "my-server": {
                  command: "npx",
                  args: ["-y", "some-mcp-package"],
                  env: { API_KEY: "secret" },
                },
              },
            },
          },
        }),
      );

      const result = readClaudeMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "my-server",
        command: "npx",
        args: ["-y", "some-mcp-package"],
        env: { API_KEY: "secret" },
      });
    });

    it("args 缺失時應預設為空陣列", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: { "no-args-server": { command: "node" } },
            },
          },
        }),
      );

      const result = readClaudeMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0].args).toEqual([]);
    });

    it("env 缺失時應預設為空物件", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "no-env-server": { command: "python3", args: ["server.py"] },
              },
            },
          },
        }),
      );

      const result = readClaudeMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0].env).toEqual({});
    });

    it("command 不是字串時應略過該 entry", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "invalid-command": { command: 123, args: [] },
                "valid-server": { command: "node", args: ["server.js"] },
              },
            },
          },
        }),
      );

      const result = readClaudeMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("valid-server");
    });

    it("command 為空字串時應略過該 entry", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: { "empty-command": { command: "   ", args: [] } },
            },
          },
        }),
      );

      const result = readClaudeMcpServers();

      expect(result).toHaveLength(0);
    });

    it("多個 server 應全部解析", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "server-a": { command: "node", args: ["a.js"], env: {} },
                "server-b": {
                  command: "python3",
                  args: ["b.py"],
                  env: { FOO: "bar" },
                },
              },
            },
          },
        }),
      );

      const result = readClaudeMcpServers();

      expect(result).toHaveLength(2);
      const names = result.map((s) => s.name);
      expect(names).toContain("server-a");
      expect(names).toContain("server-b");
    });

    it("top-level mcpServers 不影響結果（只讀 projects[homedir].mcpServers）", () => {
      // 驗證 bug fix：不應讀取 top-level mcpServers，而是讀 projects[homedir].mcpServers
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          mcpServers: {
            "top-level-server": { command: "node", args: [] },
          },
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "user-server": { command: "python3", args: [] },
              },
            },
          },
        }),
      );

      const result = readClaudeMcpServers();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("user-server");
    });
  });

  describe("5 秒 TTL 快取", () => {
    it("5 秒內重複呼叫應走快取，只讀一次磁碟", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "cached-server": { command: "node", args: [], env: {} },
              },
            },
          },
        }),
      );

      // 第一次呼叫
      const result1 = readClaudeMcpServers();
      // 第二次呼叫（快取內）
      const result2 = readClaudeMcpServers();

      expect(result1).toEqual(result2);
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);
    });

    it("TTL 自然過期後應重新讀取磁碟", () => {
      const BASE_TIME = 1000000;
      // 模擬 Date.now() 初始時間
      const dateSpy = vi.spyOn(Date, "now").mockReturnValue(BASE_TIME);

      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "first-server": { command: "node", args: [], env: {} },
              },
            },
          },
        }),
      );

      // 第一次呼叫，建立快取
      const result1 = readClaudeMcpServers();
      expect(result1[0].name).toBe("first-server");
      expect(mockReadFileSync).toHaveBeenCalledTimes(1);

      // 模擬時間推進超過 5 秒 TTL
      dateSpy.mockReturnValue(BASE_TIME + 5001);

      // 更新 mock 回傳值，模擬磁碟檔案已變更
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "updated-server": { command: "python3", args: [], env: {} },
              },
            },
          },
        }),
      );

      // TTL 過期後應重新讀取
      const result2 = readClaudeMcpServers();
      expect(result2[0].name).toBe("updated-server");
      expect(mockReadFileSync).toHaveBeenCalledTimes(2);

      dateSpy.mockRestore();
    });

    it("resetClaudeMcpCache 後應重新讀取快取", () => {
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "first-server": { command: "node", args: [], env: {} },
              },
            },
          },
        }),
      );

      const result1 = readClaudeMcpServers();
      expect(result1).toHaveLength(1);
      expect(result1[0].name).toBe("first-server");

      // 清除快取
      resetClaudeMcpCache();

      // 變更 mock 回傳值，模擬檔案已更新
      mockReadFileSync.mockReturnValue(
        JSON.stringify({
          projects: {
            [FAKE_HOME]: {
              mcpServers: {
                "updated-server": { command: "python3", args: [], env: {} },
              },
            },
          },
        }),
      );

      const result2 = readClaudeMcpServers();
      expect(result2).toHaveLength(1);
      expect(result2[0].name).toBe("updated-server");

      // 共呼叫兩次（reset 後重新讀）
      expect(mockReadFileSync).toHaveBeenCalledTimes(2);
    });
  });
});
