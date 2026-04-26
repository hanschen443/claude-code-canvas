# MCP 重構 — Frontend 計畫書

> 範圍：把 MCP 從「Canvas note 拖拉綁定」改為「跟 plugin 對等的 popover toggle」。**不留向後相容**，所有舊 UI / store / event handler 拆光重寫。
>
> 對齊參考：plugin 系統（PluginPopover.vue / PodPluginSlot.vue / pluginApi.ts）

---

## 測試案例（依 user flow 推導）

> 僅列名稱，實作位置與內容於 Phase 7 撰寫。

1. Claude pod popover 顯示本機 MCP 列表
2. Claude pod toggle 啟用某個 MCP server
3. Claude pod toggle 關閉已啟用的 MCP server
4. Claude pod 本機沒有 MCP server 時顯示空狀態提示
5. Claude pod 外部移除已啟用的 MCP server 後 popover 自動失效顯示
6. Claude pod busy 狀態下 toggle 不可操作並顯示 busy 提示
7. Codex pod popover 唯讀展示本機 MCP 列表（含類型 + ✓）
8. Codex pod 顯示「Codex MCP server 由 codex 全域管理」提示
9. Codex pod 設定檔不存在時顯示空狀態提示
10. Pod 從 Claude 切到 Codex 後 popover 變唯讀
11. Pod 從 Codex 切回 Claude 後 popover 恢復可 toggle
12. PodMcpSlot 啟用數量徽章（Claude 顯示數字、Codex 不顯示）
13. McpPopover toggle 失敗（後端錯誤）回滾本地狀態
14. McpPopover ESC 與點擊外部可關閉

---

## 實作計畫

### Phase 1（可並行）

A. 型別與 WebSocket 事件常數
  - [ ] 在 `frontend/src/types/websocket/events.ts`：
    - 移除 `MCP_SERVER_LIST` / `MCP_SERVER_CREATE` / `MCP_SERVER_UPDATE` / `MCP_SERVER_READ` / `MCP_SERVER_DELETE` 五個 request 常數
    - 移除 `MCP_SERVER_NOTE_CREATE` / `MCP_SERVER_NOTE_LIST` / `MCP_SERVER_NOTE_UPDATE` / `MCP_SERVER_NOTE_DELETE` 四個 request 常數
    - 移除 `POD_BIND_MCP_SERVER` / `POD_UNBIND_MCP_SERVER` 兩個 request 常數
    - 移除對應的 9 個 response 常數（`MCP_SERVER_LIST_RESULT`、`MCP_SERVER_CREATED`、`MCP_SERVER_UPDATED`、`MCP_SERVER_READ_RESULT`、`MCP_SERVER_DELETED`、`MCP_SERVER_NOTE_CREATED`、`MCP_SERVER_NOTE_LIST_RESULT`、`MCP_SERVER_NOTE_UPDATED`、`MCP_SERVER_NOTE_DELETED`、`POD_MCP_SERVER_BOUND`、`POD_MCP_SERVER_UNBOUND`）
    - 新增 request 常數 `MCP_LIST: "mcp:list"`
    - 新增 response 常數 `MCP_LIST_RESULT: "mcp:list:result"`
  - [ ] 在 `frontend/src/types/websocket/requests.ts`（如不存在則新增）加入 `McpListPayload` 型別：欄位 `provider: "claude" | "codex"`
  - [ ] 在 `frontend/src/types/websocket/responses.ts` 加入 `McpListResultPayload` 型別：欄位 `provider: "claude" | "codex"`、`items: McpListItem[]`（與後端 `mcpListResultSchema` 對齊）
  - [ ] 移除舊有 MCP server CRUD / bind 相關的 request / response 型別（檢查 requests.ts、responses.ts 有 `McpServer*` / `PodMcpServer*` 字樣的全數移除）

B. MCP 領域型別
  - [ ] 新增 `frontend/src/types/mcp.ts`：
    - 定義 `McpListItem`：`{ name: string; type?: "stdio" | "http" }`（與後端 `mcpListItemSchema` 對齊，Claude 不帶 `type`、Codex 必帶 `type`）
    - Claude 端的 `command/args/env` 等實作細節由後端 reader 留在自己這邊，前端只展示 name + 可選類型，不需要這些欄位
  - [ ] 將 `McpListItem` 透過 `frontend/src/types/index.ts`（如有 barrel export）re-export

C. 修改 Pod 型別欄位
  - [ ] 在 `frontend/src/types/pod.ts` L101 把 `mcpServerIds?: string[]` 改名為 `mcpServerNames?: string[]`
  - [ ] 全專案 grep `mcpServerIds`，確認除了 podStore 內 schema 與本檔以外沒有其他殘留（殘留處先標 TODO，於 Phase 4 統一處理）

D. i18n 文案（zh-TW / en / ja 三語）
  - [ ] 三語 locale 檔（`frontend/src/locales/zh-TW.json`、`en.json`、`ja.json`）刪除：
    - `pod.slot.mcpServerDuplicate`
    - 整段 `canvas.mcpServer.*`（所有 key）
    - `composable.eventHandler.mcpServerCreated` / `mcpServerUpdated` / `mcpServerDeleted` / 其他 `mcpServer*` 全部
  - [ ] 三語 locale 檔在 `pod.slot.*` 區塊新增：
    - `mcpLabel`：zh "MCPs"、en "MCPs"、ja "MCP"
    - `mcpLoading`：zh "載入中…"、en "Loading…"、ja "読み込み中…"
    - `mcpBusyTooltip`：zh "Pod 執行中無法切換"、en "Cannot toggle while pod is busy"、ja "Pod 実行中は切り替え不可"
    - `mcpEmpty`：zh "尚未安裝 MCP server"、en "No MCP server installed"、ja "MCP server がインストールされていません"
    - `mcpClaudeEmptyHint`：zh "請使用 `claude mcp add` 安裝"、en "Run `claude mcp add` to install"、ja "`claude mcp add` でインストールしてください"
    - `mcpCodexEmptyHint`：zh "請使用 `codex mcp add` 安裝"、en "Run `codex mcp add` to install"、ja "`codex mcp add` でインストールしてください"
    - `mcpToggleFailed`：zh "切換 MCP server 失敗"、en "Failed to toggle MCP server"、ja "MCP server の切替に失敗しました"
    - `mcpCodexHint`：zh "Codex MCP server 由 codex 全域管理"、en "Codex MCP servers are managed globally by codex"、ja "Codex MCP server は codex でグローバル管理されます"
  - [ ] 三語 locale 檔在 `composable.eventHandler.*` 區塊新增：
    - `mcpToggleSuccess`：zh "已更新 MCP 啟用設定"、en "MCP servers updated"、ja "MCP の設定を更新しました"

### Phase 2（可並行）

A. MCP API 服務層
  - [ ] 新增 `frontend/src/services/mcpApi.ts`
  - [ ] 仿 `pluginApi.ts` 結構實作 `listMcpServers(provider: PodProvider): Promise<McpListItem[]>`
    - 使用 `createWebSocketRequest` 發送 `MCP_LIST` request 並等待 `MCP_LIST_RESULT`
    - payload 帶 `{ provider }`，回傳 `result.items ?? []`（注意欄位名為 `items`，與後端 `mcpListResultSchema` 對齊）
  - [ ] 同檔新增 `updatePodMcpServers(canvasId: string, podId: string, mcpServerNames: string[]): Promise<void>`（仿 `services/podPluginApi.ts` 的 `updatePodPlugins`）
    - 對應後端事件：`POD_SET_MCP_SERVER_NAMES` request + `POD_MCP_SERVER_NAMES_UPDATED` response（命名與後端 backend 計畫 Phase 2 A 對齊）
    - 失敗時 throw 含 `reason` 欄位的 error 物件，仿 `updatePodPlugins` 對齊；reason 來源為後端 i18nError 的 key 字串
  - [ ] 在 `frontend/src/types/websocket/events.ts` 補上述兩個常數 `POD_SET_MCP_SERVER_NAMES: "pod:set-mcp-server-names"`、`POD_MCP_SERVER_NAMES_UPDATED: "pod:mcp-server-names:updated"`

B. McpPopover 元件
  - [ ] 新增 `frontend/src/components/pod/McpPopover.vue`，**完全照 PluginPopover.vue 結構抄寫**
  - [ ] Props：`podId: string`、`anchorRect: DOMRect`、`busy: boolean`、`provider: PodProvider`
  - [ ] Emits：`close`
  - [ ] 內部 state：`installedMcpServers: McpListItem[]`、`localMcpServerNames: string[]`、`loading: boolean`、`loadFailed: boolean`
  - [ ] `isCodex` computed = `provider === "codex"`
  - [ ] mounted 時：
    - 從 podStore 同步 `pod.mcpServerNames`
    - 呼叫 `listMcpServers(provider)` 載入列表
    - 註冊 ESC 關閉 + 點擊外部關閉（capture phase）
  - [ ] `handleToggle(name: string, enabled: boolean)`：
    - Codex 直接 return；busy 直接 return
    - 樂觀更新 `localMcpServerNames`
    - 同步 `podStore.updatePodMcpServers(podId, names)`（store 方法見 Phase 4）
    - 呼叫 `updatePodMcpServers` API；失敗時回滾本地狀態 + toast。Toast 訊息對齊現有 plugin 的失敗處理慣例：直接顯示後端回傳的 i18nError key 對應翻譯（fallback 到 `pod.slot.mcpToggleFailed`）。busy 對應的 i18nError key 由後端定義，前端不要寫死字串。
  - [ ] 模板區塊：
    - 載入中：spinner + `mcpLoading`
    - 空狀態：`mcpEmpty` 加 hint（依 isCodex 顯示 `mcpCodexEmptyHint` 或 `mcpClaudeEmptyHint`）
    - Codex 模式：迴圈顯示 `name` + 類型標籤（`stdio`/`http`）+ ✓；下方追加 `mcpCodexHint`
    - Claude 模式：迴圈顯示 `name` + Switch；busy 時 disabled + `mcpBusyTooltip`

C. PodMcpSlot 元件
  - [ ] 新增 `frontend/src/components/pod/PodMcpSlot.vue`，**完全照 PodPluginSlot.vue 抄寫**
  - [ ] Props：`podId`、`podRotation`、`activeCount`、`provider`、`capabilityDisabled`、`disabledTooltip`
  - [ ] Emits：`(e: "click", event: MouseEvent)`
  - [ ] CSS class 變體：
    - 容器類別 `pod-mcp-slot`
    - Codex 變體 `pod-mcp-slot--codex`（隱藏數字徽章）
    - Claude 啟用變體 `pod-mcp-slot--active`（`activeCount > 0` 時加亮）
  - [ ] Label computed：Codex 顯示 `t('pod.slot.mcpLabel')`，Claude 顯示 `${t('pod.slot.mcpLabel')} (${activeCount})`
  - [ ] 在 `frontend/src/styles/pod.css`（或對應 pod 樣式檔）為 `pod-mcp-slot` / `pod-mcp-slot--codex` / `pod-mcp-slot--active` 新增與 `pod-plugin-slot` 對等的樣式規則（複製 plugin 的並改名）

### Phase 3

A. 拆除舊 MCP UI 元件與 composable
  - [ ] 刪除整個檔案 `frontend/src/components/canvas/McpServerModal.vue`
  - [ ] 刪除整個檔案 `frontend/src/composables/canvas/useMcpServerModal.ts`
  - [ ] 刪除整個檔案 `frontend/src/services/mcpServerApi.ts`（如存在）
  - [ ] 全專案 grep `McpServerModal` / `useMcpServerModal`，刪除所有 import 與用法殘留

B. 拆除 mcpServerStore 並重建 podStore 行為
  - [ ] 刪除整個檔案 `frontend/src/stores/note/mcpServerStore.ts`
  - [ ] 從 `frontend/src/stores/note/index.ts`（barrel）移除 `useMcpServerStore` export
  - [ ] 在 `frontend/src/stores/podStore.ts` 把 pod 狀態欄位 `mcpServerIds` 改為 `mcpServerNames: string[]`（含 reactive 預設值 `[]`）
  - [ ] 在 podStore 新增 action `updatePodMcpServers(podId: string, names: string[])`：純前端狀態更新，不發 WebSocket
  - [ ] 在 podStore 新增 backend-sync action `setMcpServersWithBackend(podId, names)`（仿 `setMultiInstanceWithBackend` 與 `updatePodPlugins`）：呼叫 `updatePodMcpServers` API + 成功後更新本地狀態
  - [ ] 全專案 grep `useMcpServerStore`，刪除所有 import 與引用

### Phase 4

A. CanvasContainer 整合拆除
  - [ ] 在 `frontend/src/components/canvas/CanvasContainer.vue`：
    - L8 移除 `import McpServerModal from "..."`
    - L84-88 附近移除 McpServerModal 的 v-model state 與 props 綁定
    - L292 / L318 附近移除 `handleMcpServerNoteCreate` 等對應 callback
    - 確認 template 內已無 `<McpServerModal />` 標籤殘留

B. CanvasPod 整合
  - [ ] 在 `frontend/src/components/pod/CanvasPod.vue`：
    - 移除 L46 `mcpServerStore` 解構
    - 移除 L76-78 `boundMcpServerNotes` computed
    - 移除 L371 `@mcp-server-dropped` listener
    - 移除 `usePodNoteBinding` 入參中的 `mcpServerStore`
    - 新增 `import McpPopover from "@/components/pod/McpPopover.vue"`
    - 新增 computed `podMcpActiveCount = computed(() => props.pod.mcpServerNames?.length ?? 0)`
    - 新增 ref `showMcpPopover = ref(false)` 與 `mcpAnchorRect = ref<DOMRect | null>(null)`
    - 新增 handler `handleMcpClick(event)`：取 anchor rect、開 popover
    - PodSlots 標籤新增 props `:mcp-active-count` 與 emit `@mcp-clicked="handleMcpClick"`
    - 移除 PodSlots 上殘留的 `:bound-mcp-server-notes` 與 `@mcp-server-dropped`
    - template 末尾新增 `<McpPopover v-if="showMcpPopover && mcpAnchorRect" ... @close="showMcpPopover = false" />`
    - 確認 `pod-with-mcp-server-notch` 類別仍保留供 CSS notch 用

C. PodSlots 重構
  - [ ] 在 `frontend/src/components/pod/PodSlots.vue`：
    - 移除 import `useMcpServerStore`、移除 `mcpServerStore` 區域變數
    - 移除 props `boundMcpServerNotes`
    - 移除 emits `mcp-server-dropped`
    - 新增 props `mcpActiveCount: number`
    - 新增 emits `mcp-clicked: [event: MouseEvent]`
    - 移除 `MultiSlotConfig` 型別與 `createMcpSlotConfig` function
    - 移除 `slotConfigs` 陣列中 `createMcpSlotConfig()` 一筆
    - 移除 template 中 `PodMultiBindSlot` 分支（若無其他 multi 用途，整段刪掉並從 import 移除 `PodMultiBindSlot`）
    - 新增 import `PodMcpSlot from "@/components/pod/PodMcpSlot.vue"`
    - 在 template 中 `PodPluginSlot` 旁邊並列加入 `<PodMcpSlot ... @click="(ev) => emit('mcp-clicked', ev)" />`
    - 透過 `usePodCapabilities` 取 `isMcpEnabled`，傳給 `PodMcpSlot` 的 `capability-disabled`

D. usePodNoteBinding 清理
  - [ ] 在 `frontend/src/composables/pod/usePodNoteBinding.ts` 移除 `mcpServerStore` 入參、`mcpServer` 分支處理
  - [ ] 全專案 grep 此 composable 的 caller，確認入參都已更新

### Phase 5（可並行）

A. Note event handlers 清理
  - [ ] 在 `frontend/src/composables/eventHandlers/noteEventHandlers.ts`：
    - 移除 L118-120 `mcpServerNoteHandlers`
    - 移除 L180-199 `handleMcpServerCreated` / `handleMcpServerUpdated`
    - 移除 L202+ `handleMcpServerDeleted`
    - 移除所有對 `useMcpServerStore` / `validateMcpServer` / `McpServer` 型別的 import
    - 從事件註冊陣列移除所有 `MCP_SERVER_*` / `MCP_SERVER_NOTE_*` listener

B. Pod event handlers 清理
  - [ ] 在 `frontend/src/composables/eventHandlers/podEventHandlers.ts`：
    - 移除 L197-203 `POD_MCP_SERVER_BOUND` / `POD_MCP_SERVER_UNBOUND` 兩筆 listener
  - [ ] 確認沒有其他地方掛 `POD_MCP_SERVER_*` listener

C. Delete resource / selection 清理
  - [ ] 在 `frontend/src/composables/canvas/useDeleteResource.ts`：
    - 移除 L7 import 內 `McpServer` 相關項
    - 移除 L31-34 / L62 / L94 三段 mcpServer 分支
  - [ ] 在 `frontend/src/composables/canvas/useDeleteSelection.ts`：
    - 移除 L23-27 mcpServerNote 支援片段
    - 確認 selection 型別 union 不再含 `mcpServerNote`

D. ToastCategory 清理
  - [ ] 在 `frontend/src/composables/useToast.ts` L21 `ToastCategory` union 移除 `"McpServer"`（若只有 MCP 用到）
  - [ ] 全專案 grep `ToastCategory` 用法，確認沒有殘留呼叫 `"McpServer"`

E. 驗證型別檔殘留
  - [ ] 刪除 `frontend/src/types/mcpServer.ts`（如存在，含 `McpServer` / `McpServerNote` 型別）
  - [ ] 從 `frontend/src/types/index.ts` 移除 `McpServer` / `McpServerNote` 的 re-export
  - [ ] 全專案 grep `McpServerNote` 與 `McpServer`（保留 `McpListItem`），全數刪除引用

### Phase 6

A. Canvas paste / 其他附帶清理
  - [ ] 全專案 grep `mcpServer`（小寫開頭）與 `MCP_SERVER`：
    - 處理 `frontend/src/composables/canvas/useCanvasContext.ts`（如有 `mcpServerStore` 注入則移除）
    - 處理 `frontend/src/composables/canvas/pasteHelpers.ts` 與相關 schema（`paste` 流程不再支援 mcpServerNote）
    - 處理 `frontend/src/utils/copyPaste*`（若有 mcpServerNote 處理分支整段移除）
    - 處理 NoteFactory / factories（移除 mcpServerNote factory）
  - [ ] 處理 `frontend/src/components/canvas/NotesLayer.vue` 或對應 note 渲染檔，移除 mcpServerNote 渲染分支
  - [ ] 全專案 grep `mcpServerNote`，確認 0 殘留

B. Canvas note 型別與 store 索引清理
  - [ ] 在 note 型別 barrel（如 `frontend/src/types/note.ts`）移除 `McpServerNote` 與 `Note` union 中的對應變體
  - [ ] 在 `frontend/src/stores/note/index.ts` 確認 export 無殘留 mcpServerStore 引用

### Phase 7

A. 測試案例撰寫
  - [ ] 在 `frontend/src/components/pod/__tests__/McpPopover.spec.ts` 撰寫案例 1–6、10–11、13–14
    - 使用 `vi.mock` 模擬 `mcpApi.listMcpServers` 的回傳
    - 透過 `pinia` test setup 替換 podStore 狀態
  - [ ] 在 `frontend/src/components/pod/__tests__/PodMcpSlot.spec.ts` 撰寫案例 12（Claude 顯示數字 / Codex 不顯示數字、active class 正確套用）
  - [ ] 在 `frontend/src/components/pod/__tests__/CanvasPod.mcp.spec.ts` 補一條整合測試，覆蓋 popover 開關 + props 傳遞
  - [ ] 用 `bun run test` 全跑一次，把舊 MCP 相關測試（McpServerModal / mcpServerStore / mcp-server bind 等）連根刪除

B. 手動回歸檢查（操作確認）
  - [ ] 確認 Claude pod 點 MCP slot 可開 popover、能 toggle
  - [ ] 確認 Codex pod 點 MCP slot 可開 popover、唯讀展示
  - [ ] 確認 pod busy 時 toggle 被鎖
  - [ ] 確認外部 `claude mcp add` / `claude mcp remove` 後重開 popover 列表會更新
  - [ ] 確認 pod provider 切換後 popover 行為正確切換

---

## 完成判定

- 所有 Phase Todo 完成
- 全專案 grep 無 `McpServerModal` / `useMcpServerModal` / `useMcpServerStore` / `McpServerNote` / `mcpServerIds` 殘留
- `bun run test` 全綠
- `bun run style` 無 lint / type 錯誤
- 三語 locale 檔同步（無孤兒 key、無缺漏 key）
- **若有改後端，記得提醒使用者重啟後端**

---

## 備註

- 後端事件 `MCP_LIST` / `MCP_LIST_RESULT` / `POD_SET_MCP_SERVERS` / `POD_MCP_SERVERS_SET` 的詳細 schema 由 backend 計畫定義；前端僅按本書約定的 payload 形狀使用
- 因從 ID-based 改為 name-based，舊 pod 的 `mcpServerIds` 由後端 migration 清空轉為 `mcpServerNames: []`，前端不需做額外資料遷移處理
- 所有錯誤訊息、UI 文案以 zh-TW 為主，en / ja 須同步
