# Gemini Pod 支援 Command Note 與 Repository Note — 前端計畫書

## 結論摘要

前端 Note slot 與綁定 UI 已是 **capability-driven 架構**，不存在「硬寫死 provider 為 claude/codex」的判斷阻擋 gemini。後端把 `GEMINI_CAPABILITIES.repository / command` 開為 true 後，現有 `usePodCapabilities` → `PodSlots` → `PodSingleBindSlot` 路徑會自動讓 Gemini Pod 顯示為可綁定狀態，不需要修改任何 production 程式碼。

本次前端工作集中在：

- **驗證**現有 capability-driven 路徑對 gemini 真的可用（含 PodSlots、PodModelSelector 漸層、ProviderPicker、isUnknownProvider 路徑）。
- **補齊測試覆蓋**：把 gemini 視為一等 provider，補測試確保未來不會回歸到「硬寫死 provider」的舊模式。

provider 切換情境（user flow §「切換 Pod 的 Provider」）目前 UI 不存在（`updatePodProvider` 在 store 已 export 但前端沒有任何呼叫點，只有「新增 Pod 時選 provider」的 ProviderPicker），切換流程屬於未實作功能、不在本次範圍。會在驗證章節記錄此差距。

## Fallback / Defensive Code 對齊

無。本計畫不新增 try-catch、null fallback、預設值兜底、retry，僅驗證並補測試。既有的 `handleNoteDrop` 內 `if (!noteId) return` / `if (!note) return` 是預先存在程式碼，不在本次新增範圍。

## 測試案例（依 user flow 對應）

> Mock 邊界：
> - **Mock**：`@/services/websocket`（WS wrapper，第三方邊界）、`vue-i18n`（identity t）、`PodSingleBindSlot.vue` / `PodMcpSlot.vue` / `PodPluginSlot.vue`（DnD 互動 stub，沿用現有 `PodSlots.test.ts` 既有 stub 邊界）、`@/stores/note`（PodSlots 既有做法）
> - **不可 mock**：`useProviderCapabilityStore`、`usePodStore`、`usePodCapabilities`、`PodSlots.vue` 本體、`usePodNoteBinding` — 這些是本次驗證的 SUT，必須使用真實 Pinia 實例 + `syncFromPayload` 注入 capabilities
> - **A 類**：本次無新增 endpoint，無 schema smoke test
> - **B 類**：以下案例皆為業務規則
> - **C 類**：本次無 DB 約束相關工作

### 對應 user flow §「在 Gemini Pod 綁定 Command Note」

- T1：Gemini 能力載入後，`usePodCapabilities(podId)` 對 gemini Pod 回傳 `isCommandEnabled === true`
- T2：PodSlots 對 gemini Pod 渲染的 Command slot `data-disabled === "false"`
- T3：Command slot 在 gemini Pod 上 emit `note-dropped` 後，PodSlots 轉發出 `command-dropped`
- T4：`usePodNoteBinding.handleNoteDrop("command", noteId)` 在 gemini Pod 仍會呼叫 `commandStore.bindToPod` 與 `podStore.updatePodCommand`（與 provider 無關，驗證行為一致性）
- T5：Command slot 在 gemini Pod 上 emit `note-removed` 後，PodSlots 轉發出 `command-removed`

### 對應 user flow §「在 Gemini Pod 綁定 Repository Note」

- T6：Gemini 能力載入後，`usePodCapabilities(podId)` 對 gemini Pod 回傳 `isRepositoryEnabled === true`
- T7：PodSlots 對 gemini Pod 渲染的 Repository slot `data-disabled === "false"`
- T8：Repository slot 在 gemini Pod 上 emit `note-dropped` 後，PodSlots 轉發出 `repository-dropped`
- T9：`usePodNoteBinding.handleNoteDrop("repository", noteId)` 在 gemini Pod 仍會呼叫 `repositoryStore.bindToPod` 與 `podStore.updatePodRepository`
- T10：Repository slot 在 gemini Pod 上 emit `note-removed` 後，PodSlots 轉發出 `repository-removed`

### 對應 user flow §「同時綁定 Command Note 與 Repository Note」

- T11：PodSlots 在 gemini Pod 上同時渲染 Repository 與 Command 兩個 slot，且兩者 `data-disabled === "false"`
- T12：CanvasPod 在 gemini Pod 同時帶 `boundRepositoryNote` 與 `boundCommandNote` 時，PodSlots props 兩個欄位都正確透傳

### 對應 user flow §「邊界情境 — Gemini 能力尚未載入完成時嘗試拖入 Note」

- T13：`useProviderCapabilityStore` 尚未呼叫 `syncFromPayload` 時，`usePodCapabilities(geminiPodId)` 的 `isCommandEnabled` / `isRepositoryEnabled` 為 false（保守 fallback 已涵蓋，但需驗證 gemini 也走進此分支）
- T14：保守 fallback 期間，PodSlots 渲染的 gemini Repository / Command slot `data-disabled === "true"`，且 `disabled-tooltip` 為 `pod.slot.providerDisabled`

### 對應 user flow §「邊界情境 — Repository / Command 對應實體不存在」

- T15：CanvasPod 的 `boundRepositoryNote` 為 undefined 時，PodSlots 的 Repository slot 不顯示 note 名稱（slot 維持空態，無錯誤提示，與 Claude 行為一致）
- T16：同樣狀況下 `boundCommandNote` 為 undefined 時亦同
- 註：對應 user flow「指令來源不存在」「目錄無法存取」的訊息送出後檢查屬後端責任，前端只負責 slot 視覺與綁定資料，故不在前端測試

### 對應 ProviderPicker / PodModelSelector

- T17：`ProviderPicker` 在 gemini metadata 已載入時，gemini 按鈕 `disabled === false`，且點擊後 emit `select` 帶 `{ provider: "gemini", providerConfig: { model: <gemini default> } }`
- T18（既有測試已覆蓋，僅補檢查）：`ProviderPicker` 在 gemini metadata 未載入時 gemini 按鈕 disabled 並顯示 loading toast — 確認既有 test 對 gemini case 也成立

---

## 實作計畫

### Phase 1

A. 程式碼路徑驗證（不寫 code，只列 sanity check 結果）
  - [ ] 確認 `frontend/src/components/pod/PodSlots.vue` 沒有 `provider === "gemini"` 寫死判斷
  - [ ] 確認 `frontend/src/components/pod/PodSingleBindSlot.vue` 沒有 provider 寫死判斷
  - [ ] 確認 `frontend/src/composables/pod/usePodNoteBinding.ts` 完全 provider-agnostic
  - [ ] 確認 `frontend/src/composables/pod/usePodCapabilities.ts` 透過 `resolvePodProvider(pod)` + `capabilityStore.getCapabilities(provider)` 取能力，gemini Pod 自動走同一條路徑
  - [ ] 確認 `frontend/src/components/pod/CanvasPod.vue` 的 `isUnknownProvider` 路徑：當 store 已載入且 gemini 在能力清單中時不會誤判為 unknown
  - [ ] 確認 `frontend/src/assets/styles/doodle/pod.css` 已存在 `.pod-provider-gemini` class（既有），漸層套用無需改動
  - [ ] 確認 `frontend/src/components/pod/PodModelSelector.vue` 已存在 `.card-gemini` 樣式，model 選單顯示無需改動

### Phase 2（可並行）

A. `usePodCapabilities` 補 gemini 案例
  - [ ] 在 `frontend/tests/composables/pod/usePodCapabilities.test.ts` 新增 `Gemini Pod` describe 區塊
  - [ ] 加入 `GEMINI_CAPABILITIES` 常數（`{ chat: true, plugin: false, repository: true, command: true, mcp: false }`，需與後端 `GEMINI_CAPABILITIES` 一致；於本次後端任務確定後同步）
  - [ ] 加入 case：metadata 已載入時 `isRepositoryEnabled === true`（對應 T6）
  - [ ] 加入 case：metadata 已載入時 `isCommandEnabled === true`（對應 T1）
  - [ ] 加入 case：metadata 已載入時 `isPluginEnabled` / `isMcpEnabled` 對應 GEMINI_CAPABILITIES 的值（鎖死目前後端設定，避免未來偷偷加開）
  - [ ] 加入 case：metadata 未載入時 gemini Pod 的 `isRepositoryEnabled` / `isCommandEnabled` 皆為 false（對應 T13）

B. `usePodNoteBinding` 補 gemini 案例
  - [ ] 在 `frontend/tests/composables/pod/usePodNoteBinding.test.ts` 新增 describe：`Gemini Pod 綁定 Note`
  - [ ] 加入 case：`handleNoteDrop("command", noteId)` 在 podId 對應 gemini Pod 時仍正確呼叫 `commandStore.bindToPod` 與 `podStore.updatePodCommand`（對應 T4）
  - [ ] 加入 case：`handleNoteDrop("repository", noteId)` 在 podId 對應 gemini Pod 時仍正確呼叫 `repositoryStore.bindToPod` 與 `podStore.updatePodRepository`（對應 T9）
  - [ ] 加入 case：`handleNoteRemove("command")` / `handleNoteRemove("repository")` 在 gemini Pod 行為一致
  - 註：composable 本身 provider-agnostic，這些測試的價值是「未來若有人加 provider gate，會被測試擋下」

C. `PodSlots` 補 gemini 案例
  - [ ] 在 `frontend/tests/components/pod/PodSlots.test.ts` 新增 `setupGemini()` helper：對 capability store 注入 gemini 的 `{ chat: true, plugin: false, repository: true, command: true, mcp: false }`
  - [ ] 加入 describe：`Gemini provider：Repository 與 Command 為 enabled，Plugin 與 MCP 為 capabilityDisabled`
    - [ ] 斷言：兩個 single-bind slot `data-disabled === "false"`（對應 T2、T7、T11）
    - [ ] 斷言：MCP slot `data-capability-disabled === "true"`
    - [ ] 斷言：Plugin slot `data-capability-disabled === "true"`（需在 PodPluginSlot stub 加上同樣的 `data-capability-disabled` 屬性，比照 PodMcpSlot stub）
  - [ ] 加入 describe：`Gemini provider：emit 事件轉發與 Claude/Codex 一致`
    - [ ] 沿用既有 `it.each` 表格，對 gemini Pod 跑一次同樣的 4 個 emit 案例（對應 T3、T5、T8、T10）
  - [ ] 加入 describe：`Gemini metadata 未載入：Repository / Command slot 為 disabled`（對應 T14）
    - [ ] 不呼叫 `setupGemini()`，直接 mount gemini provider 的 PodSlots
    - [ ] 斷言：兩個 single-bind slot `data-disabled === "true"` 且 `data-disabled-tooltip === "pod.slot.providerDisabled"`

D. `ProviderPicker` 補 gemini 既有案例驗證
  - [ ] 檢視 `frontend/tests/components/canvas/ProviderPicker.test.ts`，若尚未對 gemini 走完「metadata 未載入 → disabled + loading toast」與「metadata 已載入 → enabled + emit select」兩條路徑，補上 case（對應 T17、T18）

E. `CanvasPod` 補 gemini 兩種 boundNote 同時透傳的案例
  - [ ] 在 `frontend/tests/components/pod/CanvasPod.test.ts` 新增 case：gemini Pod 同時 `repositoryStore.getNotesByPodId(podId)[0]` 與 `commandStore.getNotesByPodId(podId)[0]` 各回傳 1 個 note 時，PodSlots stub 收到的 `boundRepositoryNote` 與 `boundCommandNote` props 皆非 undefined（對應 T12）
  - [ ] 加入 case：兩個 store 都回傳 undefined 時，PodSlots stub 收到的兩個 props 皆為 undefined（對應 T15、T16）

### Phase 3

A. 跑測試與型別檢查
  - [ ] 在 `frontend/` 下執行 `bun run test` 確認新增測試全綠
  - [ ] 在 `frontend/` 下執行 `bun run style` 確認 eslint + type 無錯
  - [ ] 把 `GEMINI_CAPABILITIES` 常數值（前端測試裡那份）與後端最終 `GEMINI_CAPABILITIES` 對齊；如後端先合併，依後端值修正前端測試

---

## 不在範圍

- 後端 capabilities 設定、commandExpander、podPathResolver
- Pod 進行中的 provider 切換 UI（目前 UI 不存在切換入口，user flow §「切換 Pod 的 Provider」屬未實作功能；若需要實作，需另開計畫並設計 ProviderSwitcher 元件、處理已綁定 Note 的轉移邏輯、以及對應 WebSocket 事件）
- Plugin / MCP slot 的 gemini 行為（user 已將 plugin/MCP 對齊任務切到後續 phase，本次僅在 PodSlots 測試中鎖住「gemini 的 plugin/mcp 為 disabled」現狀）
- 後端負責的訊息送出時 command / repository 不存在的錯誤提示（屬訊息流程，不影響 slot 綁定 UI）
