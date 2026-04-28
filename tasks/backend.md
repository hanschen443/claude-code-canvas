# Backend 計畫書 - 拖曳檔案到 Pod 觸發 Agent

## 測試案例（按 user flow 對應）

1. `chatSendSchema` 接受合法 `attachments`、拒絕空陣列、拒絕含 `..` 或空白 filename、拒絕非 base64
2. `chatSendSchema` 在 attachments 解碼後總大小 > 20 MB 時驗證失敗（用 `length * 3 / 4` 快擋）
3. attachments 寫入模組：collision rename（`plan.md` → `plan-1.md` → `plan-2.md`）
4. attachments 寫入模組：filename sanitize（去 path、拒空字串/純空白/`..`）
5. attachments 寫入模組：磁碟空間不足（free < total + 100 MB margin）→ reject 且不留下 staging
6. attachments 寫入模組：寫到中途失敗 → 清掉 staging、不 rename、回 error
7. attachments 寫入模組：成功寫入後 atomic rename 為正式目錄
8. attachments 寫入模組：handler 端嚴格判定（`Buffer.from(base64).length`），總 bytes > 20 MB 時 throw
9. `messageStore.addMessage` / `runStore.addRunMessage` 接受外部傳入的 id；不傳則內部產 uuid（向後相容）
10. `handleChatSend`：串行 idle pod 收到 attachments 時，組出 zh-TW 觸發訊息（含絕對路徑與檔名清單）並呼叫 `injectUserMessage`，且 DB 中 message id == attachments dir 的 id
11. `handleChatSend`：串行 busy pod 收到 attachments 時 emit `POD_BUSY` 錯誤、不寫檔
12. `handleChatSend`：multi-instance pod 收到 attachments 時呼叫 `launchMultiInstanceRun` 並落地檔案，runMessage id == attachments dir 的 id
13. `handleChatSend`：attachments 為 0 個時直接 reject、不建 chat message
14. `handleChatSend`（衍生需求：command 注入 + attachments 共存）：command 展開後 `<command>...</command>` 附加在 attachments 觸發訊息前，DB 落地與送 LLM 內容一致
15. 磁碟檢查 fallback：`fs.statfs` 不存在 / throw 時 fallback 到 `df -k`，兩者皆 fail 時跳過檢查（不阻擋寫入）並 log warn
16. tmp 清理 task：刪除 mtime > 24h 的子目錄、保留 ≤ 24h 的子目錄
17. tmp 清理 task：tmp/ 不存在時靜默跳過（首次啟動）
18. tmp 清理 task：每小時 tick 一次，清理失敗時 log 但不 crash

---

## 重要前提

- 後端只負責 emit i18n key 與 error code，**locale 翻譯由前端計畫書負責**，本計畫書不動 `/frontend/src/locales/*.json`
- 20 MB 上限的語意：**base64 解碼後** 的原始檔案總 bytes（與前端 `file.size` 同語意）
  - schema 層：用 `length * 3 / 4` 估算（fast path，避免大字串實際解碼）
  - handler / writer 層：用 `Buffer.from(base64, 'base64').length` 嚴格判定（精準）
- 前端 drop 觸發時 `payload.message` **永遠是空字串**（前端設計如此），後端不需處理「使用者打字 + attachments」混合輸入路徑
- 既有邏輯不動：`POD_BUSY`、`launchMultiInstanceRun`、`tryExpandCommandMessage`、`podDownloadApi`、workspace 結構

---

## 實作計畫

### Phase 1（可並行）

A. 擴充 ChatSendPayload schema
  - [ ] 修改 `/backend/src/schemas/chatSchemas.ts`
    - 新增 `attachmentSchema`（z.object）：
      - `filename`: `z.string().min(1).max(255)`，加 `.refine` 拒絕純空白、拒絕含 `..` 或路徑分隔符（用 `path.basename()` 後仍等於原值才算合法）
      - `contentBase64`: `z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/)`
    - 在 `chatSendSchema` 加入 optional 欄位 `attachments`，型別為 `z.array(attachmentSchema).min(1).max(50).optional()`
    - 在 `chatSendSchema` 上加 `.superRefine`：當 `attachments` 存在時，計算所有 `contentBase64` 的快速估算總 bytes（公式：`Σ (length * 3 / 4 - padding 個數)`），> 20 MB 直接 fail，error 訊息使用 zh-TW 並標示這是「base64 解碼後總 bytes」
    - 註：handler 與 writer 層仍會用 `Buffer.from(...).length` 做嚴格判定，schema 層只負責快擋大量明顯超量的 payload
    - 同步匯出新型別 `Attachment` 與 `AttachmentInput`
  - [ ] 確認 `chatSendSchema` 在 `/backend/src/handlers/groups/chatHandlerGroup.ts` 仍正確 import（不需改）

B. 定義 attachments 錯誤代碼 / 自訂 Error class
  - [ ] 修改 `/backend/src/types/errorCodes.ts`（或專案中對應 error code 集中檔；若無則新建 `/backend/src/types/attachmentErrors.ts`）
    - 新增 error code 常量：
      - `ATTACHMENT_EMPTY`
      - `ATTACHMENT_TOO_LARGE`
      - `ATTACHMENT_INVALID_NAME`
      - `ATTACHMENT_DISK_FULL`
      - `ATTACHMENT_WRITE_FAILED`
    - 對應 i18n key（後端只 emit key，前端負責翻譯）：
      - `errors.attachmentEmpty`
      - `errors.attachmentTooLarge`
      - `errors.attachmentInvalidName`（params: `{ name }`）
      - `errors.attachmentDiskFull`
      - `errors.attachmentWriteFailed`
  - [ ] 在 `attachmentWriter.ts` 同模組或共用 errors 模組定義自訂 Error class：
    - `AttachmentInvalidNameError`（帶 `name` field）
    - `AttachmentTooLargeError`
    - `AttachmentDiskFullError`
    - `AttachmentWriteError`
    - 每個 class 帶上對應 error code 與 i18n key，方便 handler 統一處理

C. 新增 APP_DATA_DIR tmp 路徑常量
  - [ ] 修改 `/backend/src/config/index.ts`
    - 在 `Config` interface 加 `tmpRoot: string`
    - 在 `loadConfig` 設 `tmpRoot = path.join(dataRoot, "tmp")`
    - 對應到既有的 `appDataRoot`（拖檔案要落地到 `<APP_DATA_DIR>/tmp/`）

### Phase 2（可並行）

A. 重構 messageStore.addMessage 接受外部 id
  - [ ] 修改 `/backend/src/stores/messageStore.ts`
    - 在 `addMessage` 的參數 object 加上 optional `id?: string`
    - 邏輯：若 caller 傳入 `id`，使用該 id 寫入 DB；未傳則維持原本內部 `uuidv4()` 行為
    - 不變更回傳型別與其餘 side effect
  - [ ] 既有呼叫端不傳 id 的繼續走內部 uuid 路徑（向後相容免改）
  - [ ] 在 JSDoc 註明：當 caller 需要讓「外部資源（如附件目錄）的路徑」與 message id 對齊時可傳入

B. 重構 runStore.addRunMessage 接受外部 id
  - [ ] 修改 `/backend/src/stores/runStore.ts`
    - 在 `addRunMessage` 的參數 object 加上 optional `id?: string`
    - 邏輯：若 caller 傳入 `id`，使用該 id 寫入 DB；未傳則內部產生 uuid
    - 不變更回傳型別與其餘 side effect
  - [ ] 既有呼叫端不傳 id 繼續走內部 uuid 路徑（向後相容免改）
  - [ ] 在 JSDoc 註明同 A 的用途

C. 新增 attachments 寫檔模組
  - [ ] 建立 `/backend/src/services/attachmentWriter.ts`
  - [ ] 匯出 `writeAttachments(chatMessageId, attachments)`：
    - 入口先檢查 `attachments.length === 0` → throw `AttachmentInvalidNameError`/`AttachmentWriteError`（多一道防線；schema 已擋）
    - 對每個 `filename` 跑 sanitize：`path.basename(filename)`，trim 後若空字串、`..`、`.` 一律 throw `AttachmentInvalidNameError`
    - 計算總 byte size：對每個 attachment 跑 `Buffer.from(contentBase64, 'base64').length` 加總（嚴格判定），若 > 20 MB throw `AttachmentTooLargeError`
    - 呼叫 disk space check helper（見 D）；若回報空間不足 throw `AttachmentDiskFullError`
    - 解出 collision rename 後的最終 filename：傳入順序逐個比對已決定的 filename set，重複則加 `-1`、`-2`...（基底名 + 副檔名分離處理，例：`plan.md` → `plan-1.md`，`a` → `a-1`）
    - 建 staging 路徑 `<tmpRoot>/<chatMessageId>.staging/`，`fs.mkdir(..., { recursive: true })`
    - 逐檔 `fs.writeFile(stagingPath/finalFilename, Buffer.from(base64, 'base64'))`
    - 全部成功 → `fs.rename(staging, <tmpRoot>/<chatMessageId>/)`，return `{ dir, files }`（`dir` 為絕對路徑、`files` 為最終 filename 清單，依輸入順序）
    - 任一步失敗 → `fs.rm(staging, { recursive: true, force: true })` 後 rethrow（包成對應 Error class）

D. 磁碟空間檢查 helper（含 fallback）
  - [ ] 在 `/backend/src/services/attachmentWriter.ts` 內部或抽出成 `/backend/src/services/diskSpace.ts`
  - [ ] 匯出 `checkDiskSpace(targetDir, requiredBytes)`：
    - safety margin 維持 `requiredBytes + 100 * 1024 * 1024`
    - 主路徑：呼叫 `fs.statfs(targetDir)`（若 Node API 可用），用 `bavail * bsize` 算 free bytes，free < required + margin → return `{ ok: false, reason: "disk-full" }`
    - Fallback：`fs.statfs` 若拋 `ENOSYS`、`TypeError`、或 Bun runtime 該 API 不存在（typeof 檢查），改 spawn `child_process.execFile('df', ['-k', targetDir])`，解析 output 第二行第 4 欄（available KB），KB → bytes 後同樣比對
    - 兩條路徑都拋錯：log warn `磁碟空間檢查失敗，跳過檢查`，return `{ ok: true, skipped: true }`（不阻擋寫入）
    - 回傳值用 discriminated union 表達 `ok` / `disk-full` / `skipped` 三種狀態，呼叫端只在 `ok: false && reason === 'disk-full'` 時 throw
  - [ ] 註明：fallback 只支援 macOS / Linux 的 `df -k`，Windows runtime 不在範圍（專案目前桌面端為 macOS）

E. 新增 tmp 清理 task 模組
  - [ ] 建立 `/backend/src/services/tmpCleanupService.ts`
  - [ ] 實作 `class TmpCleanupService`，匯出單例 `tmpCleanupService`
  - [ ] `start()`：首次同步呼叫一次 `runOnce()`（不 await），然後 `setInterval(runOnce, 60 * 60 * 1000)`，把 timer 存起來、`timer.unref()` 避免阻擋 process exit
  - [ ] `stop()`：清掉 interval（測試用）
  - [ ] `runOnce()`：
    - `fs.readdir(<tmpRoot>)`，ENOENT 直接 return（首次啟動 tmp 還沒被建）
    - 對每個 entry 取 `fs.stat`：若是 directory 且 `mtime < Date.now() - 24h` → `fs.rm(entry, { recursive: true, force: true })`
    - 任一 entry 失敗 log warn 但繼續處理下一個
    - 結束時 log 「清理 N 個過期 tmp 目錄」
  - [ ] 對應 user flow「暫存檔案經過 24 小時後自動清除」

### Phase 3

A. 改寫 `handleChatSend` handler
  - [ ] 修改 `/backend/src/handlers/chatHandlers.ts`
  - [ ] 在 handler 開頭、`validateIntegrationBindings` 之後加 `attachments` 處理區塊：
    - 若 `payload.attachments` 為 undefined 或不存在 → 跳過，走原邏輯
    - 若存在且 length === 0 → emit `POD_ERROR` 帶 i18n key `errors.attachmentEmpty`、code `ATTACHMENT_EMPTY`、return（不建 chat message）
    - 串行 pod 在 attachments 處理前先呼叫既有 `validatePodNotBusy`，busy 直接 reject 不寫檔（保留 `POD_BUSY` 既有邏輯，不改動）
    - **產生 chatMessageId**：`const chatMessageId = uuidv4()`
      - 串行 pod：此 id 既給 `attachmentWriter` 用、也傳給 `messageStore.addMessage`，確保 attachments dir 與 DB message id 一致
      - multi-instance pod：此 id 給 `attachmentWriter` 與 `runStore.addRunMessage`（注意此 id 不是 runId；runId 仍由 `launchMultiInstanceRun` 內部處理）
    - 呼叫 `attachmentWriter.writeAttachments(chatMessageId, payload.attachments)`：
      - catch `AttachmentTooLargeError` → emit `POD_ERROR` `errors.attachmentTooLarge`、code `ATTACHMENT_TOO_LARGE`、return
      - catch `AttachmentDiskFullError` → emit `POD_ERROR` `errors.attachmentDiskFull`、code `ATTACHMENT_DISK_FULL`、return
      - catch `AttachmentInvalidNameError` → emit `POD_ERROR` `errors.attachmentInvalidName`（params: `{ name }`）、code `ATTACHMENT_INVALID_NAME`、return
      - catch `AttachmentWriteError` 或其他 → emit `POD_ERROR` `errors.attachmentWriteFailed`、code `ATTACHMENT_WRITE_FAILED`、return
      - 任何錯誤路徑都不建 chat message、不送 LLM
      - 成功 → 拿到 `{ dir, files }`
    - **組觸發訊息 `triggerText`**（zh-TW，當作 user message 寫進 DB 並送 LLM）：
      - 前提：因為前端 drop 路徑 `payload.message` 永遠是空字串，後端固定生成 attachments-only 觸發訊息，不需處理「使用者打字 + attachments 混合」
      - 格式：``我提供了下列檔案在 `<dir>`：file1, file2, ...``（其中 `<dir>` 為 `attachmentWriter` 回傳的絕對路徑、檔名清單依寫入順序）
    - **command 注入 + attachments 共存（衍生需求）**：
      - 串行 pod 端走既有 `tryExpandCommandMessage(pod, triggerText, ...)`：若 `triggerText` 沒有 `<command>` token 就不展開，正常使用；若 caller 將來有需求帶 command（目前 drop 路徑不會帶），既有機制會把 `<command>...</command>` 附加在 `triggerText` 前面，行為不需要改
      - 不修改 `tryExpandCommandMessage` 的任何邏輯
    - **寫入 DB 與觸發 LLM**：
      - 串行 pod：`messageStore.addMessage({ id: chatMessageId, ... 其它欄位 ..., content: triggerText })`，再走既有 `injectUserMessage` 流程把 `triggerText`（或 command 展開後的版本）送 LLM
      - multi-instance pod：把 `triggerText` 當作 `message` 傳進 `launchMultiInstanceRun`（不改 launchMultiInstanceRun 既有邏輯）；其內部會呼叫 `runStore.addRunMessage`，**這裡需要把 chatMessageId 一路傳下去** —— 若 `launchMultiInstanceRun` 目前不接受外部 messageId，採以下其中一種最小變更：
        - 在 `launchMultiInstanceRun` 的 options 加上 optional `userMessageId?: string`，內部呼叫 `runStore.addRunMessage` 時若有 id 就傳入；沒給則維持原行為
        - 不擴充 `launchMultiInstanceRun` 介面的話，至少確保 chatMessageId 能透過明確的參數路徑（不要塞進 message 內容）抵達 `runStore.addRunMessage`
        - 二選一，實作時挑變動最小者；不論哪個都不改 `launchMultiInstanceRun` 的核心邏輯，只是把 id 透傳下去
  - [ ] 確認以下 user flow / 衍生需求都有對應路徑：
    - 「拖到 idle 串行 pod」：走串行流程，message id 與 attachments dir 對齊
    - 「拖到忙碌中串行 pod」：在寫檔前 reject（既有 POD_BUSY）
    - 「拖到 multi-instance pod」：走 launchMultiInstanceRun，runMessage id 與 attachments dir 對齊
    - 「0 個檔案」：reject `ATTACHMENT_EMPTY`
    - 「>20 MB」：schema 層先擋（fast path），handler/writer 層 fallback 嚴格判定
    - 「磁碟不足」：reject `ATTACHMENT_DISK_FULL`
    - 「同名檔案」：attachmentWriter 自動 rename
    - 「寫入過程出錯」：staging 清掉、不建 chat message
    - 「成功觸發對話」：triggerText 寫進 DB 並送 LLM
    - 「多種類型檔案」：attachmentWriter 不分流、全收
    - 衍生：「command 注入 + attachments 共存」：command 展開後 `<command>...</command>` 在 triggerText 前

B. 啟動時掛上清理 task
  - [ ] 修改 `/backend/src/services/startupService.ts`
  - [ ] 在 `initialize()` 內 `scheduleService.start()` 與 `backupScheduleService.start()` 之後加上 `tmpCleanupService.start()`
  - [ ] 在檔案頂端 import `tmpCleanupService`

### Phase 4

A. 撰寫單元測試
  - [ ] 建立 `/backend/tests/unit/attachmentWriter.test.ts`
    - 對應測試案例 3、4、5、6、7、8、15
    - 用 `tmp` 目錄當測試 sandbox，跑完清乾淨
    - mock `fs.statfs` 模擬磁碟不足、mock `fs.statfs` throw 走 `df` fallback、mock 兩者都失敗走 skip 路徑
  - [ ] 建立 `/backend/tests/unit/tmpCleanupService.test.ts`
    - 對應測試案例 16、17、18
    - 用假 timer + sandbox tmp dir
  - [ ] 建立 `/backend/tests/unit/chatSendSchema.test.ts`（或併入既有 schema 測試）
    - 對應測試案例 1、2
  - [ ] 修改或新增 `/backend/tests/unit/messageStore.test.ts`、`/backend/tests/unit/runStore.test.ts`
    - 對應測試案例 9：傳入外部 id 與不傳兩種路徑
  - [ ] 修改 `/backend/tests/unit/chatHandlers.test.ts`
    - 對應測試案例 10、11、12、13、14
    - mock `attachmentWriter.writeAttachments`、驗 handler 在不同分支的行為
    - 驗 attachments dir 的 id 與 messageStore / runStore 寫入的 id 一致
  - [ ] 跑 `bun run test`（在 `/backend` 目錄下）確保全綠
  - [ ] 跑 `bun run style`（在 `/backend` 目錄下）確保 eslint + type check 過關

B. 重啟提醒
  - [ ] 完成後告知使用者：後端有改動，需重啟（含新增 setInterval 清理 task）
