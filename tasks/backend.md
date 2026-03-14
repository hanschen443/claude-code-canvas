# Trigger Settlement Model - 後端實作計畫書

## 背景

Multi-Instance Run 模式下，AI-decide connection 拒絕時，下游 multi-input pod 永遠卡在 pending。
原因：`cascadeSkipUnreachablePods` 使用 `every`（ALL sources skip/error 才 skip），
但 multi-input pod 只要 ANY auto-triggerable source 不可達，整條 auto pathway 就不可達。

## 核心概念：Trigger Settlement Model

用 `expectedTriggers` / `settledTriggers` 取代現有 `completePodInstance` + `cascadeSkipUnreachablePods`。

### 觸發路徑（Trigger Pathway）

每個 pod 有最多 2 條觸發路徑：
1. **auto-triggerable 路徑**（auto + ai-decide connections 合併為 1 條）
2. **direct 路徑**（所有 direct connections 合併為 1 條）

`expectedTriggers` = 擁有的路徑數量（0~2），最少為 1。

### 不可達判定

- **Auto 路徑**：ANY auto-triggerable source 是 skipped/error -> 不可達（因為 multi-input 需要全部 auto-triggerable 摘要）
- **Direct 路徑**：ALL direct sources 都是 skipped/error -> 不可達

### 完成判定

- `settledTriggers >= expectedTriggers` 且 `status !== 'pending'`（曾被觸發）-> completed
- `settledTriggers >= expectedTriggers` 且 `status === 'pending'`（從未觸發）-> skipped

---

## 測試案例清單

建立 `backend/tests/unit/triggerSettlement.test.ts`

### calculateExpectedTriggers

- 源頭 pod（sourcePod === podId）固定回傳 1
- 只有 auto connections 的 pod 回傳 1
- 只有 ai-decide connections 的 pod 回傳 1
- 混合 auto + ai-decide connections 的 pod 回傳 1（合併為同一路徑）
- 只有 direct connections 的 pod 回傳 1
- 混合 auto + direct connections 的 pod 回傳 2
- 混合 ai-decide + direct connections 的 pod 回傳 2
- 混合 auto + ai-decide + direct connections 的 pod 回傳 2
- 不在 chain 中的 connection 不計算（chainPodIds 過濾）
- 沒有 chain connections 時回傳 1（fallback）

### settlePodTrigger

- settledTriggers < expectedTriggers 時不做任何事
- settledTriggers >= expectedTriggers 且 status !== 'pending' 時設為 completed
- 呼叫 evaluateRunStatus 檢查 Run 整體狀態

### settleAndSkipPath

- settledTriggers < expectedTriggers 時不做任何事
- settledTriggers >= expectedTriggers 且 status !== 'pending' 時設為 completed
- settledTriggers >= expectedTriggers 且 status === 'pending' 時設為 skipped
- 支援 count 參數一次累加多個

### settleUnreachablePaths

- 線性鏈：A -> B -> C，A skipped，B 和 C 都被 skip
- 菱形拓撲 auto-only：A -> B, A -> C, B -> D, C -> D（全 auto），B skipped -> D 被 skip（ANY auto 不可達）
- 菱形拓撲 mixed：B(auto) -> D, C(direct) -> D，B skipped -> D 的 auto 路徑被 settle，但 direct 未 settle，D 不一定被 skip
- 菱形拓撲 direct-only：B(direct) -> D, C(direct) -> D，B skipped, C completed -> D 不被 skip（ALL direct 才算不可達）
- 菱形拓撲 direct-only 全 skip：B(direct) -> D, C(direct) -> D，B skipped, C skipped -> D 被 skip
- 多層級聯傳播：A -> B -> C -> D，A skipped，B/C/D 全被 skip（while 迴圈持續直到無新變化）
- safety limit 達到上限時停止（不無限迴圈）
- 已完成的 pod 不受影響（status 非 pending 跳過）
- 不在 run 中的 pod 不受影響

### evaluateRunStatus 整合

- 所有 pod completed/skipped -> run completed
- 有 error 且無 in-progress -> run error
- 呼叫 settleUnreachablePaths 後再判斷

### 端到端場景

- AI-decide 拒絕 -> target pod skipped -> 下游 cascade skip -> run 正確完成
- AI-decide 錯誤 -> target pod error -> 下游 cascade skip -> run 正確完成
- 多 incoming source，一條被 reject 一條完成 -> 正確判定不可達

---

## 實作步驟

### 第 1 步：修改 DB Schema

- [ ] 修改 `backend/src/database/schema.ts` — `run_pod_instances` 表新增欄位
  - 在 `completed_at TEXT` 後面新增 `expected_triggers INTEGER NOT NULL DEFAULT 1`
  - 再新增 `settled_triggers INTEGER NOT NULL DEFAULT 0`

### 第 2 步：修改 Prepared Statements

- [ ] 修改 `backend/src/database/statements.ts` — `runPodInstance` 區塊
  - 修改 `insert` 語句：加入 `expected_triggers` 和 `settled_triggers` 欄位，對應參數 `$expectedTriggers` 和 `$settledTriggers`
  - 新增 `incrementSettledTriggers` 語句：`UPDATE run_pod_instances SET settled_triggers = settled_triggers + $count WHERE id = $id`
  - 新增 `updateExpectedTriggers` 語句：`UPDATE run_pod_instances SET expected_triggers = $expectedTriggers WHERE id = $id`
  - 在 buildStatements 回傳型別中的 `runPodInstance` 區塊新增對應的型別宣告

### 第 3 步：修改 RunStore

- [ ] 修改 `backend/src/services/runStore.ts`
  - `RunPodInstance` interface 新增 `expectedTriggers: number` 和 `settledTriggers: number`
  - `RunPodInstanceRow` interface 新增 `expected_triggers: number` 和 `settled_triggers: number`
  - `rowToRunPodInstance` 映射新增 `expectedTriggers: row.expected_triggers` 和 `settledTriggers: row.settled_triggers`
  - `createPodInstance` 方法：新增第三個參數 `expectedTriggers: number = 1`，在 instance 物件及 insert 語句中使用
  - 新增 `incrementSettledTriggers(instanceId: string, count: number = 1): void` 方法，呼叫對應 prepared statement
  - 新增 `updateExpectedTriggers(instanceId: string, expectedTriggers: number): void` 方法，呼叫對應 prepared statement

### 第 4 步：修改 Run Types

- [ ] 修改 `backend/src/types/run.ts` — `RunPodStatusChangedPayload`
  - 新增 `expectedTriggers?: number` 和 `settledTriggers?: number` 屬性

### 第 5 步：修改 RunExecutionService（核心）

- [ ] 修改 `backend/src/services/workflow/runExecutionService.ts`

  **5-1. 新增 import**
  - 從 `connectionStore.js` import `connectionStore`
  - 從 `workflowHelpers.js` import `isAutoTriggerable`

  **5-2. 新增 `calculateExpectedTriggers` 靜態方法**
  - 參數：`canvasId: string, podId: string, sourcePodId: string, chainPodIds: string[]`
  - 回傳：`number`
  - 邏輯：
    - 若 `podId === sourcePodId` 回傳 1（源頭 pod）
    - 取得 `connectionStore.findByTargetPodId(canvasId, podId)`
    - 過濾出 `chainConnections`：`sourcePodId` 在 `chainPodIds` 中的 connections
    - `hasAutoTriggerable` = chainConnections 中是否有任何 `isAutoTriggerable(c.triggerMode)`
    - `hasDirect` = chainConnections 中是否有任何 `c.triggerMode === 'direct'`
    - `result = (hasAutoTriggerable ? 1 : 0) + (hasDirect ? 1 : 0)`
    - 回傳 `result || 1`（最少為 1）

  **5-3. 修改 `createRun` 方法**
  - 取得 `chainPodIds` 後（已有 `collectChainPodIds` 呼叫），建立 instances 時傳入 expectedTriggers：
    - 改為 `chainPodIds.map(podId => runStore.createPodInstance(workflowRun.id, podId, this.calculateExpectedTriggers(canvasId, podId, sourcePodId, chainPodIds)))`
  - 注意 `calculateExpectedTriggers` 需改為非 private 的 instance method（或 private 也可，因為只在 class 內使用）

  **5-4. 新增 `settlePodTrigger` 方法（取代 `completePodInstance`）**
  - 參數：`runContext: RunContext, podId: string`
  - 邏輯：
    - 取得 instance：`runStore.getPodInstance(runContext.runId, podId)`，若不存在 warn 並 return
    - `runStore.incrementSettledTriggers(instance.id)`
    - 重新讀取 instance（因為 increment 是 DB 操作，需要最新值）
    - 若 `updatedInstance.settledTriggers < updatedInstance.expectedTriggers` -> 直接 return（不動作）
    - 若 `updatedInstance.status !== 'pending'`（曾被觸發） -> 呼叫 `this.updateAndEmitPodInstanceStatus(runContext, podId, 'completed', { evaluateRun: true })`
    - 注意：不處理 `status === 'pending'` 的情況，那是 `settleAndSkipPath` 的責任

  **5-5. 新增 `settleAndSkipPath` 方法**
  - 參數：`runContext: RunContext, podId: string, count: number = 1`
  - 邏輯：
    - 取得 instance，若不存在 warn 並 return
    - `runStore.incrementSettledTriggers(instance.id, count)`
    - 重新讀取 instance
    - 若 `settledTriggers < expectedTriggers` -> return
    - 若 `status !== 'pending'`（曾被觸發） -> `updateAndEmitPodInstanceStatus(runContext, podId, 'completed', { evaluateRun: true })`
    - 若 `status === 'pending'`（從未觸發） -> `updateAndEmitPodInstanceStatus(runContext, podId, 'skipped', { evaluateRun: true })`

  **5-6. 新增 `settleUnreachablePaths` 方法**
  - 參數：`runId: string, canvasId: string`
  - 回傳：`void`
  - 此方法不呼叫 `settlePodTrigger` / `settleAndSkipPath`，直接操作 DB 和 emit WebSocket，避免遞迴呼叫 `evaluateRunStatus`
  - 邏輯詳述：
    ```
    1. 取得所有 instances = runStore.getPodInstancesByRunId(runId)
    2. 取得所有 connections = connectionStore.list(canvasId)
    3. safetyLimit = instances.length
    4. while 迴圈：
       a. changed = false
       b. 遍歷每個 instance：
          - 跳過非 pending 的 instance（已有明確狀態的不處理）
          - 取得該 pod 的 incoming connections（從 connections 過濾 targetPodId === instance.podId）
          - 只考慮 source 在 run 中的 connections（sourcePodId 存在於 instances 的 podId 集合中）
          - 分類為 autoTriggerableConns 和 directConns
          - 判斷 auto 路徑是否不可達：
            autoUnreachable = autoTriggerableConns.length > 0 且 ANY source 的 status 是 'skipped' 或 'error'
          - 判斷 direct 路徑是否不可達：
            directUnreachable = directConns.length > 0 且 ALL source 的 status 是 'skipped' 或 'error'
          - 計算本輪要 settle 的 count：
            settleCount = (autoUnreachable ? 1 : 0) + (directUnreachable ? 1 : 0)
          - 若 settleCount > 0：
            - DB: runStore.incrementSettledTriggers(instance.id, settleCount)
            - 重新讀取 instance 狀態
            - 若 settledTriggers >= expectedTriggers：
              - status === 'pending' -> 更新為 'skipped'
              - status !== 'pending' -> 更新為 'completed'
              - 使用 runStore.updatePodInstanceStatus 更新 DB
              - emit RUN_POD_STATUS_CHANGED WebSocket 事件
              - 同步更新 instances 陣列中的 status（讓下一輪 while 看到最新狀態）
            - changed = true
       c. safetyLimit--
       d. 若 !changed 或 safetyLimit <= 0 -> break
    5. safetyLimit <= 0 時 log warning
    ```

  **5-7. 修改 `evaluateRunStatus` 方法**
  - 在方法開頭、取得 instances 之前，呼叫 `this.settleUnreachablePaths(runId, canvasId)`
  - 其餘邏輯不變

  **5-8. 修改 `updateAndEmitPodInstanceStatus` — emit payload 加入新欄位**
  - 在 emit `RUN_POD_STATUS_CHANGED` 時，payload 中新增 `expectedTriggers` 和 `settledTriggers`
  - 這需要重新讀取 instance 或從已有資料取得（建議重新讀取以確保最新值）

  **5-9. 保留 `completePodInstance`、`skipPodInstance` 等方法**
  - `completePodInstance` 保留但不再直接呼叫 `evaluateRun`，改為呼叫 `settlePodTrigger`
  - 不對，重新思考：`completePodInstance` 的語義是「這個 pod 的工作做完了」，`settlePodTrigger` 的語義是「結算一條觸發路徑」。兩者不完全等價。
  - **最終決定**：
    - `completePodInstance` -> 改名/改實作為 `settlePodTrigger`（因為 pod 完成就是它對應的觸發路徑完成了）
    - 原本呼叫 `completePodInstance` 的地方全部改呼叫 `settlePodTrigger`
    - `skipPodInstance` 保留，用於直接將 pod 標記為 skipped（如 AI-decide reject 的 target pod），但不再觸發 cascade
    - `errorPodInstance` 保留，用於直接將 pod 標記為 error，但不再觸發 cascade

### 第 6 步：修改 WorkflowAiDecideTriggerService

- [ ] 修改 `backend/src/services/workflow/workflowAiDecideTriggerService.ts`

  **6-1. 刪除 `cascadeSkipUnreachablePods` 方法**
  - 完全移除此方法，不可達判定改由 `settleUnreachablePaths` 處理

  **6-2. 修改 `handleRejectedConnection`**
  - Run 模式分支（`else` 分支）：
    - 將 `runExecutionService.skipPodInstance(runContext, connection.targetPodId)` 改為 `runExecutionService.settleAndSkipPath(runContext, connection.targetPodId)` — AI 拒絕表示 auto pathway 的一條 source 不可達，結算該路徑
    - 刪除 `this.cascadeSkipUnreachablePods(...)` 呼叫（cascade 由 evaluateRunStatus -> settleUnreachablePaths 處理）
    - 注意：多條 ai-decide 都拒絕時會呼叫多次 settleAndSkipPath，造成 settledTriggers over-count（>= 判定不受影響，接受此行為）

  **6-3. 修改 `handleErrorConnection`**
  - Run 模式分支（`else` 分支）：
    - 保留 `runExecutionService.errorPodInstance(runContext, connection.targetPodId, errorMessage)` — error 代表服務異常，使用者需要看到 error 狀態（紅色），不是被「正常跳過」
    - 刪除 `this.cascadeSkipUnreachablePods(...)` 呼叫
    - cascade 由 evaluateRunStatus -> settleUnreachablePaths 偵測 error pod 下游不可達並 settle

  **6-4. 移除不再需要的 imports/dependencies**
  - 移除 `runStore` import（不再需要直接操作 runStore）
  - 如果 `connectionStore` 的 `list` 方法也不再被使用可以從 deps 中移除

### 第 7 步：修改 WorkflowExecutionService

- [ ] 修改 `backend/src/services/workflow/workflowExecutionService.ts`

  **7-1. `updateSummaryStatus` 方法**
  - 將 `runExecutionService.completePodInstance(runContext, sourcePodId)` 改為 `runExecutionService.settlePodTrigger(runContext, sourcePodId)`

  **7-2. `onWorkflowChatComplete` 方法**
  - 將 `runExecutionService.completePodInstance(runContext, targetPodId)` 改為 `runExecutionService.settlePodTrigger(runContext, targetPodId)`

### 第 8 步：修改 chatCallbacks

- [ ] 修改 `backend/src/utils/chatCallbacks.ts`
  - `onRunChatComplete` 中將 `runExecutionService.completePodInstance(runContext, podId)` 改為 `runExecutionService.settlePodTrigger(runContext, podId)`

### 第 9 步：修改 Mock Factories 和 Spy Setup

- [ ] 修改 `backend/tests/mocks/workflowTestFactories.ts`
  - `createMockRunPodInstance` 新增 `expectedTriggers: 1` 和 `settledTriggers: 0` 預設值

- [ ] 修改 `backend/tests/mocks/workflowSpySetup.ts`
  - `setupRunStoreSpy` 中 `createPodInstance` mock 的回傳值新增 `expectedTriggers: 1, settledTriggers: 0`
  - 新增 `incrementSettledTriggers` spy：`vi.spyOn(runStore, 'incrementSettledTriggers').mockImplementation(() => {})`
  - 新增 `updateExpectedTriggers` spy：`vi.spyOn(runStore, 'updateExpectedTriggers').mockImplementation(() => {})`
  - `setupRunExecutionServiceSpy` 中：
    - 將 `completePodInstance` spy 改為 `settlePodTrigger`：`vi.spyOn(runExecutionService, 'settlePodTrigger').mockImplementation(() => {})`
    - 新增 `settleAndSkipPath` spy：`vi.spyOn(runExecutionService, 'settleAndSkipPath').mockImplementation(() => {})`
    - 移除 `completePodInstance` spy（方法已不存在）

### 第 10 步：撰寫測試

- [ ] 建立 `backend/tests/unit/triggerSettlement.test.ts`

  **10-1. 測試環境設定**
  - import 必要模組：`runExecutionService`, `runStore`, `connectionStore`, `socketService`, `logger`
  - import mock helpers：`setupAllSpies`, `createMockRunPodInstance`, `createMockConnection`, `createMockRunContext`
  - beforeEach 呼叫 `setupAllSpies()` 設定所有 spy

  **10-2. calculateExpectedTriggers 測試**
  - 直接測試 runExecutionService 上的方法（需要先確認是否為 public 或用其他方式暴露）
  - 若為 private，則透過 createRun 間接測試（觀察 createPodInstance 被呼叫時的 expectedTriggers 參數）
  - **建議**：將 `calculateExpectedTriggers` 設為 public static 或獨立 export 的純函式，便於單元測試
    - 從 `runExecutionService.ts` 中 export 出 `calculateExpectedTriggers` 函式
    - 測試案例如上方清單所列

  **10-3. settlePodTrigger 測試**
  - mock `runStore.getPodInstance` 回傳不同 expectedTriggers/settledTriggers 組合
  - mock `runStore.incrementSettledTriggers`
  - 第二次 `runStore.getPodInstance` 回傳 increment 後的結果
  - 驗證：
    - settledTriggers < expectedTriggers -> 不呼叫 updatePodInstanceStatus
    - settledTriggers >= expectedTriggers 且 status 為 'running' -> 呼叫 updatePodInstanceStatus('completed')
    - 呼叫 evaluateRunStatus（透過觀察 socketService.emitToCanvas 是否有 RUN_STATUS_CHANGED 事件）

  **10-4. settleAndSkipPath 測試**
  - 類似 settlePodTrigger 但多驗證：
    - settledTriggers >= expectedTriggers 且 status === 'pending' -> 更新為 'skipped'
    - count 參數正確傳遞到 incrementSettledTriggers

  **10-5. settleUnreachablePaths 測試**（重點）
  - 準備 mock instances 和 connections 組合
  - 測試各種拓撲場景（如上方清單）
  - 重點驗證：
    - auto 路徑 ANY source skip -> settle
    - direct 路徑 ALL source skip -> settle
    - while 迴圈多輪傳播
    - 不影響已完成的 pod

  **10-6. 端到端整合場景測試**
  - AI-decide reject -> skip -> settleUnreachablePaths -> run completed
  - 驗證 evaluateRunStatus 在 settle 後正確判斷 run 最終狀態

### 第 11 步：確認沒有遺漏的 completePodInstance 呼叫

- [ ] 全域搜尋 `completePodInstance`，確認所有呼叫點都已改為 `settlePodTrigger`
  - `workflowExecutionService.ts` — `updateSummaryStatus` 和 `onWorkflowChatComplete`
  - `chatCallbacks.ts` — `onRunChatComplete`
  - `runExecutionService.ts` — 方法本身改名
  - mock/test files — 同步更新

### 第 12 步：驗證

- [ ] 執行 `bun run style` 確認 ESLint 和 TypeScript 沒有錯誤
- [ ] 執行 `bun run test` 確認所有測試通過
- [ ] 告知使用者需要重啟後端服務（因為修改了後端程式碼）
- [ ] 告知使用者需要刪除 DB 檔案重建（因為修改了 schema）
