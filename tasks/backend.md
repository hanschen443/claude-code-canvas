# Backend 重構計畫書：MCP 從 SQLite CRUD 改為外部 CLI 唯讀

## 重構目標

將 MCP server 管理從「app 內 SQLite CRUD + canvas note 拖拉綁定」改為「外部 CLI 安裝 + app 唯讀讀取 + Claude pod per-pod toggle / Codex pod 唯讀展示」。不留向後相容、SQLite 既有資料直接 DROP、欄位改名直接動。

---

## 測試案例（依 user flow 推導，僅列名稱）

### Claude pod MCP toggle
- 使用者本機已安裝 MCP server，點開 popover 顯示完整列表
- 切換某個 MCP toggle 為「開」，pod 記住設定
- 切換某個 MCP toggle 為「關」，pod 移除該 name
- 使用者本機沒有任何 MCP server 時 reader 回傳空陣列
- 在外部移除已啟用的 MCP server 後 reader 不再回傳，pod 啟用清單自動失效（self-healing）
- pod busy 狀態下後端拒絕 mcpServerNames 變更請求

### Codex pod MCP 唯讀
- 使用者已在 ~/.codex/config.toml 設定 MCP，reader 列出全部含類型
- ~/.codex/config.toml 不存在時 reader 回傳空陣列
- ~/.codex/config.toml 存在但無 [mcp_servers.*] 區塊時 reader 回傳空陣列
- stdio 類型（含 command 欄位）正確判斷
- http 類型（含 url 欄位）正確判斷

### 既有資料 migration
- 升級後 mcp_servers / mcp_server_notes / pod_mcp_server_ids 三張表 DROP 完成
- 升級後 pod 的舊 mcpServerIds 資料被清除，新欄位 mcpServerNames 為空陣列

### Provider 切換
- pod 從 claude 切到 codex 後 mcpServerNames 不再傳入 SDK options
- pod 從 codex 切回 claude 後 mcpServerNames 殘值若仍存在 ~/.claude.json 則重新生效

### Reader cache 與整合
- Claude reader 5s TTL cache 命中與失效行為
- Codex reader 5s TTL cache 命中與失效行為
- buildClaudeOptions 過濾 mcpServerNames 後正確組成 Options.mcpServers
- applyIntegrationToolOptions 與 MCP reader 並存不互相覆蓋

---

## 實作計畫

### Phase 1（可並行）

A. 新增 Claude MCP reader
  - [ ] 建立 `backend/src/services/mcp/claudeMcpReader.ts`
  - [ ] 讀取路徑：`path.join(os.homedir(), ".claude.json")`
  - [ ] 解析 JSON 後取 `mcpServers` 物件（key 為 name，value 為 `{ command, args, env }`）
  - [ ] 回傳型別：`{ name: string; command: string; args: string[]; env: Record<string, string> }[]`
  - [ ] 實作 5 秒 TTL cache，模式對齊 `pluginScanner.ts` 第 30 行的 cache 機制
  - [ ] 檔案不存在 / JSON parse 失敗 / `mcpServers` 不存在 時回傳空陣列（不拋例外）
  - [ ] export 一個函式 `readClaudeMcpServers()` 與一個 cache 重置函式 `resetClaudeMcpCache()`（測試用）
  - [ ] 註解全程 zh-TW

B. 新增 Codex MCP reader
  - [ ] 建立 `backend/src/services/mcp/codexMcpReader.ts`
  - [ ] 讀取路徑：`path.join(os.homedir(), ".codex/config.toml")`
  - [ ] TOML parser 優先使用 Bun 內建 `Bun.TOML`，若不存在則 fallback 到 npm package（先確認 Bun 版本是否內建 TOML 支援；若無則新增 `@iarna/toml` 依賴）
  - [ ] 解析後取 `mcp_servers` 區塊（每個 sub-key 為 server name）
  - [ ] 類型判斷：含 `command` 欄位視為 `stdio`；含 `url` 欄位視為 `http`；兩者皆無則跳過
  - [ ] 回傳型別：`{ name: string; type: "stdio" | "http" }[]`
  - [ ] 實作 5 秒 TTL cache，模式對齊 `pluginScanner.ts`
  - [ ] 檔案不存在 / TOML parse 失敗 / `mcp_servers` 區塊不存在 時回傳空陣列
  - [ ] export `readCodexMcpServers()` 與 `resetCodexMcpCache()`
  - [ ] 註解全程 zh-TW

C. 新增 MCP request / response zod schema
  - [ ] 建立 `backend/src/schemas/mcpSchemas.ts`
  - [ ] 定義 `mcpListRequestSchema`：`{ provider: "claude" | "codex" }`，使用 `.strict()`
  - [ ] 定義 `mcpListItemSchema`：`{ name: string; type?: "stdio" | "http" }`
  - [ ] 定義 `mcpListResultSchema`：`{ provider: "claude" | "codex", items: McpListItem[] }`，使用 `.strict()`
  - [ ] 定義 pod 設定 mcpServerNames 的 request schema（仿 `pluginSchemas` 設定 plugins 的 schema）
    - payload 欄位：`podId: string`、`mcpServerNames: string[]`
    - 使用 `.strict()`
  - [ ] export 對應 TS 型別

### Phase 2（可並行）

A. WebSocket events 新增與清理
  - [ ] 在 `backend/src/schemas/events.ts` 新增 request 事件：`MCP_LIST`、`POD_SET_MCP_SERVER_NAMES`
  - [ ] 在 `backend/src/schemas/events.ts` 新增 response 事件：`MCP_LIST_RESULT`、`POD_MCP_SERVER_NAMES_UPDATED`（仿 plugin 對等事件命名）
  - [ ] 移除 `events.ts` 第 60-70 行附近 MCP request 事件群組：所有 `MCP_SERVER_*` 與 `MCP_SERVER_NOTE_*` 與 `POD_BIND_MCP_SERVER` / `POD_UNBIND_MCP_SERVER`
  - [ ] 移除 `events.ts` 第 182-192 行附近 MCP response 事件群組：所有 `MCP_SERVER_*` 與 `MCP_SERVER_NOTE_*` 與 `POD_MCP_SERVER_BOUND` / `POD_MCP_SERVER_UNBOUND`

B. 新增 MCP handlers
  - [ ] 建立 `backend/src/handlers/mcpHandlers.ts`
  - [ ] 實作 `handleMcpList`：用 `mcpListRequestSchema` 驗證 payload，依 provider 分派到 `readClaudeMcpServers` 或 `readCodexMcpServers`，回傳 `MCP_LIST_RESULT`
  - [ ] 實作 `handlePodSetMcpServerNames`：仿 `pluginHandlers.handlePodSetPlugins` 設計
    - 用對應 schema 驗證 payload
    - 檢查 pod 是否存在（不存在用 `createI18nError` 拋錯）
    - 檢查 pod busy 狀態，若 busy 拒絕變更（用 `createI18nError`）
    - 用 `readClaudeMcpServers()` 取得目前可用 name 集合，過濾傳入的 mcpServerNames（self-healing：不存在的 name 直接丟掉）
    - 寫入 podStore（呼叫 Phase 3 改好的 setter）
    - 廣播 `POD_MCP_SERVER_NAMES_UPDATED`
  - [ ] 錯誤訊息 key 全部 zh-TW、走 `createI18nError`
  - [ ] 在 WebSocket router 註冊兩個 handler（找到既有 router 註冊區塊比照 plugin handler 加入）

### Phase 3

A. Pod 型別與 store 改動
  - [ ] 修改 `backend/src/types/pod.ts` 第 24 行：`mcpServerIds: string[]` 改為 `mcpServerNames: string[]`
  - [ ] 修改 `backend/src/services/podStore.ts`：刪除 `addMcpServerId`（797-802 行）與 `removeMcpServerId`（804-813 行）兩個 method
  - [ ] 修改 `backend/src/services/podStore.ts` `updateJoinTables`（657-675 行）：移除 `mcpServerIds` 分支
  - [ ] 在 `podStore` 新增 `setMcpServerNames(podId, names)` method：直接覆寫該 pod 的 mcpServerNames 陣列（仿 plugin 對等 setter）
  - [ ] 全檔搜尋 `mcpServerIds` 字串並逐一處理：除明確要刪的舊欄位外，全部改為 `mcpServerNames`
  - [ ] 更新 podStore factories / serializer / deserializer 中的欄位名與預設值（預設空陣列）
  - [ ] 註解保持 zh-TW

B. Provider buildClaudeOptions 整合
  - [ ] 修改 `backend/src/services/provider/claude/buildClaudeOptions.ts` 第 84-93 行 `applyMcpServers`
    - 改為呼叫 `readClaudeMcpServers()` 取得本機所有 server
    - 用 `pod.mcpServerNames` 為 allowlist 過濾
    - 將過濾結果轉為 SDK 期望的 `Options["mcpServers"]` 形狀（key = name，value = `{ command, args, env }`）
    - 若 `pod.mcpServerNames` 為空 / 過濾後為空：不寫入 `options.mcpServers`
  - [ ] 確認 `applyIntegrationToolOptions`（238-261 行）與 `buildIntegrationTool`（169-197 行）保持不動
  - [ ] 確認 `applyPlugins`（101-118 行）保持不動

C. Capabilities 調整
  - [ ] 修改 `backend/src/services/provider/capabilities.ts` `CODEX_CAPABILITIES`（16-26 行）：`mcp: false` 改為 `mcp: true`

D. Paste handlers 清理
  - [ ] 修改 `backend/src/handlers/pasteHandlers.ts` 第 100 行附近：移除處理 `mcpServerIds` 的整段邏輯
  - [ ] 同步檢查 paste schemas 是否有 `mcpServerIds` 欄位殘留，一併移除

### Phase 4

A. 移除舊 MCP 服務與 handler 檔案
  - [ ] 刪除整個檔案 `backend/src/services/mcpServerStore.ts`
  - [ ] 刪除整個檔案 `backend/src/handlers/mcpServerHandlers.ts`
  - [ ] 刪除整個檔案 `backend/src/schemas/mcpServerSchemas.ts`
  - [ ] 刪除整個檔案 `backend/tests/unit/mcpServer.test.ts`
  - [ ] 在 WebSocket router 註冊處移除所有舊 MCP handler 的綁定（對應 Phase 2 已移除的事件）

B. Database statements 清理
  - [ ] 修改 `backend/src/database/statements.ts`：移除 `mcpServer` prepared statement 群組（474-484 行附近）
  - [ ] 修改 `backend/src/database/statements.ts`：移除 `pod_mcp_server_ids` 相關 statements（298-314 行附近）
  - [ ] 確認 statements.ts 沒有其他殘留 mcpServer 相關 query
  - [ ] 若有共用 stmtCache key 涉及這些表也一併清掉

C. Database schema 清理
  - [ ] 修改 `backend/src/database/schema.ts`：移除 `mcp_servers` table 定義（155-159 行附近）
  - [ ] 修改 `backend/src/database/schema.ts`：移除 `pod_mcp_server_ids` table 定義（67-72 行附近）
  - [ ] 確認 `mcp_server_notes` table 定義也一併移除

### Phase 5

A. Migration（DROP 三張表）
  - [ ] 在 `backend/src/database/schema.ts` migration 區塊（266-347 行附近）查看目前最新版本號
  - [ ] 新增一支 migration（版本號接續 +1），語意：移除 MCP SQLite CRUD 模式，改外部 CLI 唯讀
  - [ ] migration 內容：
    - `DROP TABLE IF EXISTS mcp_server_notes`
    - `DROP TABLE IF EXISTS pod_mcp_server_ids`
    - `DROP TABLE IF EXISTS mcp_servers`
  - [ ] migration 開頭加註不可逆註解：「此 migration 不可逆。MCP 從 SQLite CRUD 改為外部 CLI 唯讀，舊資料直接清除，使用者需在外部 CLI 重新安裝並於 popover 重新啟用。」
  - [ ] 註解全程 zh-TW

### Phase 6

A. 測試補上
  - [ ] 在 `backend/tests/unit/` 新增 `claudeMcpReader.test.ts`：覆蓋上述測試案例中 Claude reader 相關項目（含 cache TTL 命中與失效）
  - [ ] 在 `backend/tests/unit/` 新增 `codexMcpReader.test.ts`：覆蓋 stdio / http 類型判斷、空檔案、無區塊、cache TTL
  - [ ] 在 `backend/tests/unit/` 新增 `mcpHandlers.test.ts`：覆蓋 handleMcpList 兩種 provider 分派、handlePodSetMcpServerNames 的 self-healing、busy 拒絕、pod 不存在錯誤
  - [ ] 在 `backend/tests/unit/` 既有 podStore 測試補：mcpServerNames 欄位寫入、setter 行為
  - [ ] 在 `backend/tests/unit/` 既有 buildClaudeOptions 測試補：mcpServerNames 過濾後組成 SDK options 的行為
  - [ ] 在 `backend/tests/integration/` 視需要補一個 migration 測試：確認三張表被 DROP

B. 驗證
  - [ ] 執行 `bun run test` 確認所有測試通過
  - [ ] 執行 `bun run style` 確認 eslint 與 type 通過
  - [ ] 修正所有失敗項目直到綠燈

---

## 重啟提醒

本次重構動到後端大量檔案（型別、handler、schema、SQLite migration、provider 整合），完成後請使用者重啟後端。Migration 會在啟動時自動執行並 DROP 三張舊表，舊綁定資料會永久清除。
