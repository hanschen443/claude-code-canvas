# Command 功能跨 Provider 支援

## 使用者在 Claude Pod 使用 Command

### 情境：使用者在綁定 Command 的 Claude Pod 送出訊息
- Given 使用者已在 Claude Pod 上綁定一個 Command
- When 使用者在輸入框輸入訊息並送出
- Then Pod 會依照該 Command 的指示回應使用者的訊息

### 情境：使用者切換 Claude Pod 綁定的 Command
- Given 使用者的 Claude Pod 已綁定 Command A
- When 使用者把 Command 切換成 Command B 並送出新的訊息
- Then Pod 會依照 Command B 的指示回應，而不是 Command A

### 情境：使用者把 Claude Pod 的 Command 解除綁定
- Given 使用者的 Claude Pod 原本綁定了 Command
- When 使用者將 Command 解除綁定後送出訊息
- Then Pod 會以一般對話方式回應，不再套用任何 Command 指示

## 使用者在 Codex Pod 使用 Command

### 情境：使用者首次在 Codex Pod 選擇 Command
- Given 使用者在 Codex Pod 的介面上
- When 使用者打開 Command 選單
- Then 看到和 Claude Pod 一樣的 Command 清單可供選擇

### 情境：使用者在綁定 Command 的 Codex Pod 送出訊息
- Given 使用者已在 Codex Pod 上綁定一個 Command
- When 使用者在輸入框輸入訊息並送出
- Then Pod 會依照該 Command 的指示回應使用者的訊息

### 情境：使用者在 Claude 與 Codex Pod 使用同一個 Command
- Given 使用者在 Claude Pod 與 Codex Pod 分別綁定同一個 Command
- When 使用者在兩個 Pod 各自送出相同的訊息
- Then 兩個 Pod 都會依照同一份 Command 指示回應，行為一致

## 沒有綁定 Command 的 Pod

### 情境：使用者在未綁定 Command 的 Pod 送出訊息
- Given 使用者的 Pod 沒有綁定任何 Command
- When 使用者送出訊息
- Then Pod 會以一般對話方式回應

### 情境：使用者在未綁定 Command 的 Pod 輸入看起來像斜線指令的文字
- Given 使用者的 Pod 沒有綁定任何 Command
- When 使用者輸入「/xxx 請幫我...」這種看起來像斜線指令的訊息並送出
- Then Pod 會把這段文字當成一般訊息回應，不會被誤判為 Command

## 多 Provider 切換情境

### 情境：使用者建立新的 Claude Pod 並立即使用 Command
- Given 使用者在畫布上
- When 使用者新增一個 Claude Pod、綁定 Command、輸入訊息並送出
- Then Pod 會依照 Command 指示回應

### 情境：使用者建立新的 Codex Pod 並立即使用 Command
- Given 使用者在畫布上
- When 使用者新增一個 Codex Pod、綁定 Command、輸入訊息並送出
- Then Pod 會依照 Command 指示回應，和 Claude Pod 體驗一致

### 情境：使用者在同一張畫布同時使用多個不同 Provider 的 Pod
- Given 使用者的畫布上同時有 Claude Pod 與 Codex Pod
- When 使用者分別對不同 Pod 送出綁定 Command 的訊息
- Then 每個 Pod 都依照各自綁定的 Command 回應，互不干擾

## Command 檔案異動情境

### 情境：使用者綁定的 Command 檔案已被刪除
- Given 使用者的 Pod 綁定了一個 Command，但該 Command 的檔案已經從資料夾中被刪除
- When 使用者送出訊息
- Then 系統會告知使用者該 Command 已不存在，並提示重新選擇 Command 或解除綁定

### 情境：使用者新增 Command 檔案後在 Pod 選用
- Given 使用者剛在 Command 資料夾中新增了一個 markdown 檔案
- When 使用者在 Pod 上重新打開 Command 選單
- Then 選單中會出現新加入的 Command 可供綁定

### 情境：使用者修改了 Command 檔案內容
- Given 使用者的 Pod 已綁定某個 Command
- When 使用者在檔案編輯器中更新了該 Command 的 markdown 內容，然後在 Pod 送出訊息
- Then Pod 會依照「最新」的 Command 內容回應

## Claude 既有功能相容情境

### 情境：使用者在 Claude Pod 同時使用 Command 與 OutputStyle
- Given 使用者的 Claude Pod 綁定了 Command，並設定了 OutputStyle
- When 使用者送出訊息
- Then Pod 會同時依照 Command 指示回應，並保持 OutputStyle 的輸出樣式

### 情境：使用者在 Claude Pod 搭配 MCP、Plugin、Integration 使用 Command
- Given 使用者的 Claude Pod 綁定了 Command，並啟用了 MCP、Plugin 或 Integration
- When 使用者送出需要這些擴充功能的訊息
- Then Pod 會依照 Command 指示回應，同時正常使用 MCP、Plugin、Integration 的能力
