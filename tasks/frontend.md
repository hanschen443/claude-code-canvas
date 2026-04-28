# 前端實作計畫書：拖曳檔案到 Pod 觸發 Agent

對應 user flow：`/Users/soap.fu/Desktop/claude-code-canvas/tasks/userflow.md`

## 測試案例（先列名稱，最後實作）

1. usePodFileDrop：拖入 0 個檔案時阻擋並 toast `errors.attachmentEmpty`
2. usePodFileDrop：拖入內含資料夾條目（DataTransferItem.kind === 'file' 但 webkitGetAsEntry 為 directory）時阻擋並 toast `errors.attachmentEmpty`
3. usePodFileDrop：所有檔案 size 加總 > 20 MB 時阻擋並 toast `errors.attachmentTooLarge`
4. usePodFileDrop：合法多檔（圖片 + 文字 + 二進制）成功讀成 base64 並回傳 attachments 陣列
5. usePodFileDrop：在 disabled 為 true 時 drop 不觸發 onDrop callback
6. usePodFileDrop：dragenter / dragleave / drop 後 isDragOver 狀態正確切換
7. usePodFileDrop：FileReader 讀檔失敗時 toast `composable.chat.podDropReadFailed` 不呼叫 onDrop
8. CanvasPod：串行 Pod 處於 idle 時拖入有效檔案會呼叫 chatStore.sendMessage 並帶 attachments
9. CanvasPod：multi-instance source pod 即使有其他 run 在跑也允許 drop 並送出，且送出成功後呼叫 `runStore.openHistoryPanel()`
10. CanvasPod：拖入時套用高亮 class（與 selected 視覺相同），dragleave 後移除
11. chatStore.sendMessage：帶 attachments 時 emit 的 PodChatSendPayload 含 attachments 欄位
12. chatStore.sendMessage：attachments 為空陣列時不應將 attachments 欄位送出（或送 undefined）
13. CanvasPod：串行 Pod 處於 chatting / summarizing 時 `isFileDropDisabled` 為 true，drop 不觸發送出（對應 user flow #2 串行 busy）
14. CanvasPod：下游 multi-instance pod（被上游觸發的 target）時 `isFileDropDisabled` 為 true，drop 不觸發送出
15. CanvasPod：unknown provider 時 `isFileDropDisabled` 為 true，drop 不觸發送出
16. CanvasPod：後端回傳 `errors.attachmentDiskFull` 錯誤事件時顯示對應 toast（磁碟空間不足）
17. CanvasPod：後端回傳 `errors.attachmentWriteFailed` 錯誤事件時顯示對應 toast（IO 寫檔失敗）
18. CanvasPod：generic 送出失敗（websocket emit 拋例外）時顯示 `composable.chat.podDropSendFailed` toast

---

### Phase 1（可並行）

A. 型別與常數定義

  - [ ] 在 `/Users/soap.fu/Desktop/claude-code-canvas/frontend/src/types/websocket/requests.ts` 新增 `PodChatAttachment` 介面，欄位：
    - `filename: string`：檔名（不含路徑）
    - `contentBase64: string`：純 base64 字串（不含 dataURL 前綴）
  - [ ] 在同一檔案的 `PodChatSendPayload` 介面新增可選欄位 `attachments?: PodChatAttachment[]`
  - [ ] 在 `/Users/soap.fu/Desktop/claude-code-canvas/frontend/src/lib/constants.ts` 新增常數 `MAX_POD_DROP_TOTAL_BYTES = 20 * 1024 * 1024`（20 MB，與後端對齊）

B. i18n 三語翻譯

  - [ ] 在 `/Users/soap.fu/Desktop/claude-code-canvas/frontend/src/locales/zh-TW.json`、`en.json`、`ja.json` 三份檔案的 `errors` 區塊各補上以下 5 個 key（key 名稱必須與後端 emit 對齊）：
    - `errors.attachmentEmpty`
      - zh-TW：「沒有可上傳的檔案，請選擇檔案後再試一次」
      - en：「No files to upload. Please select files and try again.」
      - ja：「アップロードできるファイルがありません。ファイルを選択して再試行してください」
    - `errors.attachmentTooLarge`
      - zh-TW：「檔案總大小超過 20 MB 上限」
      - en：「Total file size exceeds the 20 MB limit.」
      - ja：「ファイルの合計サイズが 20 MB の上限を超えています」
    - `errors.attachmentInvalidName`
      - zh-TW：「檔案名稱不合法」
      - en：「Invalid file name.」
      - ja：「ファイル名が無効です」
    - `errors.attachmentDiskFull`
      - zh-TW：「磁碟空間不足，無法寫入檔案」
      - en：「Disk space is full. Unable to write file.」
      - ja：「ディスク容量が不足しているため、ファイルを書き込めません」
    - `errors.attachmentWriteFailed`
      - zh-TW：「檔案寫入失敗，請稍後再試」
      - en：「Failed to write file. Please try again later.」
      - ja：「ファイルの書き込みに失敗しました。しばらくしてから再試行してください」
  - [ ] 在三份 locale 檔案的 `composable.chat` 區塊各補上以下 2 個前端專屬 key（後端不會 emit 這兩個）：
    - `composable.chat.podDropReadFailed`
      - zh-TW：「檔案讀取失敗」
      - en：「Failed to read file.」
      - ja：「ファイルの読み込みに失敗しました」
    - `composable.chat.podDropSendFailed`
      - zh-TW：「檔案送出失敗」
      - en：「Failed to send file.」
      - ja：「ファイルの送信に失敗しました」
  - 對應 user flow：所有錯誤情境的 toast 顯示

### Phase 2

A. 新建 composable `usePodFileDrop`

  - [ ] 建立 `/Users/soap.fu/Desktop/claude-code-canvas/frontend/src/composables/pod/usePodFileDrop.ts`
  - [ ] 接收參數：
    - `disabled: () => boolean`：getter，true 時所有事件 early return
    - `onDrop: (attachments: PodChatAttachment[]) => void | Promise<void>`：合法 drop 時觸發
  - [ ] 回傳：
    - `isDragOver: Ref<boolean>`：拖入時為 true，給模板綁定高亮 class
    - `handleDragEnter(event: DragEvent)`：preventDefault，disabled 時 return；設 `isDragOver = true`
    - `handleDragOver(event: DragEvent)`：preventDefault，設 `dataTransfer.dropEffect = 'copy'`，disabled 時 return
    - `handleDragLeave(event: DragEvent)`：以 `relatedTarget` 是否仍在 currentTarget 內判斷是否真的離開（避免子元素 dragenter/leave 抖動），離開後設 `isDragOver = false`
    - `handleDrop(event: DragEvent)`：preventDefault，disabled 時 return；重置 `isDragOver = false`
  - [ ] handleDrop 中執行下列檢查（依序，任一失敗顯示對應 toast 並 return）：
    - 取出 `event.dataTransfer.items`（若可用），逐項以 `webkitGetAsEntry()` 檢查是否為 directory；若有 directory，toast `errors.attachmentEmpty` 後 return
    - 取出 `event.dataTransfer.files`，length === 0 → toast `errors.attachmentEmpty` 後 return
    - 計算所有 file.size 總和，> `MAX_POD_DROP_TOTAL_BYTES` → toast `errors.attachmentTooLarge` 後 return
  - [ ] 將每個 File 透過 `FileReader.readAsDataURL` 讀成 base64，剝離 dataURL 前綴只保留 base64 字串，組成 `PodChatAttachment[]`（以 `Promise.all` 平行讀取）
  - [ ] 任一檔案讀取失敗（reader.onerror）→ toast `composable.chat.podDropReadFailed` 後 return（不呼叫 onDrop）
  - [ ] 全部成功後呼叫 `await onDrop(attachments)`，過程中以 try/catch 包，失敗 toast `composable.chat.podDropSendFailed`
  - [ ] 不做檔案類型 / MIME 白名單
  - 對應 user flow：「拖曳檔案進出 Pod 範圍時的視覺回饋」、「離開 Pod 範圍」、「拖曳了 0 個檔案或拖曳資料夾」、「總大小超過 20 MB」、「一次拖曳多種類型的檔案」、「本地讀檔失敗」

### Phase 3（可並行）

A. 擴充 chatStore.sendMessage 支援 attachments

  - [ ] 修改 `/Users/soap.fu/Desktop/claude-code-canvas/frontend/src/stores/chat/chatStore.ts` 中的 `sendMessage` 方法簽章，新增第 4 個可選參數 `attachments?: PodChatAttachment[]`
  - [ ] 從 `@/types/websocket/requests` 匯入 `PodChatAttachment` 型別
  - [ ] 修改 `hasMessageContent` 判斷邏輯：
    - 原本判斷 content / contentBlocks 是否有內容
    - 新增條件：當 `attachments && attachments.length > 0` 時，即使 content 為空字串、contentBlocks 為空也應允許送出
  - [ ] 在組裝 `websocketClient.emit<PodChatSendPayload>` 的 payload 時，若 `attachments && attachments.length > 0` 才將 `attachments` 加入 payload，否則不帶該欄位（或帶 undefined）

B. CanvasPod 整合 drop zone

  - [ ] 修改 `/Users/soap.fu/Desktop/claude-code-canvas/frontend/src/components/pod/CanvasPod.vue`
  - [ ] 在 `<script setup>` 匯入 `usePodFileDrop`
  - [ ] 新增 computed `isFileDropDisabled`，沿用 `ChatModal.vue:35-80` 的判斷結構，條件為以下任一為真：
    - `isPodBusy(pod.status)`：chatting / summarizing → disable（對應串行 busy）
    - `isDownstreamMultiInstance`：multi-instance chain 中下游被觸發的 target pod → disable（使用者已決策）
    - `isUnknownProvider`：未知 provider → disable（沿用既有 ChatModal 的擋法）
    - 其餘狀態（idle、multi-instance source idle）→ allow
  - [ ] 呼叫 `usePodFileDrop`，傳入：
    - `disabled: () => isFileDropDisabled.value`
    - `onDrop: async (attachments) => { ... }`：
      - 呼叫 `chatStore.sendMessage(props.pod.id, '', undefined, attachments)`（content 永遠送空字串）
      - 若 pod 為 multi-instance source pod（沿用既有 `isMultiInstanceSourcePod` 判斷），成功送出後呼叫 `runStore.openHistoryPanel()`，行為與 `ChatModal.handleMultiInstanceSend` 一致
      - 串行 pod 不需要呼叫 `openHistoryPanel`
      - 失敗時由 `usePodFileDrop` 內部 try/catch 顯示 `composable.chat.podDropSendFailed` toast
  - [ ] 將 `handleDragEnter`、`handleDragOver`、`handleDragLeave`、`handleDrop` 綁到最外層 `<div class="absolute select-none">` 元素的對應事件
  - [ ] 在外層或 `pod-glow-layer` 的 `:class` 中加入 `'pod-glow-selected': isDragOver`（沿用既有 selected 高亮樣式，無需新 CSS）
  - [ ] 確認 drop zone 與既有 mousedown drag（pod 拖移）不衝突：drop 事件由 `dataTransfer` 觸發，與 mousedown 屬於不同事件流，無需特別處理
  - 對應 user flow：「使用者拖曳檔案到 idle 的串行 Pod」、「拖曳到忙碌中的串行 Pod」、「拖曳到 Multi-Instance Source Pod」、「拖曳到 Multi-Instance 下游 Pod」、「拖曳檔案進出 Pod 範圍時的視覺回饋」、「離開 Pod 範圍」

### Phase 4

A. 後端錯誤事件對應 toast

  - [ ] 確認 `/Users/soap.fu/Desktop/claude-code-canvas/frontend/src/stores/chat/chatConnectionActions.ts` 的 `handleError`（PodErrorPayload 處理）已支援顯示後端錯誤訊息（沿用既有路徑）
  - [ ] 後端會 emit 以下 i18n key（Phase 1B 已補翻譯，這裡只需驗證 errors 區塊翻譯齊全）：
    - `errors.attachmentEmpty`
    - `errors.attachmentTooLarge`
    - `errors.attachmentInvalidName`
    - `errors.attachmentDiskFull`
    - `errors.attachmentWriteFailed`
  - [ ] 不需要在前端額外攔截，所有後端錯誤統一走 `handleError → showErrorToast` 路徑
  - 對應 user flow：「寫入檔案時磁碟空間不足」、「寫入檔案過程中發生錯誤」（後端 IO 失敗）、「檔名不合法」（後端側）

### Phase 5

A. 撰寫單元測試

  - [ ] 為 `usePodFileDrop` 撰寫測試，涵蓋測試案例 1–7
  - [ ] 為 `CanvasPod` 拖曳整合行為撰寫測試，涵蓋測試案例 8–10、13–18
  - [ ] 為 `chatStore.sendMessage` 帶 attachments 行為補強測試，涵蓋測試案例 11–12
  - [ ] 在 frontend 目錄執行 `bun run test` 確認全綠
  - [ ] 在 frontend 目錄執行 `bun run style` 確認 eslint / type 通過

---

## 補充說明

- **不寫檔到 fs**：前端只將 File 讀成 base64 後透過 WebSocket 送給後端，所有落地由後端處理。
- **沒有預覽 / 確認**：drop 事件後端讀完即送，沒有 UI 中介層。
- **同名 collision rename 由後端處理**：前端不感知、不顯示重命名提示；後端會自動補 suffix，前端只看到觸發訊息中的最終檔名。
- **payload.message 永遠送空字串**：純 drop-only 流程，前端不在 attachments 流程中組訊息文字；後端會自動根據 attachments 組觸發訊息當作 user message。
- **後端組的觸發訊息會推回前端**：透過 `pod:chat:message` push 推回，會出現在 chat 歷史中（role=user），這是預期行為（使用者本來就知道自己拖了什麼）。
- **沿用既有 disable 機制**：`isPodBusy`、`isMultiInstanceSourcePod`、`isDownstreamMultiInstance`、`isUnknownProvider` 皆來自 `CanvasPod.vue` / `ChatModal.vue:35-80` 已存在的 computed，不重新定義也不重新發明判斷邏輯。
- **沿用既有 selected 高亮**：使用 `pod-glow-selected` class，不新增 CSS。
- **chatMessageId 由後端產**：前端不在 attachments 流程中產生任何 message id；user message 由後端推回 `pod:chat:message`（role=user）由 chatStore 接收顯示。
- **i18n key 對齊原則**：5 個後端會 emit 的 key 統一放 `errors.*` 命名空間（與後端 emit 完全對齊），2 個前端專屬 key（本地讀檔失敗、generic 送出失敗）放 `composable.chat.*` 命名空間。
- **不要動的東西**：既有 `ChatInput` 的 disable 邏輯、既有 `ChatMultiInstanceInput`、既有 `useImageAttachment`（新功能用獨立 composable `usePodFileDrop`，不要改它）、既有 toast / notification 系統。
- **Multi-Instance 拖曳成功自動開 History Panel**：使用者已決策。Multi-Instance source pod 拖曳成功送出後沿用 `ChatModal.handleMultiInstanceSend` 行為呼叫 `runStore.openHistoryPanel()`；串行 pod 不需要做這件事。
- **檔案大小計算**：以 `file.size`（瀏覽器原始 bytes）加總比對 `MAX_POD_DROP_TOTAL_BYTES`，與後端 base64 解碼後的 bytes 語意一致。
