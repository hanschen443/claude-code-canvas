# Pod Model Selector UI 改版 User Flow

## 切換 Pod 所用的 AI Model

### 情境：使用者查看 Pod 預設狀態
- Given 使用者在 Canvas 上看到一個 Pod
- When 沒有任何滑鼠動作、只是單純看著 Pod
- Then 使用者在 Pod 的上方中央看到一個橫向寬版 tag，寬度大約是 Pod 上緣寬度的一半，tag 上只顯示目前這個 Pod 正在使用的 model 名稱（例如 Sonnet）
- And 看不到其他兩個 model 選項

### 情境：使用者把滑鼠移到 model tag 上
- Given 使用者看到 Pod 上方只有顯示當前 model 的橫向 tag
- When 使用者把滑鼠移到那個 tag 上
- Then 整個 model selector 會先「扶起來」（整體往上提一小段距離）
- And 另外兩個 model 選項從上方垂直堆疊長出來
- And 當前使用中的 model 停留在最下方（貼近 Pod），另外兩個選項往上排列
- And 使用者可以清楚看到全部三個 model（Opus / Sonnet / Haiku）

### 情境：使用者切換到不同的 model
- Given 使用者 hover 在 model selector 上，看到 3 個 model 選項展開中
- When 使用者點擊其中一個不是目前使用中的 model
- Then Pod 所使用的 model 被切換成被點擊的那一個
- And 當滑鼠離開後，Pod 上方只會顯示新選的 model 名稱

### 情境：使用者點擊目前已經使用中的 model
- Given 使用者 hover 在 model selector 上，看到 3 個 model 選項展開中
- When 使用者點擊最下方那個已經使用中的 model
- Then Pod 的 model 維持不變
- And 展開的選項收合回預設樣子

### 情境：使用者的滑鼠移開 model selector
- Given 使用者剛剛 hover 在展開的 model selector 上
- When 使用者把滑鼠移離 model selector 區域
- Then 另外兩個 model 選項收回去
- And 整個 selector 放下來（回到原本位置）
- And 只剩下顯示當前 model 的橫向 tag

### 情境：Canvas 上有多個 Pod，使用者只切換其中一個
- Given 使用者在 Canvas 上同時放了多個 Pod，每個 Pod 都有自己的 model selector
- When 使用者 hover 並切換某一個 Pod 的 model
- Then 只有那一個 Pod 的 model 被換掉
- And 其他 Pod 的 model 選擇維持不變
- And 其他 Pod 的 model selector 也不會跟著展開

### 情境：Pod 中間的畫面內容不受影響
- Given 使用者在 Pod 中央看得到 PodMiniScreen 正在顯示 agent 的執行內容
- When 使用者 hover model selector，或是切換 model
- Then Pod 中央的 PodMiniScreen 顯示內容持續正常運作，不會被遮住、不會閃動、也不會被推擠變形

### 情境：使用者在展開狀態下把滑鼠從一個選項移到另一個選項
- Given model selector 已經展開，3 個 model 都看得到
- When 使用者在展開範圍內把滑鼠在不同選項之間移動
- Then selector 保持展開狀態
- And 不會因為短暫滑過縫隙就誤收合
