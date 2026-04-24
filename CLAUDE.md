# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Claude Code Canvas 是一個**本地端**運行的視覺化 AI Agent 工作流程工具。使用者在瀏覽器畫布上建立 Pod（=一個 Claude Code session），以 Connection Line 串接形成 workflow，並透過 Claude Agent SDK 驅動執行。詳細產品說明與教學請參考 `README.md`。

## Monorepo 結構

```
/              # 根目錄（package.json 只管 build / release 腳本，無 workspaces）
├── backend/   # Bun runtime，Claude Agent SDK、WebSocket server、REST API、SQLite
├── frontend/  # Vue 3 + TypeScript + Pinia + Tailwind + shadcn/reka-ui
├── shared/    # 跨 backend/frontend 共享的輔助 (safeJsonParse、throttle)
├── scripts/   # 編譯腳本（compile.ts 會把前端打包成 VFS 並 bun build --compile）
└── skill/     # /api/* REST API 的 Skill 文件（對外 AI Agent 操控畫布用）
```

`backend/` 與 `frontend/` 各自有獨立的 `package.json`、`bun.lock`、`tsconfig.json`、`vitest.config.ts`、`eslint.config.js`。根目錄的 `package.json` 沒有 workspaces，指令要進對應資料夾執行。

## 常用指令

**不需要啟動 dev server**——使用者環境已常駐開啟，`bun run dev` 不用執行。

| 目的 | 指令 | 位置 |
|------|------|------|
| 跑測試（正式驗證） | `bun run test` | `backend/` 或 `frontend/` |
| 跑單一測試檔 | `bun run test -- tests/unit/<file>.test.ts` | `backend/` |
| Watch 測試 | `bun run test:watch`（backend）/ `bun run test`（frontend 預設 watch） | 對應資料夾 |
| Lint + TypeCheck | `bun run style` | `backend/` 或 `frontend/` |
| 編譯為單一 binary | `bun run build`（根目錄） | 根 |
| 生 release | `bun run release` | 根 |

重要：

- **用 `bun run test`，不要用 `bun test`**（後者會跳過 vitest config，撈到錯的檔案）。
- `bun run style` 同時跑 `tsc --noEmit` 和 `eslint`（frontend 是 `vue-tsc`），確認 type 與風格皆過。
- 後端修改完**要請使用者重啟**（daemon 不會自動 hot reload production binary）。
- 前端/後端指令要進各自資料夾，根目錄的 `package.json` 沒有跨 workspace 腳本。

## 高層架構

### 通訊：兩種協定並存

1. **WebSocket（Bun 原生，非 Socket.io）**：互動式操作（建立 Pod、拖拉、聊天串流、Workflow 觸發、Cursor 廣播）。事件名稱定義在 `backend/src/schemas/events.ts`（`WebSocketRequestEvents` / `WebSocketResponseEvents` enum）。新增 WS 事件不需要更新 `skill/`。
2. **REST API（`/api/*`）**：給外部 AI Agent（Claude Code CLI）透過 Skill 操控畫布用。路由集中在 `backend/src/api/apiRouter.ts`，由 `URLPattern` 比對。**新增 / 修改 / 刪除 REST API 時，務必同步更新 `skill/claude-code-canvas/`**。

請求流進入點是 `backend/src/index.ts` 的 `Bun.serve`，依序：Integration webhook → CORS 驗證 → REST API → WebSocket upgrade → 靜態檔案（production VFS）。

### 儲存：SQLite + 檔案系統

- **SQLite**：`backend/src/database/schema.ts` 定義全部資料表（`canvases`、`pods`、`connections`、`notes`、`messages`、`workflow_runs`、`run_pod_instances`、`integration_apps` 等）。schema 改動用 inline `ALTER TABLE ... ADD COLUMN` + `try/catch duplicate column` 的 in-code migration 模式。
- **檔案系統**：所有應用資料寫在 `~/Documents/ClaudeCanvas/`（見 `config/index.ts`）——包含 `canvas/`、`repositories/`（git worktrees）、`skills/`、`commands/`、`agents/`、`output-styles/`、`config.json`、`claude-code-canvas.pid`、`logs/`。
- Integration App 憑證會用 `encryptionService` 加密後存 DB；升版時 `startupService.migrateEncryptionIfNeeded()` 會做明文遷移 + VACUUM + 清 `.git` 歷史（因為備份機制會 git push）。

### Pod 執行核心：Claude Agent SDK

- `backend/src/services/claude/claudeService.ts` 是 SDK 包裝層，統一管理：
  - `query()` 呼叫、串流訊息處理（`streamEventProcessor.ts`）
  - Abort 管理（shutdown 時 `abortAllQueries()`）
  - Session ID 綁定（Pod 有 `claude_session_id`，Run mode 則綁在 `run_pod_instances`）
  - 錯誤映射（rate limit、auth、retry — `sdkErrorMapper.ts`）
- `streamingChatExecutor.ts` 是對外的執行入口，`executionStrategy.ts` / `normalExecutionStrategy.ts` 分派到不同模式。

### 兩種執行模式

程式碼處處有「Normal 模式 vs Multi-Instance 模式」的分支，理解這個區別是關鍵：

- **Normal 模式**：每個 Pod 同時只能處理一個請求，訊息和 session 直接掛在 `pods` 表。忙碌時新訊息排隊、Integration event 被跳過。
- **Multi-Instance 模式**（`pods.multi_instance = 1`）：每次訊息或觸發建立一個 `run_pod_instances`，可並行；對話紀錄走 `run_messages`；綁 Repo 時建立獨立 git worktree（`gitService.ts`），run 結束後清理。
  - Integration 事件永遠會觸發（不受 busy 影響）。
  - 使用者看歷史要透過 Run 面板。

### Workflow 引擎：Connection Line 觸發

`backend/src/services/workflow/` 是整個 workflow 觸發引擎，負責當上游 Pod 完成時決定要不要觸發下游。核心概念：

- Connection 有三種 `trigger_mode`：`auto`（無條件）、`ai`（AI 判斷）、`direct`（忽略其他條件直接執行）。
- 多條入連 = 「匯流」：`workflowMultiInputService.ts` 把多條 Auto / AI / Direct 分組（Auto 組 / Direct 組）做摘要彙整，再決定觸發。
- `summaryService.ts` + `summaryPromptBuilder.ts` 產生傳遞給下游的摘要（Connection 可設 `summary_model`）。
- AI 模式走 `aiDecideService.ts`（Connection 可設 `ai_decide_model`）。
- `runQueueService.ts` / `workflowQueueService.ts` 管 Pod 忙碌時的排隊。
- `runExecutionService.ts` 是 Multi-Instance 模式的 run lifecycle 核心。

### Handler 註冊模式

WebSocket handler 用 group-based registration：`backend/src/handlers/groups/*HandlerGroup.ts` 集中定義一組相關 event handler，在 `handlers/index.ts` 透過 `HandlerRegistry.registerGroup()` 註冊。新增 WS 事件要：
1. 在 `schemas/events.ts` 的 enum 加事件名
2. 在 `schemas/<domain>Schemas.ts` 加 Zod schema
3. 在 `handlers/<domain>Handlers.ts` 實作
4. 在對應的 `handlers/groups/<domain>HandlerGroup.ts` 註冊

### Integration（外部 webhook 觸發 Pod）

`backend/src/services/integration/` 下有 Slack / Telegram / Jira / Sentry / Webhook 五種 provider（`providers/` 子目錄）。流程：外部 webhook → `integrationWebhookRouter.ts` → provider 解析 → `integrationEventPipeline.ts`（含去重 / reply context）→ 找到綁定的 Pod → 觸發 chat。憑證加密存在 `integration_apps` 表。

### Frontend 狀態：多個 Pinia Store

`frontend/src/stores/` 按領域切分：`podStore`、`canvasStore`、`connectionStore`、`chatStore`（拆成 `chatMessageActions` / `chatConnectionActions` / `messageCompletionActions` / `toolTrackingActions` 等 action modules）、`runStore`、`integrationStore` 等。WebSocket client 在 `services/websocket/`。`composables/` 放可複用邏輯（拖拉、anchor、menu 定位等）。

### 編譯為單一 binary

`scripts/compile.ts` 會：
1. 掃描 `frontend/dist/` 把所有靜態檔 base64 編碼，寫入 `backend/src/generated/vfs.ts`（VFS = Virtual File System）。
2. 跑 `bun build --compile` 把後端 + VFS 打包成單檔 executable（`dist/claude-code-canvas*`）。
3. 編譯完把 `vfs.ts` 還原成空佔位檔，避免 source 殘留靜態內容。
4. 執行檔啟動時讀取環境變數 `NODE_ENV=production`，從 VFS serve 前端（`utils/staticFileServer.ts`）。

`backend/src/cli.ts` 是 binary 的 entry，提供 `start` / `stop` / `status` / `config` / `logs` 子命令，管理 PID 與 daemon spawn。

## 專案慣例

- **語系**：錯誤訊息、註解、commit message 一律用 **繁體中文**；程式碼識別字仍用英文。
- **Result 型別**：backend 許多 service 回傳 `Result<T>`（`types/result.ts` 的 `ok()` / `err()` pattern），取錯誤訊息用 `getResultErrorString()`。
- **Schema 驗證**：所有 WS 請求都會先跑 `tryDeserialize()`（`utils/messageSerializer.ts`）做 Zod 解析。
- **路徑安全**：用 `pathValidator.ts` 的 `isPathWithinDirectory()` 防路徑穿越；`config.getCanvasPath()` 內建檢查。
- **日誌**：用 `utils/logger.ts` 的 `logger.log(domain, action, msg)` / `logger.error()`，不要 `console.log`。Production 下會寫到 `~/Documents/ClaudeCanvas/logs/`。
- **測試**：`backend/tests/` 用 vitest，測試很完整（workflow / runExecution / integration providers / schedule / encryption 等都有 coverage）；改動核心 service 前先跑對應 test。
- **Skill 同步**：動 REST API = 改 `skill/claude-code-canvas/` 下的 reference；動 WebSocket event 則不用。

## 其他注意事項

- 沒有使用者認證機制，設計為純本地使用。對 AI 是最大權限（`bypassPermissions`），改動執行路徑要小心。
- CORS 預設允許 localhost / 192.168.x.x / ngrok（dev），production 只允許 local + `ALLOWED_ORIGINS` 白名單。
- 目前只支援 Claude Agent SDK（已登入的環境），**不支援 API Key**。
- 備份機制是 git push `~/Documents/ClaudeCanvas/` 到使用者設定的 remote；`encryption.key` 永遠不備份。
