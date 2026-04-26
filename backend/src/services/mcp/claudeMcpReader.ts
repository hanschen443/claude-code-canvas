/**
 * claudeMcpReader 模組：讀取 ~/.claude.json 內的 mcpServers 設定，回傳已設定的 MCP server 清單。
 *
 * 主要 entry point：
 *   - {@link readClaudeMcpServers}
 *     → 讀取並解析 ~/.claude.json，套用 5 秒 TTL 快取後回傳 McpServerEntry[]。
 *     → 僅讀取 user-scoped（projects[homedir].mcpServers）。
 *   - {@link resetClaudeMcpCache}（僅供測試使用）
 *     → 清除快取，強制下次呼叫重新讀檔。
 *
 * 資料來源：
 *   - ~/.claude.json（key: projects[os.homedir()].mcpServers，value: { command, args, env }）
 *   - 注意：Claude 實際寫入的 key 是 projects[homedir]，不是 top-level mcpServers，
 *     這是讀取正確來源的關鍵 bug fix。
 */
import fs from "fs";
import os from "os";
import path from "path";

/**
 * 取得 ~/.claude.json 的讀取路徑。
 * 使用函式（lazy）而非 module 頂層常數，避免 module 初始化時過早呼叫 os.homedir()，
 * 方便測試中 mock os.homedir() 後仍能正確套用。
 */
function getClaudeJsonPath(): string {
  return (
    process.env.CLAUDE_JSON_PATH ?? path.join(os.homedir(), ".claude.json")
  );
}

/** 5 秒 TTL 快取，避免每次請求都重讀磁碟 */
const CACHE_TTL_MS = 5000;
let cache: { servers: McpServerEntry[]; expiresAt: number } | null = null;

/** 僅供測試使用：清除快取，讓下一次呼叫重新讀檔 */
export function resetClaudeMcpCache(): void {
  cache = null;
}

/** 單一 MCP server 的設定結構 */
export interface McpServerEntry {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** ~/.claude.json 中 mcpServers 每個 value 的原始格式 */
interface RawMcpServerValue {
  command?: unknown;
  args?: unknown;
  env?: unknown;
}

/** ~/.claude.json 中 projects[path] 的原始格式 */
interface RawProjectEntry {
  mcpServers?: Record<string, RawMcpServerValue>;
}

/** ~/.claude.json 的原始 JSON 結構（只取用到的欄位） */
interface ClaudeJsonFile {
  projects?: Record<string, RawProjectEntry>;
}

/**
 * 將 mcpServers 物件（Record<name, value>）轉換為 McpServerEntry 陣列。
 * command 必須是非空字串，否則略過該筆。
 */
function parseMcpServersRecord(
  record: Record<string, RawMcpServerValue>,
): McpServerEntry[] {
  const result: McpServerEntry[] = [];

  for (const [name, value] of Object.entries(record)) {
    // command 必須是字串，否則略過此筆
    if (typeof value.command !== "string" || value.command.trim() === "") {
      continue;
    }

    // args 必須是字串陣列，否則預設空陣列
    const args: string[] = Array.isArray(value.args)
      ? value.args.filter((a): a is string => typeof a === "string")
      : [];

    // env 必須是 string → string 的物件，否則預設空物件
    const env: Record<string, string> = {};
    if (
      value.env &&
      typeof value.env === "object" &&
      !Array.isArray(value.env)
    ) {
      for (const [k, v] of Object.entries(
        value.env as Record<string, unknown>,
      )) {
        if (typeof v === "string") {
          env[k] = v;
        }
      }
    }

    result.push({ name, command: value.command, args, env });
  }

  return result;
}

/**
 * 讀取 ~/.claude.json 並回傳 user-scoped MCP server 清單。
 *
 * - 讀取 projects[homedir].mcpServers（bug fix：Claude 實際寫入的位置是這裡而非 top-level）
 * - 5 秒內重複呼叫走快取，不重讀磁碟
 * - 檔案不存在、JSON 解析失敗時回傳空陣列（不拋例外）
 */
export function readClaudeMcpServers(): McpServerEntry[] {
  const now = Date.now();

  // 快取命中直接回傳
  if (cache !== null && now < cache.expiresAt) {
    return cache.servers;
  }

  // 讀取檔案內容
  let fileContent: string;
  try {
    fileContent = fs.readFileSync(getClaudeJsonPath(), "utf-8");
  } catch {
    // 檔案不存在（ENOENT）或無讀取權限時靜默回空
    cache = { servers: [], expiresAt: now + CACHE_TTL_MS };
    return [];
  }

  // 解析 JSON
  let data: ClaudeJsonFile;
  try {
    data = JSON.parse(fileContent) as ClaudeJsonFile;
  } catch {
    // JSON 格式錯誤時靜默回空
    cache = { servers: [], expiresAt: now + CACHE_TTL_MS };
    return [];
  }

  const homedir = os.homedir();

  // 讀取 user-scoped MCP servers（projects[homedir].mcpServers）
  // 注意：Claude 實際將 mcpServers 寫入 projects[homedir]，不是 top-level，此為 bug fix 關鍵
  const homeEntry = data.projects?.[homedir];
  const servers: McpServerEntry[] =
    homeEntry?.mcpServers && typeof homeEntry.mcpServers === "object"
      ? parseMcpServersRecord(homeEntry.mcpServers)
      : [];

  cache = { servers, expiresAt: now + CACHE_TTL_MS };
  return servers;
}
