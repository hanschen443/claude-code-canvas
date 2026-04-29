# Backend 計畫書：Gemini Pod 套上 macOS Seatbelt Sandbox

## 使用者情境

引用自 `tasks/userflow.md`：

- 使用者請 Gemini 讀取或分析專案內檔案 → 成功
- 使用者請 Gemini 修改專案內檔案 → 成功
- 使用者請 Gemini 修改工作目錄外檔案 → Gemini 回報權限失敗，流程不中斷
- 使用者繼續既有 Gemini 對話 → 沙箱依然生效

## 關鍵決策（已對齊，照做）

1. 透過在 `gemini` CLI 啟動參數加 `-s` flag 啟用 sandbox
2. `-s` 位置：緊接 `--skip-trust` 之後、`--prompt` 之前
3. 使用 Gemini CLI 預設 profile `permissive-open`，不顯式設定 `SEATBELT_PROFILE`
4. 環境變數白名單維持現狀（`PATH, HOME, LANG, LC_ALL, TERM`），不加入 `SEATBELT_PROFILE`
5. `-s` 寫死，無 feature flag、無開關
6. 維持 `--approval-mode yolo` 與 `--skip-trust` 不變
7. 不需要向後相容

## 測試案例（先列名稱，不寫實作）

### Mock 邊界

- **Mock**：`Bun.spawn`（沿用既有測試風格 `vi.spyOn(Bun, "spawn")`）
- **不 Mock**：`geminiProvider` 內部所有自家邏輯，包含 `buildNewSessionArgs`、`buildResumeArgs`、`spawnGeminiProcess` 等。理由：本次驗證重點在於「最終傳給 `Bun.spawn` 的 args 陣列是否包含 `-s` 且位置正確」，自家邏輯必須真實執行，否則無法驗證 args 組合。
- **不 Mock**：第三方 library 內部，僅在最外層 wrapper（`Bun.spawn`）切點。

### 需要新增的測試

- new session 的 spawn args 必含 `-s`
- resume 的 spawn args 必含 `-s`

> 兩個新增測試使用 `expect(spawnArgs).toContain("-s")`，避免綁死順序。

### 需要修改的既有測試

- **C1（`backend/tests/provider/geminiProvider.test.ts` 第 146-157 行）**：使用 `expect(spawnArgs).toEqual([...])` 精確比對完整陣列，需要把 `-s` 加進預期陣列中 `--skip-trust` 之後、`--prompt` 之前。

### 不需要修改的既有測試（含理由）

- **C4（`backend/tests/provider/geminiProvider.test.ts` 第 257-260 行）**：使用 `spawnArgs[length-2]` 與 `spawnArgs[length-1]` 倒數位置斷言 prompt。`-s` 插在 `--skip-trust` 之後、`--prompt` 之前，最後兩個元素仍然是 `--prompt` 與 `promptText`，倒數位置不變，因此 C4 不需修改。
- 其餘 20 個 test case 採 `indexOf` + 相對位置斷言，不會因 `-s` 加入而打壞，但仍需透過 `bun run test` 跑迴歸確認。

## 實作計畫

### Phase 1

A. 在 `geminiProvider` 兩處 spawn args 加入 `-s`
  - [ ] 修改 `backend/src/services/provider/geminiProvider.ts` 的 `buildNewSessionArgs()`（第 100-111 行）：在 `--skip-trust` 之後、`--prompt` 之前插入 `-s`
  - [ ] 修改 `backend/src/services/provider/geminiProvider.ts` 的 resume args 區塊（第 123-140 行）：在 `--skip-trust` 之後、`--prompt` 之前插入 `-s`

### Phase 2（可並行）

A. 修改既有 C1 測試
  - [ ] 修改 `backend/tests/provider/geminiProvider.test.ts` 第 146-157 行的 C1 測試：在 `expect(spawnArgs).toEqual([...])` 預期陣列中，於 `--skip-trust` 與 `--prompt` 之間插入 `-s`

B. 新增 new session 含 `-s` 測試
  - [ ] 在 `backend/tests/provider/geminiProvider.test.ts` 新增測試：「new session 的 spawn args 必含 `-s`」
    - 使用 `vi.spyOn(Bun, "spawn")` 取得實際傳入的 args
    - 斷言 `expect(spawnArgs).toContain("-s")`

C. 新增 resume 含 `-s` 測試
  - [ ] 在 `backend/tests/provider/geminiProvider.test.ts` 新增測試：「resume 的 spawn args 必含 `-s`」
    - 使用 `vi.spyOn(Bun, "spawn")` 取得實際傳入的 args
    - 斷言 `expect(spawnArgs).toContain("-s")`

### Phase 3

A. 跑迴歸驗證
  - [ ] 在 `backend/` 跑 `bun run test`，確認所有測試通過（包含未直接修改的 20 個 test case）
  - [ ] 在 `backend/` 跑 `bun run style`，確認 eslint 與 type check 通過

## 收尾事項

- [ ] 提醒使用者：本次改動到後端程式碼，需要重啟後端服務才會生效
- 不需要更新 API 文件 skill：本次不是新增 / 更新 / 刪除 API Router，只是在 spawn args 加 flag
