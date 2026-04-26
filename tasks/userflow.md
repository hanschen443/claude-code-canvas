# MCP 重構 User Flow

## 背景

把 MCP server 從「app 內 SQLite CRUD 管理 + canvas note 拖拉綁定」改成「使用者在外部 CLI 安裝（~/.claude.json / ~/.codex/config.toml）+ app 唯讀讀取 + Claude pod 可 per-pod toggle / Codex pod 唯讀展示」，UX 與既有 plugin 系統對等。

---

## Claude pod 的 MCP 啟用

### 情境：使用者查看本機已安裝的 MCP server 並啟用一個
- Given 使用者已在外部用 `claude mcp add` 安裝至少一個 MCP server
- When 使用者點開 Claude pod 的 MCP slot popover
- Then 看到本機所有 MCP server 列表（每個顯示 name 與類型）
- When 使用者切換某個 MCP 的 toggle 為「開」
- Then 該 MCP 在這個 pod 的下次對話啟用，pod 記住這個設定

### 情境：使用者關閉某個已啟用的 MCP server
- Given pod 已啟用 server A
- When 使用者切換 A 的 toggle 為「關」
- Then A 不再對這個 pod 啟用，pod 設定即時更新

### 情境：使用者本機沒有任何 MCP server
- Given 使用者沒在外部安裝任何 MCP server
- When 使用者點開 Claude pod 的 MCP popover
- Then 看到「尚未安裝 MCP server」提示與「請使用 `claude mcp add` 安裝」的說明文字

### 情境：在外部 CLI 移除了一個已啟用的 MCP server
- Given pod 已啟用 server A
- When 使用者在外部執行 `claude mcp remove A`，再回 app 點開 popover
- Then A 不再出現在列表，pod 上原本的綁定自動失效（不再對 Claude 傳遞）

### 情境：pod 正在執行中
- Given pod 處於 busy 狀態（任務進行中）
- When 使用者點開 popover 嘗試切換 toggle
- Then toggle 不可操作，並顯示 busy 提示

---

## Codex pod 的 MCP 唯讀展示

### 情境：使用者查看 Codex pod 的 MCP 列表
- Given 使用者已在 `~/.codex/config.toml` 設定至少一個 MCP server
- When 使用者點開 Codex pod 的 MCP popover
- Then 看到所有 MCP server 列表，每個顯示 name 與類型（stdio / http），且帶 ✓ 標記
- And 看到提示文字「Codex MCP server 由 codex 全域管理」
- And 列表項目沒有 toggle，使用者無法在 app 內變更啟用狀態

### 情境：codex 設定檔沒有 MCP server
- Given `~/.codex/config.toml` 不存在，或檔案中沒有 `[mcp_servers.*]` 區塊
- When 使用者點開 Codex pod 的 MCP popover
- Then 看到「尚未安裝 MCP server」提示與「請使用 `codex mcp add` 安裝」的說明文字

---

## 既有資料的處理

### 情境：使用者升級到新版第一次啟動後端
- Given 使用者本機 SQLite 既有 `mcp_servers`、`mcp_server_notes`、`pod_mcp_server_ids` 三張表，且 pod 上有 `mcpServerIds` 綁定資料
- When 後端啟動執行 migration
- Then 三張表被 DROP（不可逆）
- And pod 的 `mcpServerIds` 欄位轉為 `mcpServerNames`（內容清空），使用者需自行在外部 CLI 安裝並重新在 popover 啟用

---

## 切換 provider 後的行為

### 情境：使用者把 pod 從 Claude 切到 Codex
- Given pod 原本 provider 是 claude，啟用了 server A
- When 使用者把 pod 的 provider 切到 codex
- Then MCP popover 變成唯讀模式，列表來源換成 `~/.codex/config.toml`
- And 原本啟用的 `mcpServerNames` 在 codex pod 上不會起作用（codex 是全域啟用）

### 情境：使用者把 pod 從 Codex 切回 Claude
- Given pod 之前是 codex
- When 使用者切回 claude
- Then popover 恢復可 toggle 的列表，來源換成 `~/.claude.json`
- And `mcpServerNames` 欄位若有殘留值會顯示為已啟用（前提是該 server name 仍存在於 `~/.claude.json`）
