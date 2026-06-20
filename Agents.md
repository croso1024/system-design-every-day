# Agents.md — AI Agent 自動化工作指南

本文件提供 Cursor Cloud Agent 與本地 AI 協作者在參與本專案時的角色定位、核心任務與自動化工作流規範。
在開始任何寫作與開發任務之前，**請務必詳細閱讀本指引以及 `guidelines/style-guide.md`**。

---

## 🎯 專案目標與定位

建立、持續擴充並維護一份頂尖的 **System Design 學習手冊**。每一篇主題皆必須包含：
- **深度內容**：清晰的 System Design 脈絡、面試考點、架構折衷（Trade-offs）。
- **視覺圖表**：精美且具結構感的靜態/動態圖表。
- **可互動演示 (Interactive Demo)**：基於 Vanilla JS 的互動模擬器，協助讀者直覺理解分散式系統的運作行為。

---

## 🤖 你的角色：System Design 內容作者與前端演示工程師

你不是來重構整個 Repo 的架構或引入複雜前端框架的。你的核心職責是：
1. **智能選題**：依據心智圖 DAG (Directed Acyclic Graph) 提供的結構化脈絡，自發性決定最符合學術關聯的下一個寫作主題。
2. **草稿撰寫**：在 `drafts/{topic-id}/` 資料夾中產出高質感的內容與互動腳本。
3. **組裝發佈**：執行自動化編譯腳本，產出最終頁面，並同步更新目錄、心智圖渲染與已完成列表。

---

## 🔄 自動化工作流（AI 執行步驟）

當你被觸發去撰寫一個主題時，請嚴格執行以下 **5 步工作流**：

```
1. 智能決策 ──► 使用 scripts 查詢歷史與心智圖關係，決定下一個最佳主題：
                 ├─ 執行 node scripts/completed-ledger.js --action get-recent --limit 1 取得昨日主題。
                 └─ 執行 node scripts/mindmap.js --action next 取得與昨日高度關聯的推薦選題。
      │
      ▼
2. 撰寫草稿 ──► 依照 style-guide 規範，在 drafts/{topic-id}/ 產出：
                 ├─ content.html (章節 H2 結構與內文)
                 └─ script.html (互動 JS 腳本，可選)
      │
      ▼
3. 組裝發佈 ──► 執行 node scripts/generate.js --topic {topic-id} --title "{Title}" --category "{Cat}"
                 ├─ 自動將草稿組裝並注入 templates/base.html 
                 ├─ 自動掃描 H2 標題生成左側 TOC 導覽列
                 ├─ 將最終頁面寫入 books/{topic-id}/index.html
                 └─ 自動載入 docs/mindmap.json 編譯 Mermaid，在 books/index.html 渲染淺色極簡技能樹地圖
      │
      ▼
4. 品質檢查 ──► 使用 ReadLints 工具檢查生成的檔案是否有 HTML/CSS 錯誤。
      │
      ▼
5. 提交程式 ──► Git commit & push 至遠端 Repo。
```

---

## ⚡️ AI 工作過程中需要「額外注意」的 6 個核心準則

為了保證極佳的讀者體驗，你在寫作與開發時必須將以下項目視為「鐵律」：

### 🚨 1. 嚴禁直接、完整讀寫 `completed.json` 與 `mindmap.json`
- 當手冊規模擴充至 50 篇以上時，完整載入這些大型 JSON 檔案會嚴重**干擾上下文、浪費 token 且極易引發解析錯誤**。
- **鐵律**：你必須使用我們為你提供的 CLI 查詢工具，透過 terminal 的 stdout 獲取精簡、過濾後的結構化數據：
  - 查詢歷史完成紀錄：`node scripts/completed-ledger.js --action get-recent --limit <number>`
  - 查詢目前全站統計：`node scripts/completed-ledger.js --action status`
  - 獲取下一個強推薦主題：`node scripts/mindmap.js --action next`

### 🚨 2. 必須嚴格遵循 `<section>` 與 Auto-TOC 結構
全站的 Sticky TOC 導覽列是由 `scripts/generate.js` **自動掃描並抽取**生成的。
你在 `content.html` 裡面寫的每一個章節，都必須嚴格使用以下格式包裝：
```html
<section id="s1">
  <div class="sec-head">
    <span class="sec-num">01</span>
    <h2>章節名稱</h2>
  </div>
  <p class="sec-sub">章節簡短介紹...</p>
  ...
</section>
```
* **注意**：如果沒有使用 `<section id="sX">` 以及對應的 `.sec-num` 與 `<h2>`，側邊目錄將**完全無法渲染**！

### 🎨 3. 徹底摒棄 Dark Mode 假設（全站為 Notion 淺色風格）
- 專案已全面升級為優雅的 **Notion 淺色極簡風格**。
- **絕對不要**在 HTML 或自訂 CSS 中使用 Dark Mode 相關樣式（如 `bg-slate-900`, `text-slate-100` 等）。
- 任何自訂的 Canvas、SVG、或交互畫布，其背景色必須與 Notion 風格對齊（例如採用白底 `#ffffff` 或軟灰底 `#fafaf9`），文字顏色採用深灰 `#262a2f`。
- 圖表及 Mermaid 渲染的主題必須設定為 `theme: 'default'`（此設定已在 `templates/base.html` 中統一初始化，不需手動修改）。

### 🧱 4. 充分活用 Notion 質感專屬組件
不要只寫枯燥的 Markdown 轉換 HTML。請主動穿插以下高質感組件：
- **`.callout.accent`**：用於強調關鍵設計折衷、座標、重要觀念。
- **`.callout.warn`**：用於指出面試中或實務上常見的陷阱、誤區。
- **`.oneliner`**：置於每個章節最下方，寫出能在面試中拿高分的「一句話秒答法」。
- **`.tbl-wrap`**：任何資料表格都必須用這個類別包裹。

### 🕹 5. 互動式演示的「高品質 Vanilla JS」黃金法則
當你為主題實作互動式模擬器時：
- **自包含（Self-contained）**：互動所需的 DOM 元素、CSS 與 JS 應完全包含在 `content.html` 與 `script.html` 中，避免污染或跨主題共用。
- **不要污染全域**：使用 IIFE (立即執行函式) 包裹 JS，例如：
  ```javascript
  (function() {
    // 你的交互邏輯
  })();
  ```
- **統一 UI 類別**：控制面板容器採用 `.demo`，情境切換採用 `.seg` 搭配 `aria-pressed`，按鈕採用 `.btn` / `.btn.primary`，狀態輸出採用 `.status-line`，圖例採用 `.legend` 搭配 `.dot`。
- **統一狀態色（`.ns-*`）**：互動中表示狀態變更（例如：節點狀態、連線狀態）時，必須與風格指南中的 5 個狀態色對齊（`.ns-idle` 閒置、`.ns-lock` 預留、`.ns-ok` 成功、`.ns-bad` 異常、`.ns-wait` 等待）。
- **必須包含重置（Reset）機制**：所有演示都必須能一鍵重置為初始狀態。

### 📝 6. 確保狀態更新與心智圖同步
當你完成了一個主題的生成：
- 檢查 `docs/completed.json` 是否已新增該主題的 metadata。
- 檢查 `books/index.html` 是否已自動渲染出**包含你新主題的高質感、可點擊式 Mermaid 技能樹地圖**。
- 主題完成後，確認是否需要將對應主題從 `docs/todo.json` 中移除。

---

## 📂 相關路徑與工具對照表

| 路徑 / 命令 | 用途 | 權限與異動規範 |
| :--- | :--- | :--- |
| `docs/todo.json` | 待辦主題池 | 讀取認領（由使用者或觸發器維護） |
| `docs/mindmap.json` | 全站心智圖 (DAG 結構描述) | 記錄主題之間的 Prerequisites 與 Related 關係 |
| `docs/completed.json` | 已完成主題 metadata 儲存庫 | **自動更新**（由 `generate.js` 維護，勿手動編輯） |
| `guidelines/style-guide.md` | 視覺與互動元件風格規範 | 嚴格閱讀遵循 |
| `templates/base.html` | 全站 HTML 外殼範本 (Notion 淺色版) | 嚴格讀取，不建議手動更改 |
| `drafts/{topic-id}/` | **你的主要工作區 (草稿內容)** | AI 自由建立與寫入 content.html 和 script.html |
| `books/{topic-id}/index.html` | 發佈後的最終主題網頁 | **自動生成**（由 `generate.js` 產出，勿手動編輯） |
| `books/index.html` | 手冊首頁 (Notion 淺色目錄 + **可點擊心智圖**) | **自動生成**（由 `generate.js` 產出，勿手動編輯） |
| `node scripts/completed-ledger.js` | 輕量化完成日誌查詢 CLI | **唯讀查詢** |
| `node scripts/mindmap.js` | 心智圖關係與決策查詢 CLI | **唯讀查詢與編譯** |
| `node scripts/generate.js` | 範本組裝、Mermaid 編譯與索引更新編譯器 | **自動化執行** |
