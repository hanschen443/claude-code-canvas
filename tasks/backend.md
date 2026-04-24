# 後端實作計畫書：Command 跨 Provider 統一展開

## 背景與目標

目前 Command 展開依賴 Claude SDK 內建的 `/name` slash command 解析，導致 Codex Pod 無法使用 Command。本計畫將 Command 展開邏輯搬到後端上層，統一組裝 `<command name="...">{markdown}</command>` 純文字後再交給 Provider，讓 Claude 與 Codex 皆能相容。

### 技術決議摘要

- Command 展開位置：`streamingChatExecutor.ts`（上層、執行串流「之前」）。統一進入點、Normal 與 Run mode 都會過這裡。
- Command 內容讀取：擴充 `commandService` 新增 `read(id)` 方法，內部直接使用 `createMarkdownResourceService` 既有的 `getContent(id)`，並採用 **mtime（檔案修改時間）快取策略**（非純 TTL），確保外部修改（包含但不限於：git pull、檔案同步、終端機直接編輯、未來可能新增的檔案編輯器 API）都能被立即感知。
- Codex `command` capability 從 `false` 改為 `true`，並移除 Claude 端既有的 `/name` 前綴邏輯。
- **不做向後相容**：舊的 `/name` 前綴組裝程式碼（`buildPrompt`、`buildClaudeContentBlocks` 的 prefix 邏輯、`buildDisplayContentWithCommand`）全數刪除或縮簡。
- Command 檔案不存在的錯誤處理：yield `error` NormalizedEvent（fatal=false），讓使用者在前端看到「Command 「{name}」已不存在，請至 Pod 設定重新選擇或解除綁定。」的具體提示文字（由後端 `handleErrorEvent` 根據 error code 分派，詳見下方「Command 找不到錯誤訊息分派」章節）；**Pod 狀態回到 `idle`（可恢復錯誤），不被標為 `error`**，使用者只需重新選 command 即可繼續。

## 測試案例（先列名稱，最後實作）

### 單元測試

1. `commandService.read` 對存在的 commandId 回傳 markdown 內容
2. `commandService.read` 對不存在的 commandId 回傳 `null`
3. `commandService.read` 於 mtime 未變時命中快取，不重複讀檔（以 spy `fs.readFile` 驗證呼叫次數）
4. `commandService.read` 在 `update` / `delete` / `create` / `setGroupId` 後快取被清除（既有 `invalidateCache` 路徑）
4a. **`commandService.read` 在外部改檔（mtime 變動）後自動重讀**：直接以 `fs.writeFile` 繞過 service 修改檔案內容並更新 mtime，驗證下一次 `read` 會回新內容，不等 TTL
5. 新增純函式 `expandCommandMessage(message, commandName, markdown)`：string 訊息包上 `<command>` 標籤
6. `expandCommandMessage`：ContentBlock[] 訊息在第一個 text block 前插入 `<command>` 標籤
7. `expandCommandMessage`：ContentBlock[] 無 text block（僅圖片）時，於陣列最前插入一個 text block 承載 `<command>` 標籤
8. `expandCommandMessage`：Pod 無 commandId（null）時原樣回傳，不做展開
9. Claude `buildPrompt`：不再讀取 commandId，始終把 message 直接當成 prompt
10. Codex capability：`CODEX_CAPABILITIES.command === true`

### 整合測試

11. Claude Pod + commandId：`chat send` 送出後 Provider 收到的訊息含 `<command>` 標籤、無 `/name` 前綴
12. Codex Pod + commandId：`chat send` 送出後 CLI stdin 收到展開後的純文字
13. Command 檔案不存在：前端收到 error 串流事件（fatal=false），Pod 狀態回到 `idle`（非 `error`）；接著重新設定有效 command 再送訊息可正常執行（驗證無狀態殘留）
14. Pod 無 commandId：訊息原樣送出，不做任何展開
15. Pod 輸入看似 `/xxx` 的純文字（無綁定 Command）：訊息被當成一般文字送給 Provider
16. 同一個 Command 在 Claude Pod 與 Codex Pod 分別送訊息：兩邊 Provider 收到的展開訊息一致
17. Capability guard 現況迴歸：Codex + `multiInstance=true`（Run mode）仍被擋下，只有 `command: true` 被放行
18. **Pod 已綁 Command 且使用者輸入 `/help`（或任何看似斜線指令的純文字）**：後端不做斜線 parsing，展開後 Provider 收到的訊息格式為：
    ```
    <command name="xxx">
    {command 內容}
    </command>
    /help
    ```
    Claude 與 Codex 兩端行為一致（兩邊 Provider 收到的 ctx.message 相同，皆為上述純文字，`/help` 不被視為 slash command）

### 錯誤訊息分派測試案例（Phase 2 E 對應）

19. `buildCommandNotFoundMessage('my-cmd')` 回傳 `'Command 「my-cmd」已不存在，請至 Pod 設定重新選擇或解除綁定。'`（zh-TW、全形引號與句號）
20. `handleErrorEvent` 收到 `{ type: 'error', error: '任何訊息', fatal: false, code: 'COMMAND_NOT_FOUND' }` 時：推送給前端的 text 為原 `error` 字串（非通用警告）；server log 仍記錄原訊息
21. `handleErrorEvent` 收到 `{ type: 'error', error: 'xxx', fatal: false }`（無 code）時：推送通用警告 `'\n\n⚠️ 發生錯誤，請稍後再試'`（現況行為不變）
22. `handleErrorEvent` 收到 `{ type: 'error', error: 'xxx', fatal: false, code: '未白名單值' }` 時：視為無 code，推送通用警告（安全白名單把關）
23. `handleErrorEvent` 收到 `{ type: 'error', error: '極長訊息（>500 字元）', fatal: false, code: 'COMMAND_NOT_FOUND' }` 時：推送文字被 truncate 至 500 字元
24. `handleErrorEvent` 收到 `{ fatal: true, code: 'COMMAND_NOT_FOUND' }` 時：依舊 throw（code 不影響 fatal 分支）
25. `normalizedEventToStreamEvent` 將 `NormalizedEvent.error` 的 `code` 欄位帶入回傳的 `StreamEvent.error`
26. **整合測試**：commandId 指向不存在檔案時，前端收到的最終訊息文字為 `'Command 「xxx」已不存在，請至 Pod 設定重新選擇或解除綁定。'`（非通用警告）；Pod 狀態為 `idle`；再次送訊息（已 unbind command）可正常執行

## 實作計畫

### Phase 1（可並行）

A. 擴充 `commandService.read`
  - [ ] 在 `backend/src/services/commandService.ts` 新增 `read(id: string): Promise<string | null>` 方法
    - 讀取路徑規則沿用 `baseService.findFilePath(id)` 取得實際檔案路徑，再自行 `fs.stat` + `fs.readFile`（需要 mtime 所以不能直接用 `getContent`）
    - id 不合法或檔案不存在 → 回傳 `null`，不丟錯
    - **快取策略：mtime-based（非純 TTL）**，資料結構：
      ```ts
      cachedCommandContents: Map<string, { content: string; mtimeMs: number; filePath: string }>
      ```
      流程：
      1. `findFilePath(id)` 取得 filePath（找不到 → 清掉此 id 快取並回 `null`）
      2. `fs.stat(filePath)` 取得目前 `mtimeMs`
      3. 若快取存在且 `filePath` 相同且 `mtimeMs` 相同 → 直接回快取內容
      4. 否則 `fs.readFile` 重讀，更新快取 entry（content、mtimeMs、filePath 一併寫入）
    - **不再使用 30 秒 TTL**：mtime 本身即為「內容是否變動」的權威依據，避免「外部改檔最差要等 30 秒」的問題
    - 效能考量：mtime 檢查每次多一個 `fs.stat`，但遠低於 `fs.readFile` 成本；若未來熱路徑性能有需求再導入「上層短 TTL + mtime 雙層」策略
  - [ ] 在既有 `invalidateCache()` 內順便清除 `cachedCommandContents`（保留此呼叫作為「立即失效」的保險，mtime 不變但 id 重映射的情境仍需要）
  - [ ] 確認 `create` / `update` / `delete` / `setGroupId` 呼叫 `invalidateCache()` 後 read 快取也被清除
  - [ ] **注意**：`list()` 目前仍是 30 秒 TTL，本次不改動 list 行為（list 只影響側欄清單顯示，延遲容忍度高；read 影響展開正確性，必須即時）

B. Capability 調整
  - [ ] `backend/src/services/provider/capabilities.ts`（18-30）：`CODEX_CAPABILITIES.command` 由 `false` 改為 `true`
  - [ ] 確認 `CODEX_CAPABILITIES` 物件維持 `Object.freeze` 封存

C. 新增 Command 展開純函式模組
  - [ ] 新檔 `backend/src/services/commandExpander.ts`
    - export `expandCommandMessage(params: { message: string | ContentBlock[]; commandName: string; markdown: string }): string | ContentBlock[]`
    - 組裝標籤字串：```<command name="${commandName}">\n${markdown}\n</command>\n```
    - string 訊息 → 回傳「標籤 + 原字串」的單一字串
    - ContentBlock[] 訊息 → 找到第一個 type='text' 的 block，把標籤字串 prepend 到 `text` 欄位前
    - ContentBlock[] 全無 text block（例如只有圖片）→ 在陣列最前插入一個 `{ type: 'text', text: 標籤字串 }` 
    - 標籤字串裡的 `commandName` 採用 `commandId`（檔名即名稱，已通過 validateResourceId）
    - 錯誤訊息（若未來需擴充）統一 zh-TW
  - [ ] 匯出常數 `COMMAND_EXPAND_FALLBACK_MESSAGE`（供整合錯誤處理使用，例如 `Command 不存在，請在 Pod 上重新選擇或解除綁定`）

### Phase 2

A. 在 streamingChatExecutor 注入 Command 展開
  - [ ] 修改 `backend/src/services/claude/streamingChatExecutor.ts` `executeStreamingChat`
    - 位置：取得 `pod` 物件之後、呼叫 `resolveWorkspacePath` 之前
    - 邏輯：
      - 若 `pod.commandId == null` → `finalMessage = options.message`，不做任何事
      - 若 `pod.commandId != null`：
        - 呼叫 `commandService.read(pod.commandId)`
        - 讀不到（null）→ 進入「Command 遺失復原流程」（見下方）
        - 讀到 → 呼叫 `expandCommandMessage({ message, commandName: pod.commandId, markdown })` 取得 `finalMessage`
      - 將 `finalMessage` 放進 `ctxWithoutSignal.message`（取代原本 `message`）
    - 取得 pod 之後，streamContext 內的 `message` 不需要同步（streamingCallback / persist 與原始 message 無關），但 `ctxWithoutSignal.message` 必須是展開後的版本

  - [ ] **Command 遺失復原流程（明確狀態轉移規約）**
    - 先決條件：`strategy.onStreamStart(podId)` 已在上方呼叫，但 `abortRegistry.register` 尚未發生（因為還沒進入 `runProviderStream`）
    - 推送 error 事件給前端：`streamingCallback({ type: 'error', error: buildCommandNotFoundMessage(commandId), fatal: false, code: 'COMMAND_NOT_FOUND' })`（fatal=false 確保 `handleErrorEvent` 不 throw；`code` 欄位為本計畫新增，詳見下方「Command 找不到錯誤訊息分派」章節）
    - **不呼叫 `strategy.onStreamError`**（語意上這條路徑是「前置驗證失敗」而非「串流錯誤」，且 Run mode 的 `onStreamError` 只 unregister active stream，不負責回 idle）
    - 改為直接呼叫 `strategy.onStreamComplete(podId, undefined)`（sessionId 傳 undefined）以達成：
      - Normal mode：`setStatus('idle')`，pod 狀態回到可再次送訊息
      - Run mode：`unregisterActiveStream` + 不寫 session ID（本來就沒產生 session）
    - 這樣處理的理由：
      1. Command 找不到屬於「使用者可恢復的設定錯誤」，不應把 Pod 標成 `error` 狀態卡住
      2. `onStreamComplete` 在語意上代表「本輪對話流程結束（無副作用）」，與「訊息根本沒送出 Provider」吻合
      3. Run mode 的 `errorPodInstance`（onStreamError 實際會做的事）會觸發 Run 終止，本次錯誤不應升級為整個 Run fail
    - `return` 一個非 aborted 的結果：`{ messageId, content: '', hasContent: false, aborted: false }`；**不 throw exception**，避免被外層 catch 走到 `handleStreamError` → `strategy.onStreamError` → Run mode 變 errorPodInstance
    - `abortRegistry`：尚未 register，無需 unregister

  - [ ] 抽一個私有函式 `prepareMessageWithCommand(pod, message, streamContext, streamingCallback)` 負責上述讀檔 + 展開 + 錯誤回報，回傳 `{ ok: true; message: string | ContentBlock[] } | { ok: false }`，避免 `executeStreamingChat` 主體變得過長
  - [ ] `executeStreamingChat` 收到 `{ ok: false }` 時走上述「呼叫 `onStreamComplete` + return 空結果」的流程，**不進入 `runProviderStream`，不走 `handleExecutionError`**
  - [ ] `callbacks.onComplete` 在此路徑下**不呼叫**（因為沒有實際完成一次對話，訊息從未抵達 Provider；若呼叫會誤觸發上層「turn 結束」副作用）

B. 移除 Claude 端舊的 Command 前綴邏輯
  - [ ] `backend/src/services/provider/claude/runClaudeQuery.ts`（80-96）`buildPrompt` 改寫：
    - 移除 `commandId` 參數
    - 移除 `commandId ? /${commandId} ${message} : message` 行為
    - string 訊息：僅保留「空白訊息以 `請開始執行` 兜底」的邏輯
    - ContentBlock[] 訊息：呼叫 `buildClaudeContentBlocks(message)`（參數也需移除 commandId）
  - [ ] 移除 `runClaudeQuery` 內暫存的 `const commandId: string | null = null;` 與對 `buildPrompt` 傳遞 commandId 的參數
  - [ ] `backend/src/services/claude/messageBuilder.ts`：
    - `buildClaudeContentBlocks` 移除 `commandId` 參數與 `prefix` / `prefixApplied` 機制
    - 刪除 `applyCommandPrefix`、`convertBlockToContent` 內 prefix 分支（convertBlockToContent 也簡化為純轉換函式或直接 inline）
    - 保留「全部略過後 fallback 為 `請開始執行`」兜底

C. 移除 chatHelpers 的展示前綴邏輯
  - [ ] `backend/src/utils/chatHelpers.ts`：
    - 刪除 `buildDisplayContentWithCommand`
    - 移除所有引用處（搜尋整個 `backend/src` 的 `buildDisplayContentWithCommand` 使用，應主要落在 `injectUserMessage` 相關路徑；本次因為訊息已在上層被展開，所以訊息記錄 DB 的 `displayContent` 直接用原始 `message`，不加前綴）
  - [ ] 確認 `injectUserMessage` 呼叫端傳的 `content` 是「使用者輸入原文」，而非展開後的版本（展開版只給 Provider，不進 DB 與不廣播給前端）

D. Capability guard 擴充 Command 檢查（放行即無需阻擋，但要驗證現況不會誤擋）
  - [ ] 檢視 `backend/src/handlers/chatHandlers.ts`（85-98）現有的 Run mode guard，不做修改
  - [ ] 確認沒有其他針對 `pod.commandId + pod.provider==='codex'` 的擋下邏輯（搜尋 `commandId` 的 guard 條件）
  - [ ] 若有，一併移除以符合放行意圖

E. Command 找不到錯誤訊息分派（採用方案 1：structured error payload）

  **背景**：目前 `handleErrorEvent`（`streamingChatExecutor.ts:222-244`）對所有 non-fatal error 一律覆蓋成通用警告文字 `「\n\n⚠️ 發生錯誤，請稍後再試」` 推送給前端，原始錯誤訊息只進 server log。此設計雖有資安上「避免洩漏內部錯誤細節」的優點，卻把「使用者可恢復的設定錯誤」也一併掩蓋，導致使用者無從得知具體問題（例如 Command 已不存在應重新選擇）。

  **決議**：採用方案 1（structured payload + code 分派），保留 error 語意並讓未來其他可恢復錯誤沿用同一機制。**不採方案 2**（偽裝 assistant system message），理由：
    1. 方案 2 會讓錯誤訊息進入對話歷史 DB，汙染後續 resume 語意
    2. 方案 2 混用 text 事件與錯誤處理路徑，違反「error 歸 error、text 歸 text」的事件語意
    3. 方案 1 集中在後端 `handleErrorEvent` 一處判斷，前端完全不動

  **具體訊息格式**：`「Command 「{commandId}」已不存在，請至 Pod 設定重新選擇或解除綁定。」`
    - zh-TW、全形引號與句號齊全
    - 由純函式 `buildCommandNotFoundMessage(commandId: string): string` 產生，放在 `commandExpander.ts` 內一併匯出（取代 Phase 1 C 提到的 `COMMAND_EXPAND_FALLBACK_MESSAGE` 常數：常數改為「生成訊息的工廠函式」，因為需要帶入 commandId）
    - **相容性過渡**：仍保留 `COMMAND_EXPAND_FALLBACK_MESSAGE` 常數做為「無法取得 commandId 時」的 fallback 文案（理論上不會發生，但留著作為最後防線）

  **型別擴充**（影響兩個型別檔）：
  - [ ] `backend/src/services/provider/types.ts`：`NormalizedEvent` 的 `error` 變體新增 optional `code?: string` 欄位
    - 定義一個 `RecoverableErrorCode` union type：`'COMMAND_NOT_FOUND'`（目前只有這個，未來可擴充）
    - 標註 JSDoc：`code` 僅用於「可恢復使用者錯誤」，系統錯誤不帶 code（維持通用警告路徑）
  - [ ] `backend/src/services/claude/types.ts`：`StreamEvent` 的 `error` 變體同步新增 optional `code?: string`
  - [ ] `normalizedEventToStreamEvent`（`streamingChatExecutor.ts:488`）：`error` case 要把 `ev.code` 一併帶進回傳物件

  **`handleErrorEvent` 改寫**（`streamingChatExecutor.ts:222-244`）：
  - [ ] 流程調整：
    1. 原始錯誤訊息照舊記入 server log（`logger.error`）
    2. 判斷 `event.code`：
       - 有 `code`（例如 `'COMMAND_NOT_FOUND'`）→ 直接使用 `event.error` 作為推送文字（該訊息已在產生端組裝成使用者友善格式）
       - 無 `code` → 沿用現有通用警告邏輯（`'\n\n⚠️ 發生錯誤，請稍後再試'` / `'\n\n⚠️ 發生嚴重錯誤，對話已中斷'`）
    3. `streamingCallback({ type: "text", content: 決議後的訊息 })` 推送（沿用既有以 text 事件攜帶警告文字的慣例，避免改動前端）
    4. `fatal === true` 依舊 throw，不受 code 影響
  - [ ] **安全性考量**：僅白名單內 `code` 值（例如 `COMMAND_NOT_FOUND`）才走「顯示原訊息」分支，避免 Provider 端誤帶未定義 code 導致原始錯誤細節洩漏；以 `const RECOVERABLE_CODES = new Set(['COMMAND_NOT_FOUND'])` 把關
  - [ ] **訊息長度防呆**：顯示原訊息前 truncate 到合理長度（例如 500 字元），避免惡意長訊息灌版

  **產生端**（`streamingChatExecutor.ts` 的 `prepareMessageWithCommand`）：
  - [ ] `commandService.read` 回 null 時組 error 事件：
    ```ts
    streamingCallback({
      type: 'error',
      error: buildCommandNotFoundMessage(pod.commandId),
      fatal: false,
      code: 'COMMAND_NOT_FOUND',
    });
    ```
  - [ ] `commandService.read` I/O 拋錯時同樣包成 `COMMAND_NOT_FOUND`（從使用者角度兩者都是「拿不到內容」，不區分）

  **不影響項目**：
  - Pod 狀態依然走 `strategy.onStreamComplete(podId, undefined)` 回 idle（與 Phase 2 A 規約一致）
  - 前端 `handleErrorEvent`（`frontend/src/stores/chat/chatConnectionActions.ts:126`）**完全不動**
  - 前端訊息顯示路徑（`text` 事件走 `POD_CLAUDE_CHAT_MESSAGE` 或類似既有 text 推送通道）**完全不動**
  - `callbacks.onComplete` 不呼叫（與 Phase 2 A 一致）

### Phase 3

A. 測試補齊（可並行子項）
  - [ ] 單元測試 `backend/tests/unit/commandService.test.ts`（新增）
    - 對應上方測試案例 1-4、**4a（mtime 外部改檔自動重讀）**
  - [ ] 單元測試 `backend/tests/unit/commandExpander.test.ts`（新增）
    - 對應上方測試案例 5-8
  - [ ] 單元測試 `backend/tests/unit/messageBuilder.test.ts`（修改既有）
    - 更新測試：`buildClaudeContentBlocks` 不再接 commandId；刪除 prefix 相關測試
    - 對應上方測試案例 9
  - [ ] 整合測試 `backend/tests/integration/command.test.ts`（擴充既有）
    - 對應上方測試案例 11-17、**18（`/help` 不被特殊處理）**
    - 針對 Codex 整合測試採用 mock 方式驗證 `codexProvider.chat` 收到的 `ctx.message` 已含 `<command>` 標籤（spy provider，不實際啟動 codex CLI）
    - Command 檔案不存在情境（案例 13）：mock `commandService.read` 回 null，驗證：
      1. error 事件被推送給前端（fatal=false）
      2. Pod 狀態回到 `idle`（透過 spy `strategy.onStreamComplete` 被呼叫、`strategy.onStreamError` 未被呼叫）
      3. `callbacks.onComplete` 未被呼叫
      4. 後續再送一條訊息（把 commandId unbind）可正常執行（驗證無狀態殘留）
    - `/help` 案例（案例 18）：Pod 綁 commandId，使用者送 `/help`，spy Provider 收到的 `ctx.message` 為 `<command name="xxx">\n{markdown}\n</command>\n/help` 格式字串
  - [ ] 單元測試 `backend/tests/unit/streamingChatExecutor.test.ts`（擴充既有）
    - 驗證 `prepareMessageWithCommand` 讀檔成功 → ctx.message 被改寫
    - 驗證讀檔失敗 → streamingCallback 收到 error 事件（帶 `code: 'COMMAND_NOT_FOUND'`）+ `strategy.onStreamComplete` 被呼叫（非 `onStreamError`）
    - 對應上方測試案例 20-25：`handleErrorEvent` 的 code 分派邏輯（白名單、truncate、fatal 不受 code 影響等）
  - [ ] 單元測試 `backend/tests/unit/commandExpander.test.ts`（前述已建立）額外涵蓋
    - 對應上方測試案例 19：`buildCommandNotFoundMessage` 訊息格式正確（全形引號、句號、zh-TW）
  - [ ] 整合測試 `backend/tests/integration/command.test.ts`（擴充）
    - 對應上方測試案例 26：commandId 指向不存在檔案，驗證前端（透過 spy `streamingCallback` 或 emit 層）收到的 text 為具體訊息而非通用警告；Pod 狀態為 idle；後續再送訊息（unbind 後）可正常執行
  - [ ] 執行 `bun run test` 全綠
  - [ ] 執行 `bun run style` 無 eslint/ts 錯誤

B. 文件與收尾
  - [ ] 告知使用者：「後端程式碼已改動，請重啟後端服務」
  - [ ] 本次不需更新 skill（WebSocket 訊息合約未變更；只是內部展開邏輯搬家）
  - [ ] 確認無殘留 dead code：搜尋 `buildDisplayContentWithCommand`、`applyCommandPrefix`、`commandId ? \`/\${commandId}` 等 pattern，全數清乾淨

## 參考：資料流向

```
handleChatSend (chatHandlers.ts)
  └─ injectUserMessage（以原始 message 存 DB / 廣播給前端）
  └─ executeStreamingChat
       └─ strategy.onStreamStart(podId)
       └─ prepareMessageWithCommand(pod, message)   ← 新增
            ├─ pod.commandId == null → { ok: true, message: 原樣 }
            ├─ pod.commandId != null & read 成功 → { ok: true, message: expandCommandMessage(...) }
            └─ pod.commandId != null & read 失敗 → 推 error 事件 + 回 { ok: false }
                 └─ executeStreamingChat 收到 { ok: false }：
                      └─ strategy.onStreamComplete(podId, undefined)   // 回 idle，非 error
                      └─ return { messageId, content:'', hasContent:false, aborted:false }
                         （不呼叫 callbacks.onComplete，不進 runProviderStream）
       └─ runProviderStream → provider.chat(ctx)  ← ctx.message 已是展開後純文字
            ├─ Claude: buildPrompt（不再接 commandId）
            └─ Codex: buildPromptText（原樣寫入 stdin）
```

## 錯誤處理矩陣

| 情境 | error code | 後端行為 | Pod 狀態 | 前端顯示結果 |
|------|-----------|---------|---------|------------|
| pod.commandId 為 null | - | 不展開，原樣傳遞 | 正常串流 | 正常對話輸出 |
| commandService.read 回 null（檔案不存在） | `COMMAND_NOT_FOUND` | 推送 `error` 事件（fatal=false、帶 code）→ 呼叫 `strategy.onStreamComplete(podId, undefined)`，**不走 `onStreamError`**，不實際送 Provider，`callbacks.onComplete` 不呼叫 | `idle`（Normal）/ 解除 active stream（Run） | `Command 「{commandId}」已不存在，請至 Pod 設定重新選擇或解除綁定。` |
| commandService.read 讀檔拋錯（I/O error） | `COMMAND_NOT_FOUND` | 同上，以 try-catch 包住，統一轉為 `error` 事件 + `onStreamComplete` 路徑 | `idle` | 同上（使用者視角同屬「拿不到 command」） |
| 展開後訊息為空字串 | - | 依 Provider 各自兜底（Claude 走「請開始執行」） | 正常串流 | 正常對話輸出 |
| 使用者輸入 `/help`（或任何看似斜線指令）且 Pod 已綁 commandId | - | 不特殊處理，原字串 `/help` 作為 `expandCommandMessage` 的 message 參數，輸出為 `<command name="xxx">...</command>\n/help` 純文字送 Provider | 正常串流 | 正常對話輸出 |
| Provider 串流中其他非致命錯誤（未帶 code） | - | `handleErrorEvent` 推送通用警告文字，原訊息只進 server log | 正常串流 | `\n\n⚠️ 發生錯誤，請稍後再試` |
| Provider 串流致命錯誤（fatal=true） | - | `handleErrorEvent` 推送嚴重錯誤文字後 throw，由 `handleStreamError` 接手 → `strategy.onStreamError` | `error` | `\n\n⚠️ 發生嚴重錯誤，對話已中斷` |

**error code 白名單機制**：只有 `RECOVERABLE_CODES` Set 內列出的 code（目前僅 `COMMAND_NOT_FOUND`）會讓 `handleErrorEvent` 把原 `error.error` 訊息直接顯示給使用者；未白名單的 code 視為無 code 處理（走通用警告），確保 Provider 意外帶出內部錯誤細節時不會洩漏。

## 向後相容性

**不保留向後相容**：前端送進來的 message 不再允許也不再偵測 `/name` 前綴，後端一律視為純文字。若舊前端誤送 `/name xxx` 格式，會被視為普通文字，不做任何特別處理（符合 userflow「看似斜線指令應視為一般訊息」情境）。

## ContentBlock[] 展開策略

`expandCommandMessage` 對 ContentBlock[] 的處理：

1. 陣列內「存在」text block → 在第一個 text block 的 `text` 前 prepend `<command>...</command>\n`（不新增 block，減少對下游不必要的結構變動）
2. 陣列內「只有」image block → 在陣列最前插入 `{ type: 'text', text: '<command>...</command>' }`（Claude SDK 的 message 結構允許 text+image 混合）
3. 空陣列 → 交由後續 fallback（Claude 的 `buildClaudeContentBlocks` 已有「請開始執行」兜底）

## 重啟提醒

完成後請告知使用者：「本次改動 `commandService`、`commandExpander`（新增，含 `buildCommandNotFoundMessage`）、`streamingChatExecutor`（含 `handleErrorEvent` code 分派）、`provider/types`（`NormalizedEvent.error.code`）、`claude/types`（`StreamEvent.error.code`）、`capabilities`、`runClaudeQuery`、`messageBuilder`、`chatHelpers` 等後端檔案，請重啟後端服務以套用變更。」
