# 前端實作計畫：Command 功能跨 Provider 支援

## 背景

後端即將把 Command 展開邏輯統一成：由 server 端將 Pod 綁定的 Command 內容包成 `<command>…</command>` 標籤注入訊息，不再依賴 Claude SDK 的 `/name` slash-command 展開。

前端的工作：

1. 移除 `chatStore.ts` 原本把 `/${command.name}` 前綴塞到訊息 payload 的邏輯，改為單純把使用者訊息原樣送出（Pod 上已綁定的 `commandId` 後端會自己從 DB 查）。
2. 確認 Codex Pod 能使用 Command slot（目前 `CODEX_CAPABILITIES.command = false`，UI 會透過 `isCommandEnabled` 把 Command slot 判為 disabled 並顯示 codex disabled tooltip）。Capability 要改由後端 `provider:list` 回傳 `command: true`，前端本身不需要改 capability 常數（是後端 source of truth），但**前端測試與 fallback 文案需同步調整**。
3. 修正既有前端測試對「/{commandName} 前綴」的斷言，改為預期原始訊息被送出。

---

## User Flow 對應的前端測試案例清單

僅定義測試名稱，實作細節放在 Phase 3。

### chatStore.sendMessage（移除 `/name` 前綴）

- `沒綁定 Command 的 Pod 送文字 → message 為原始文字（不加前綴）`
- `綁定 Command 的 Claude Pod 送文字 → message 為原始文字（不再加 /name）`
- `綁定 Command 的 Codex Pod 送文字 → message 為原始文字（不再加 /name）`
- `沒綁 Command 的 Pod 輸入「/xxx 請幫我...」→ message 照原樣傳出，不被當 Command`
- `綁 Command 的 Pod 送 contentBlocks → 第一個 text block 不再被前綴`
- `綁 Command 的 Pod 送純 image contentBlocks → blocks 原樣傳出`
- `解除 Command 綁定後送訊息 → message 不含任何前綴`
- `Claude Pod 與 Codex Pod 綁定同一個 Command 送同樣訊息 → 兩者 payload 完全一致`

### PodSlots / usePodCapabilities（Codex Command slot 開放）

- `Codex capabilities（含 command: true）時，Command slot 應為 enabled`
- `Codex capabilities（含 command: true）時，Command slot 不應顯示 codexDisabled tooltip`
- `未知 provider fallback 時 Command slot 仍為 disabled（保守 fallback 不開 command）`

### 整合流程（chatFlow）

- `在 Codex Pod 綁定 Command → 送訊息 → WebSocket emit 的 message 為原始文字`
- `在 Claude Pod 綁定 Command 與 OutputStyle → 送訊息後 payload 不含 /name 前綴`

---

## 檔案異動清單（總覽）

| 檔案 | 異動類型 | 重點 |
| --- | --- | --- |
| `frontend/src/stores/chat/chatStore.ts` | 修改 | 刪除 `resolveCommandForPod`、`buildTextPayload`、`buildBlockPayload`、`buildMessagePayload` 及對應呼叫；`sendMessage` 直接把 `content` / `contentBlocks` 當 payload 送出 |
| `frontend/src/stores/chat/chatStore.ts` | 修改 | 移除對 `@/types/command`、`@/stores/note/commandStore`、`Pod` 型別的 import（若因清除而變成未使用） |
| `frontend/src/composables/pod/usePodCapabilities.ts` | 不改 | 本檔只把 capability flag 攤平，邏輯不需變，只等後端改 `CODEX_CAPABILITIES.command = true` 後自然生效 |
| `frontend/src/components/pod/PodSlots.vue` | 不改 | 已經用 `isCommandEnabled` 判斷 disabled，後端 capability 改動後即可使用 |
| `frontend/src/types/pod.ts` `ProviderCapabilities` | 不改 | 欄位不變，只是後端 `codex` 物件的值會翻轉 |
| `frontend/src/i18n/**/pod.ts`（或對應 key） | 檢查 | 原本 `pod.slot.codexDisabled` 文案只會在 Codex 尚不支援功能時顯示；Command slot 開放後此 tooltip 對 Codex Pod 的 Command slot 不應再出現。**文案本身不必改**，僅需確認沒有 hard-code 說「Codex 不支援 Command」的描述 |
| `frontend/tests/stores/chat/chatStore.test.ts` | 修改 | 更新 `包含 Command 時應在訊息前綴加上 /{commandName}` 與 `contentBlocks 含 text 且有 command 時應在第一個 text block 前綴 command` 兩個測試為「不前綴」版本，並新增 Codex Pod、斜線訊息等測試 |
| `frontend/tests/components/pod/PodSlots.test.ts` | 修改 | 更新「切換成 Codex capabilities」那組測試對 Command slot 的預期（enabled，沒 disabled tooltip） |
| `frontend/tests/composables/pod/usePodCapabilities.test.ts` | 修改 | 更新 `CODEX_CAPABILITIES` 測試 fixture（`command: true`）與對 Codex Pod `isCommandEnabled` 的斷言 |
| `frontend/tests/stores/providerCapabilityStore.test.ts` | 檢查 | `CODEX_TEST_CAPABILITIES` 若有寫 `command: false` 的斷言要同步改（以測試 fixture 名義可保留；斷言 codex command 為 true 的那條要更新） |
| `frontend/tests/integration/chatFlow.test.ts` | 新增 case | 新增 Codex Pod 綁 Command 後送訊息的整合測試 |

---

## 前端發送訊息新流程

目前（要被取代）：

```
user input → chatStore.sendMessage
  → resolveCommandForPod (讀 pod.commandId + commandStore)
  → buildMessagePayload 加 "/name " 前綴
  → emit pod:chat:send { message }
```

改為：

```
user input → chatStore.sendMessage
  → emit pod:chat:send { requestId, canvasId, podId, message }
    // 其中 message 就是使用者打字的原文（或原始 contentBlocks）
    // 後端收到後，會查 pod.commandId → 取 markdown → 包 <command> 標籤注入
```

重點：

- 前端**完全不再關心 `pod.commandId` 是否存在**於 sendMessage 流程中。
- `commandId` 的綁定/解除仍走既有的 `POD_BIND_COMMAND / POD_UNBIND_COMMAND`，前端 `podStore.updatePodCommand` 邏輯不動。
- PodChatSendPayload 型別**不需要新增 `commandId` 欄位**，因為後端從 DB 查。

---

## UI 調整說明

### 現況

- `PodSlots.vue` 第 183-197 行的 Command slot config 以 `isCommandEnabled` 控制 `disabled`，disabled 時顯示 `pod.slot.codexDisabled` tooltip。
- `isCommandEnabled` 來自 `usePodCapabilities`，值等於 `capabilities.command`，而 `capabilities` 從 `providerCapabilityStore.getCapabilities(pod.provider)` 取得。
- 後端 `CODEX_CAPABILITIES.command = false`（見 `backend/src/services/provider/capabilities.ts:25`），所以 Codex Pod 上的 Command slot 現在是灰色 disabled。

### 調整方向

- **後端 agent 會把 `CODEX_CAPABILITIES.command` 改為 `true`**（本計畫書不處理後端，但要知道這個依賴）。
- 前端 `PodSlots.vue` 與 `usePodCapabilities.ts` **無須修改 code**，capability 物件翻轉後自動生效。
- 只要前端測試 fixture 同步改為 `command: true`（Codex），UI 在測試中即表現一致。

---

## 型別檢查確認

- `ProviderCapabilities`（`frontend/src/types/pod.ts:62-72`）：欄位 `command: boolean` 已存在，不需動。
- `PodChatSendPayload`（`frontend/src/types/websocket/requests.ts:83-88`）：不新增 `commandId`。
- 清除 `chatStore.ts` 內只剩 `resolveCommandForPod` 會用的 import：
  - `import type { Command } from "@/types/command";` → 移除
  - `import type { Pod } from "@/types/pod";` → 移除
  - `import { useCommandStore } from "../note/commandStore";` → 移除
- `type-check`（`bun run style`）必須綠燈。

---

## User Flow Scenario 對應實作步驟

| Scenario | 對應實作 |
| --- | --- |
| Claude Pod 綁 Command 送訊息 | Phase 1 移除前綴；後端處理展開 |
| Claude Pod 切換 Command A→B | 不需改前端：`updatePodCommand` 照舊；送訊息時不再帶 command 內容 |
| Claude Pod 解除 Command 送訊息 | 不需改前端：`updatePodCommand(null)` 照舊；message 不前綴 |
| Codex Pod 首次打開 Command 選單看到清單 | 仰賴後端把 `codex.command = true`；前端 PodSlots 自動放行 |
| Codex Pod 綁 Command 送訊息 | Phase 1 移除前綴 + 後端開 capability |
| Claude 與 Codex 用同個 Command 行為一致 | Phase 1 之後前端對兩者完全相同 |
| 沒綁 Command 的 Pod 送訊息 | Phase 1 之後 message 原樣送出 |
| 沒綁 Command 的 Pod 輸入「/xxx」被當一般訊息 | Phase 1 之後前端不做任何 parsing，「/xxx …」原樣送出，後端也不會做 slash 展開 |
| 新建 Claude/Codex Pod 立即綁 Command | 既有 Pod 建立與 bind 流程不動，只靠 Phase 1 讓送訊息正確 |
| 多 Provider Pod 互不干擾 | 由後端查各自 `pod.commandId`，前端不做任何 per-pod command state 處理 |
| Command 檔案被刪除 / 新增 / 修改 | 前端不處理展開，直接看後端回傳的訊息與錯誤。「找不到 Command」走 **streaming error event**（後端以 `streamingCallback({ type: 'error', fatal: false })` 推送），前端沿用既有 streaming 事件路徑（`streamingChatExecutor` 現行會把 non-fatal error 轉成一段文字透過 `POD_CLAUDE_CHAT_MESSAGE` 追加到 assistant message），**不需要新增 `POD_ERROR` handler**。詳見下方「錯誤通道說明」 |
| Command + OutputStyle 共用 | 不相關聯，Phase 1 移除前綴不影響 OutputStyle 欄位流程 |
| Command + MCP / Plugin / Integration | 同上，彼此獨立 |

---

## 錯誤通道說明（Command 找不到）

### 後端實際行為

後端在 Command 檔案讀不到時，走的是 **streaming event**，不是 `POD_ERROR` 事件：

```
commandService.read 回 null
  → streamingCallback({ type: 'error', error: COMMAND_EXPAND_FALLBACK_MESSAGE, fatal: false })
  → strategy.onStreamError(podId)
  → return aborted-like 結果（不 throw，避免被 catch 成 fatal）
```

也就是說，前端**不會**收到 `WebSocketResponseEvents.POD_ERROR`（`pod:error`）事件來表達「Command 找不到」。

### 前端既有處理路徑

目前 `backend/src/services/claude/streamingChatExecutor.ts` 的 `handleErrorEvent`（約 222-244 行）會把 non-fatal 的 `type: 'error'` StreamEvent 透過 `streamingCallback({ type: 'text', content: genericMessage })` 轉成一段文字，再經由 `emitStrategy.emitText` 以 `POD_CLAUDE_CHAT_MESSAGE` 事件推給前端。

前端對應的既有處理位置：

- `frontend/src/stores/chat/chatStore.ts` 的 `handleChatMessage`（接 `POD_CLAUDE_CHAT_MESSAGE` 事件，委派給 `chatMessageActions`）
- `chatMessageActions.handleChatMessage` 會把新的 content 累積進當前 assistant message 並觸發 UI 更新
- 隨後的 `POD_CHAT_COMPLETE` 也會正常進來（因為 non-fatal 不 throw），前端會把 typing 狀態收掉

換句話說，前端**完全沿用現有 streaming 訊息顯示路徑**，不需要為「找不到 Command」新增任何事件 handler 或 UI 分支。

### 前端需要做的事

- **不需要**新增 `POD_ERROR` handler 或修改 `chatConnectionActions.ts` 的 `handleError`。
- **不需要**在 `chatStore.ts` 內加任何 command-not-found 的特例處理。
- 若後端日後把該 fallback message 改成以具體錯誤文字（而不是通用警告）呈現，前端仍是同一條路徑，無需調整。

### 待確認事項（需後端 agent 一起對齊）

目前 `handleErrorEvent` 會把 non-fatal error 的 `event.error`（原始錯誤字串）**覆蓋為通用訊息**（`⚠️ 發生錯誤，請稍後再試`），不會直接顯示 `COMMAND_EXPAND_FALLBACK_MESSAGE`。如果後端希望使用者看到「Command 已不存在，請重新選擇或解除綁定」這類具體文字，需要後端調整 `handleErrorEvent` 的訊息分派邏輯（屬於**後端計畫範疇**，前端不處理）；前端只要確認 UI 能正確渲染 `POD_CLAUDE_CHAT_MESSAGE` 追加的文字即可。

---

## 實作 Phase

### Phase 1

A. 移除 chatStore 的 `/name` 前綴邏輯
  - [ ] 在 `frontend/src/stores/chat/chatStore.ts` 刪除 `resolveCommandForPod` 函式（56-66 行）
  - [ ] 刪除 `buildTextPayload`（68-73 行）
  - [ ] 刪除 `buildBlockPayload`（75-87 行）
  - [ ] 刪除 `buildMessagePayload`（89-98 行）
  - [ ] 在 `sendMessage` 內把 `messagePayload` 的計算改成：
    - 沒有 contentBlocks 或 blocks 為空 → 用 `content`
    - 有 contentBlocks → 用 `contentBlocks`
    - 不再呼叫 `resolveCommandForPod` 或任何 buildXxx 函式
    - 不再讀 `podStore.pods`（如仍需 multi-instance 判斷，只保留 `isMultiInstanceSourcePod` 相關呼叫，目前已經獨立在後段，不受影響）
  - [ ] 移除未使用的 import：`Command`（`@/types/command`）、`Pod`（`@/types/pod`）、`useCommandStore`（`@/stores/note/commandStore`）
  - [ ] 本機跑 `bun run style`（eslint + type-check）必須綠燈

### Phase 2（可並行）

A. 更新 chatStore 既有測試
  - [ ] 開 `frontend/tests/stores/chat/chatStore.test.ts` 第 224-243 行：把測試名改為「綁定 Command 時 message 不再加 /{commandName} 前綴」，預期 `message: 'run this'`
  - [ ] 第 269-289 行：把測試名改為「contentBlocks 含 text 且綁定 Command 時，第一個 text block 不再加前綴」，預期 `emittedBlocks[0].text === 'this file'`
  - [ ] 移除測試檔內 `useCommandStore` 的 mock 設定（若改完後不再需要）或改成「驗證 command 不影響 payload」
  - [ ] 新增測試：`Codex Pod 綁定 Command 時 message 為原始文字（使用 createMockPod({ provider: 'codex', commandId: 'cmd-1' })）`
  - [ ] 新增測試：`Pod 未綁 Command 但使用者輸入 "/foo 請幫我" 時 message 照原樣為 "/foo 請幫我"`

B. 更新 PodSlots 測試
  - [ ] 開 `frontend/tests/components/pod/PodSlots.test.ts`
  - [ ] 第 134-149 行（「切換成 Codex capabilities：所有 slot disabled」）：把該測試的 `isCommandEnabled` mock 改為 `computed(() => true)`，並把預期 disabled slot 數量減 1；或獨立拆一條測試 `Codex capabilities 啟用 command 時，Command slot 應為 enabled`
  - [ ] 第 171-180 行（disabled-tooltip 測試）：確認該測試現在只針對「真正會 disabled 的 slot（例如 OutputStyle、Skill、SubAgent、Repo、MCP）」，不包含 Command
  - [ ] 新增測試：`Codex capabilities 下 Command slot 不應呈現 disabled tooltip`

C. 更新 usePodCapabilities 測試
  - [ ] 開 `frontend/tests/composables/pod/usePodCapabilities.test.ts`
  - [ ] 把檔案內作為 Codex 測試 fixture 的 capabilities 物件把 `command: false` 改為 `command: true`（第 42、50、66 行附近對應位置，以實際檔案為準）
  - [ ] 把測試名「isCommandEnabled 應為 false（codex）」改為「isCommandEnabled 應為 true（codex 已開放 command）」，斷言從 `false` 改 `true`
  - [ ] 保留至少一條「未知 provider fallback 時 isCommandEnabled 為 false」的測試

D. 更新 providerCapabilityStore 測試
  - [ ] 開 `frontend/tests/stores/providerCapabilityStore.test.ts`
  - [ ] 把 `CODEX_TEST_CAPABILITIES`（第 42 行附近）的 `command` 改為 `true`
  - [ ] 若有測試斷言 `capabilitiesByProvider["codex"].command === false`，改為 `=== true`；以「該欄位可被 syncFromPayload 正確寫入」而非寫死 false 為導向

### Phase 3

A. 新增整合測試
  - [ ] 在 `frontend/tests/integration/chatFlow.test.ts` 新增 describe：`Codex Pod + Command`
    - [ ] 情境：建立 provider = 'codex'、commandId = 'cmd-1' 的 pod，呼叫 `chatStore.sendMessage('pod-1', 'do it')`，驗證 WebSocket emit 的 `message` 為 `'do it'`（非 `/name do it`）
    - [ ] 情境：Claude Pod 與 Codex Pod 綁同一個 commandId 送同訊息，驗證兩者 emit payload 中 `message` 完全相等
  - [ ] 在同檔補測：Pod 未綁 Command 但輸入看起來像 slash command 的文字，驗證 emit 原文

B. 最終檢核
  - [ ] 執行 `bun run test`（全專案 vitest）必須綠燈
  - [ ] 執行 `bun run style`（eslint + type-check）必須綠燈
  - [ ] 手動驗收 user flow scenarios 的前端行為是否符合預期（搭配後端 agent 完成後）
