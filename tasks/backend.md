# 後端實作計畫書：Gemini Pod 支援 Command Note 與 Repository Note

## 背景

目前 Gemini provider 在 `GEMINI_CAPABILITIES` 中將 `repository` 與 `command` 設為 `false`，導致 `assertCapability` 在 `commandHandlers` / `repositoryHandlers` 的 bind 流程被擋下，無法綁定。本次任務僅打開能力旗標並補測試，因為下游已 provider-agnostic：

- `tryExpandCommandMessage`（commandExpander）已不依賴 provider，會在 `chatHandlers` / `runChatHelpers` / `scheduleService` / `workflowExecutionService` / `integrationEventPipeline` / `workflowApi` 六條 caller 路徑於上游展開，再由 `streamingChatExecutor` 直接把展開結果交給 `provider.chat(ctx)` 的 `ctx.message`，Gemini 已能透過 `normalizeMessageToPromptText` 把 `<command>` 標籤轉為純文字 prompt
- `resolvePodCwd` 已 provider-agnostic，`streamingChatExecutor.resolveWorkspacePath` 統一呼叫，Gemini 已透過 `ctx.workspacePath` 注入 subprocess `cwd`

因此本任務只需放行 capability 並補測試，無需修改 Gemini provider 主邏輯與 chatHandlers 展開時機。

## 測試案例（先列名稱，實作於 Phase 2）

對應 `tasks/userflow.md` 的 12 個情境：

### Capability 與 Bind 流程（unit）
- `Gemini provider 的 capabilities.command 為 true`
- `Gemini provider 的 capabilities.repository 為 true`
- `Gemini provider 的 capabilities.plugin / mcp 維持 false`（避免誤開）
- `綁定 Command Note 到 Gemini Pod 不會觸發 CAPABILITY_NOT_SUPPORTED`
- `綁定 Repository Note 到 Gemini Pod 不會觸發 CAPABILITY_NOT_SUPPORTED`
- `從 Gemini Pod 解綁 Command Note 成功，podStore.commandId 變回 null`
- `從 Gemini Pod 解綁 Repository Note 成功，podStore.repositoryId 變回 null`

### Command Note 訊息展開（unit / integration）
- `Gemini Pod 綁定的 Command Note 訊息會被 prepend <command> 標籤後傳給 provider`（檢查送入 `provider.chat` 的 `ctx.message` 字串開頭）
- `Gemini Pod 綁定的 Command Note 來源已被刪除時，handleChatSendNormal 走 commandNotFound 分支，不呼叫 provider.chat`
- `Gemini Pod 沒有綁定 Command Note 時，訊息原樣傳給 provider，不含 <command> 標籤`

### Repository Note 工作目錄（unit / integration）
- `Gemini Pod 綁定 Repository Note 後，streamingChatExecutor 解析出 repositoriesRoot/<repositoryId> 作為 workspacePath`
- `Gemini Pod 沒綁定 Repository Note 時，workspacePath 為 pod.workspacePath`
- `Gemini Pod 的 repositoryId 路徑穿越（如 ../../etc）時，resolvePodCwd 拋錯`

### 同時綁定（integration）
- `Gemini Pod 同時綁定 Command Note 與 Repository Note 時，送出訊息會同時帶上 <command> 標籤且 cwd 為 repository 路徑`

### Provider 切換保留綁定（unit）
- `已綁 Command Note 的 Pod 從 Claude 切到 Gemini 後，pod.commandId 保留`
- `已綁 Repository Note 的 Pod 從 Claude 切到 Gemini 後，pod.repositoryId 保留`
- `已綁 Command Note 的 Pod 從 Gemini 切到 Claude 後，pod.commandId 保留`
- `已綁 Repository Note 的 Pod 從 Gemini 切到 Claude 後，pod.repositoryId 保留`

### Mock 邊界
- 必須 mock 的 wrapper：`commandService.read`（避免依賴實際 markdown 檔案 I/O）、`Bun.spawn`（Gemini subprocess 啟動，避免實際呼叫 gemini CLI）
- 不可 mock：`tryExpandCommandMessage` / `expandCommandMessage` 本體、`resolvePodCwd`、`assertCapability`、`createBindHandler` 工廠（這些是本次行為驗證的核心，必須走真實程式碼）
- 路徑驗證（`isPathWithinDirectory`）使用真實實作，但測試以受控的 `config.repositoriesRoot` 與 `config.canvasRoot` 暫時值（由既有測試 fixture 提供）

---

## Phase 1

A. 開放 Gemini Capability 旗標
  - [ ] 編輯 `backend/src/services/provider/capabilities.ts` 的 `GEMINI_CAPABILITIES`
    - 將 `repository` 從 `false` 改為 `true`
    - 將 `command` 從 `false` 改為 `true`
    - `plugin`、`mcp` 保持 `false`（不在本次範圍）
    - 同步更新此常數上方的註解描述（原文寫「Gemini Provider 僅支援 chat」需改為「Gemini Provider 支援 chat、command、repository；尚未支援 plugin / mcp」）

## Phase 2（可並行）

A. 更新 `capabilities.test.ts`
  - [ ] 修改 `backend/tests/unit/capabilities.test.ts` 中 `GEMINI_CAPABILITIES smoke 測試` 區塊
    - `repository 為 true`（原為 `false`）
    - `command 為 true`（原為 `false`）
    - `plugin 為 false` 與 `mcp 為 false` 維持

B. 新增 Bind / Unbind 整合測試
  - [ ] 新增測試檔 `backend/tests/handlers/geminiPodBinding.test.ts`
    - 建立 Gemini provider 的 Pod fixture，呼叫 `handlePodBindCommand` 與 `handlePodBindRepository`，斷言不會 emit `CAPABILITY_NOT_SUPPORTED`，且 `podStore.commandId` / `podStore.repositoryId` 寫入成功
    - 同檔中新增解綁 case：呼叫 `handlePodUnbindCommand` / `handlePodUnbindRepository`，斷言對應欄位被清為 `null`
    - 對照組（regression）：建立 Claude Pod 跑同樣流程，確保仍正常通過

C. 新增 Gemini + Command Note 訊息展開測試
  - [ ] 在 `backend/tests/provider/geminiProvider.test.ts` 新增測試（沿用既有 Gemini provider 測試檔案，不另開新檔）
    - 場景一：Pod 綁定 Command Note，呼叫 `geminiProvider.chat`，斷言進入 `Bun.spawn` 的 args 中 `--prompt` 後一個元素以 `<command>\n{markdown}\n</command>\n` 開頭（與 `expandCommandMessage` 實作對齊：`<command>` 與 markdown 之間僅 1 個 `\n`，`</command>` 之後有 1 個 `\n` 緊接原訊息，中間無空白行）
    - 場景二：Pod 無 commandId，斷言 `--prompt` 內容不含 `<command>` 標籤
    - 注意：本層測試不直接 mock `tryExpandCommandMessage`，而是透過上層 `chatHandlers` / 直接傳入展開後的 message，驗證 Gemini 能完整把展開字串送進 CLI
  - [ ] 整合層：新增 `backend/tests/handlers/chatHandlersGemini.test.ts`（既有 handlers 目錄不存在，於 tests 下新建 handlers 子目錄）
    - mock `commandService.read` 回傳已知 markdown
    - 觸發 `handleChatSendNormal` 對 Gemini Pod，斷言流入 `provider.chat` 的 `ctx.message` 完全等於 `` `<command>\n${markdown}\n</command>\n${原訊息}` ``（注意：`</command>` 後僅一個 `\n`，與原訊息直接相連，無額外空白行或結尾換行）
    - 邊界：`commandService.read` 回傳 `null`（檔案被刪除）時，斷言走 `handleCommandNotFound` 路徑，未呼叫 `executeStreamingChat` 內部 provider

D. 新增 Gemini + Repository Note 工作目錄測試
  - [ ] 於同檔 `backend/tests/handlers/chatHandlersGemini.test.ts` 新增以下案例（與 C 共用同一測試檔，避免測試檔案散落）
    - 設定 Pod `repositoryId = "demo-repo"`、provider = `gemini`
    - 觸發送訊息流程，攔截 `Bun.spawn` 呼叫，斷言 `cwd` 為 `path.resolve(config.repositoriesRoot, "demo-repo")`
    - 對照：`repositoryId = null` 時，`cwd` 為 `pod.workspacePath`
    - 路徑穿越：`repositoryId = "../etc"`，斷言 `resolvePodCwd` 拋出「非法的工作目錄路徑」，且 spawn 不被呼叫
  - [ ] 於 `backend/tests/unit/podPathResolver.test.ts` 新增 case：「repositoryId 對應目錄不存在時，現行行為固化」
    - 用一個指向不存在目錄的 `repositoryId`（例如 `"non-existent-repo-fixture"`，且該名稱通過路徑穿越驗證、實際路徑落在 `repositoriesRoot` 內但目錄未建立）
    - 呼叫 `resolvePodCwd(pod)`，斷言**現行行為**：函式不檢查目錄存在性與權限，直接回傳 `path.resolve(path.join(config.repositoriesRoot, "non-existent-repo-fixture"))`，不拋錯
    - 用途：把「`resolvePodCwd` 不負責檢查目錄存不存在/有無權限」這個現狀鎖住，作為迴歸防線；本次不修改 `resolvePodCwd` 實作

E. 新增同時綁定整合測試
  - [ ] 同檔新增一個 case：Gemini Pod 同時設 `commandId` 與 `repositoryId`
    - 斷言 spawn 的 `cwd` 為 repository 路徑
    - 斷言 spawn 的 `--prompt` 開頭含 `<command>` 標籤

F. Provider 切換保留綁定測試
  - [ ] 在既有檔 `backend/tests/unit/podStoreIntegration.test.ts` 內新增 describe：`Provider 切換保留 Note 綁定`（沿用既有 podStore 整合測試檔，不另開新檔）
    - 建 Pod with `commandId = "X"` provider = claude → `podStore.setProvider(canvasId, podId, "gemini")` → 斷言 `commandId` 仍為 `"X"`
    - 同上對 `repositoryId` 做測試
    - 反向：gemini → claude，斷言兩個欄位仍保留
    - 注意：此測試只驗證 podStore 層欄位保留，不需呼叫 capability 閘門（capability 閘門只在 bind handler 觸發，切 provider 不過該閘門）

## Phase 3

A. 全測試與型別檢查
  - [ ] 在 `backend/` 目錄執行 `bun run test`，確認新增測試與既有測試全部通過
  - [ ] 在 `backend/` 目錄執行 `bun run style`，確認無 eslint / type 錯誤
  - [ ] 確認前端 `frontend/src/stores/providerCapabilityStore` 相關測試或 fixture 中若有 GEMINI capability 期望值，與本次後端設定（`{ chat: true, plugin: false, repository: true, command: true, mcp: false }`）一致；若不一致則同步修正前端期望值（雙向鎖定，避免後端開能力但前端測試仍鎖在舊值）
  - [ ] 通知使用者重啟後端（因 `capabilities.ts` 屬後端程式碼變更，依專案 CLAUDE.md 規定須提醒）
