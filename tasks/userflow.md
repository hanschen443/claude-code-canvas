# Gemini Pod 支援 Command Note 與 Repository Note

## 在 Gemini Pod 綁定 Command Note

### 情境：使用者把 Command Note 拖到 Gemini Pod
- Given 使用者畫布上有一個 Gemini Pod
- When 使用者把一張 Command Note 拖到 Gemini Pod 上
- Then Gemini Pod 顯示已綁定該 Command Note

### 情境：使用者在已綁定 Command Note 的 Gemini Pod 送出訊息
- Given 使用者的 Gemini Pod 已綁定一張 Command Note
- When 使用者在輸入框輸入訊息並送出
- Then Gemini 回覆會把 Command Note 的內容當作前置指令納入考量

### 情境：使用者解綁 Gemini Pod 上的 Command Note
- Given 使用者的 Gemini Pod 已綁定一張 Command Note
- When 使用者把該 Command Note 從 Pod 上解除綁定
- Then Gemini Pod 不再顯示該 Command Note，後續訊息也不會帶上該指令

## 在 Gemini Pod 綁定 Repository Note

### 情境：使用者把 Repository Note 拖到 Gemini Pod
- Given 使用者畫布上有一個 Gemini Pod
- When 使用者把一張 Repository Note 拖到 Gemini Pod 上
- Then Gemini Pod 顯示已綁定該 Repository Note，並切換到對應的工作目錄

### 情境：使用者在已綁定 Repository Note 的 Gemini Pod 送出訊息
- Given 使用者的 Gemini Pod 已綁定一張 Repository Note
- When 使用者送出訊息詢問專案內容
- Then Gemini 會以 Repository Note 對應的目錄為工作環境回覆

### 情境：使用者解綁 Gemini Pod 上的 Repository Note
- Given 使用者的 Gemini Pod 已綁定一張 Repository Note
- When 使用者把該 Repository Note 從 Pod 上解除綁定
- Then Gemini Pod 回到預設工作目錄，後續訊息不再以該專案為工作環境

## 同時綁定 Command Note 與 Repository Note

### 情境：使用者在同一個 Gemini Pod 同時綁定兩種 Note
- Given 使用者畫布上有一個 Gemini Pod
- When 使用者把一張 Command Note 與一張 Repository Note 都綁到同一個 Gemini Pod
- Then Gemini Pod 同時顯示兩張 Note 已綁定

### 情境：使用者在同時綁定兩種 Note 的 Gemini Pod 送出訊息
- Given 使用者的 Gemini Pod 已同時綁定 Command Note 與 Repository Note
- When 使用者送出訊息
- Then Gemini 會在 Repository Note 對應的工作目錄中、依照 Command Note 的指令回覆

## 切換 Pod 的 Provider

### 情境：使用者把已綁定 Note 的 Claude Pod 切換成 Gemini
- Given 使用者的 Claude Pod 已綁定 Command Note 或 Repository Note
- When 使用者把該 Pod 的 provider 切換成 Gemini
- Then Pod 上的 Note 綁定保留，並改由 Gemini 套用相同的指令與工作目錄
- （前端 UI 尚未實作切換入口，本情境僅鎖後端 podStore 行為）

### 情境：使用者把已綁定 Note 的 Gemini Pod 切換成 Claude
- Given 使用者的 Gemini Pod 已綁定 Command Note 或 Repository Note
- When 使用者把該 Pod 的 provider 切換成 Claude
- Then Pod 上的 Note 綁定保留，並改由 Claude 套用相同的指令與工作目錄
- （前端 UI 尚未實作切換入口，本情境僅鎖後端 podStore 行為）

## 邊界情境

### 情境：Command Note 對應的指令內容已被刪除
- Given 使用者的 Gemini Pod 綁定了一張 Command Note，但該 Note 對應的指令來源已不存在
- When 使用者送出訊息
- Then 系統提示使用者該指令找不到，訊息不會被送出或會以未帶指令的形式送出並提醒使用者

### 情境：Repository Note 對應的目錄不存在或無法存取
- Given 使用者的 Gemini Pod 綁定了一張 Repository Note，但該目錄已被移除或無權限存取
- When 使用者送出訊息
- Then 系統提示使用者該專案目錄無法使用，請重新選擇或解除綁定

### 情境：使用者在 Gemini 能力尚未載入完成時嘗試拖入 Note
- Given 使用者剛開啟畫布，Gemini Pod 的能力資訊尚未載入完成
- When 使用者立刻把 Note 拖到 Gemini Pod 上
- Then 等能力載入完成後才允許綁定，或暫時提示使用者稍候再試
