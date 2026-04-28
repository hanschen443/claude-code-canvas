# Upload API

## POST /api/upload

上傳單一檔案至暫存區（staging）。上傳完成後，**仍須透過 WebSocket 傳送 `uploadSessionId` 才會真正觸發 LLM**；HTTP 上傳階段僅負責接收檔案，不會對 Agent 產生任何作用。

### Request

- **Content-Type**：`multipart/form-data`

| 欄位 | 類型 | 必填 | 說明 |
|------|------|------|------|
| uploadSessionId | string | 是 | UUID v4 格式的上傳 Session ID |
| file | File | 是 | 要上傳的檔案（單一檔案） |

#### 限制

| 項目 | 限制 |
|------|------|
| 單檔大小 | 最大 10 MB |
| 副檔名白名單 | 無限制（任何副檔名皆可上傳） |

### 成功回應 200

```json
{
  "filename": "example.png",
  "size": 204800,
  "mime": "image/png",
  "uploadSessionId": "xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx"
}
```

| 欄位 | 類型 | 說明 |
|------|------|------|
| filename | string | 儲存後的檔名 |
| size | number | 檔案大小（bytes） |
| mime | string | 檔案的 MIME 類型 |
| uploadSessionId | string | 回傳收到的 uploadSessionId |

### 錯誤回應格式

所有錯誤回應 body 統一格式：

```json
{
  "errorCode": "ERROR_CODE",
  "message": "錯誤說明"
}
```

### 錯誤碼表

| 狀態碼 | errorCode | 訊息範例 |
|--------|-----------|---------|
| 400 | `UPLOAD_NO_FILE` | 缺少 file 欄位 / 無法解析上傳表單，請確認請求格式為 multipart/form-data |
| 400 | `UPLOAD_INVALID_SESSION_ID` | 缺少 uploadSessionId 欄位 / uploadSessionId 格式無效，必須為 UUID v4 |
| 400 | `ATTACHMENT_INVALID_NAME` | 檔案名稱包含不合法字元或格式 |
| 413 | `ATTACHMENT_TOO_LARGE` | 檔案超過允許的最大大小（10 MB） |
| 500 | `ATTACHMENT_WRITE_FAILED` | 檔案寫入失敗，請稍後再試 |
| 507 | `ATTACHMENT_DISK_FULL` | 磁碟空間不足，無法儲存檔案 |

### curl 範例

```bash
# 上傳檔案
curl -X POST http://localhost:3001/api/upload \
  -F "uploadSessionId=xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx" \
  -F "file=@/path/to/example.png"
```

> **重要**：呼叫 `/api/upload` 後仍須透過 WebSocket 傳送 `uploadSessionId`，才會真正觸發 LLM 處理該附件。HTTP 上傳階段僅將檔案寫入 staging 目錄，不會主動通知 Agent。
