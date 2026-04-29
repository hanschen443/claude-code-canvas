# Gemini Pod 沙箱化使用者情境

## Gemini Pod 在工作目錄內的操作

### 情境：使用者請 Gemini 讀取或分析專案內檔案
- Given 使用者已開啟 Gemini Pod 並在工作目錄中工作
- When 使用者請 Gemini 讀取或分析專案內任何一個檔案
- Then Gemini 能順利讀取檔案內容並完成分析回覆

### 情境：使用者請 Gemini 修改專案內檔案
- Given 使用者已開啟 Gemini Pod 並在工作目錄中工作
- When 使用者請 Gemini 修改一個位於工作目錄底下的檔案
- Then Gemini 能順利寫入該檔案，使用者可以看到檔案被更新

## Gemini Pod 在工作目錄外的操作

### 情境：使用者請 Gemini 修改工作目錄以外的檔案
- Given 使用者已開啟 Gemini Pod 並在工作目錄中工作
- When 使用者請 Gemini 修改一個位於工作目錄之外的檔案（例如家目錄底下的某個檔案）
- Then Gemini 回報無法寫入並說明是權限限制造成
- And 對話流程不會卡死或中斷，使用者可以繼續下達其他指令

## 繼續既有對話

### 情境：使用者繼續一個既有的 Gemini 對話
- Given 使用者之前已經跟 Gemini 對話過，並關閉了 Pod
- When 使用者重新開啟同一個 Gemini 對話繼續工作
- Then Gemini 在這個續接的對話中，仍然只能寫入工作目錄、無法寫入工作目錄之外的檔案
