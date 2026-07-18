# System Design Every Day

每日自動更新的 System Design 學習手冊。透過 Cursor Cloud Agent 與 Cursor Automation，依照**智能心智圖 DAG (Directed Acyclic Graph) 決策鏈**，高效率且循序漸進地產出極具 Notion 極簡質感的 HTML 系統設計指南，並發佈至 GitHub Pages。

---

## 🧭 專案核心概念

本專案將 AI Agent 視為**手冊的內容作者與前端互動演示工程師**。我們設計了一套「最小上下文、智能決策」的 CLI 工具鏈，避開傳統 AI 面臨的大型 JSON 讀寫 Token 膨脹問題，使其能保持全域觀，每天自動產出極高連貫性的技術文章。

1. **使用者** 在 `docs/todo.json` 中，新增希望學習的 System Design 主題與範疇。
2. **結構化關係定義**：在 `docs/mindmap.json` 定義主題間的先修知識與關聯（如 2PC ──► TCC ──► Saga）。
3. **Cursor Automation** 每日定時觸發 Cloud Agent。
4. **Agent 智能決策**：Agent 透過 CLI 工具，僅載入過濾後的極小上下文，自發性決定「最符合連貫教學脈絡」的選題。
5. **組裝編譯**：利用組裝腳本將草稿注入 Notion 風格的 HTML 範本，自動編譯出**首頁可點擊、可互動的 Cytoscape 技能樹學習地圖**（第三方資源失效時自動退回 server-rendered 純文字文章清單）。
6. **自動部署**：由 GitHub Actions 將 `books/` 靜態網頁發佈至 GitHub Pages。

---

## 🔄 智能決策工作流 (CLI 驅動)

我們透過 CLI 腳本在背後支撐 Agent 的智能決策，工作流如下圖所示：

```
┌─────────────────────────┐
│     Cursor Automation   │  (每日定時觸發)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 1. 歷史與決策查詢       │  ◄── node scripts/completed-ledger.js --action get-recent --limit 1
│    (獲取極小過濾數據)   │  ◄── node scripts/mindmap.js --action next
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 2. 認領下一個關聯主題   │  (例如：剛完成 2PC，自動推薦並認領 TCC)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 3. 撰寫草稿 (Notion 風格)│  (在 drafts/{topic}/ 產出 content.html 與 script.html)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 4. node scripts/generate.js ───► 組裝 drafts/ 內容至 templates/base.html
│    (自動化編譯與組裝)   ├──────► 自動掃描 <h2> 標題生成左側 TOC 導覽列
└───────────┬─────────────┘      └──────► 編譯 mindmap.json + completed.json 生成可點擊 Cytoscape 學習地圖
            │
            ▼
┌─────────────────────────┐
│ 5. Git Commit & Push    │  ───► GitHub Actions 自動部署至 GitHub Pages
└─────────────────────────┘
```

---

## 🛠️ CLI 腳本工具鏈說明

為了解放 AI 生產力並極小化上下文 Token 浪費，專案提供以下三個 Node 腳本，無論是開發者還是 AI Agent 皆能高效率利用：

### 1. 完成日誌查詢器 `completed-ledger.js`
當完成檔案累積到數十篇時，直接讀取 `completed.json` 會耗費極大 token。本工具用來獲取最緊湊的 stdout 輸出。
*   **查詢最近完成的 N 筆主題**：
    ```bash
    node scripts/completed-ledger.js --action get-recent --limit 3
    ```
    *   *Agent 藉此得知昨日產出了什麼，以維持文章風格與脈絡的一致性。*
*   **查詢全站手冊完成狀態統計**：
    ```bash
    node scripts/completed-ledger.js --action status
    ```
    *   *回傳總篇數、完成數、待辦數與完成率百分比。*

### 2. 智能心智圖檢索與編譯器 `mindmap.js`
負責解析 DAG 圖譜結構，提供強大的 Neighbors 推薦，並可輸出兩種圖形資料：`generate-mermaid`（Mermaid 語法 CLI）與 `generate-learning-map`（首頁 Cytoscape 學習地圖的 renderer-neutral JSON payload）。
*   **智能選題推薦 (鄰居節點檢索)**：
    ```bash
    node scripts/mindmap.js --action next
    ```
    *   *Agent 在啟動選題時，以此指令獲取強烈推薦的主題。*
    *   *它會尋找與昨日完成主題相連、且在 todo.json 中尚未完成的鄰近節點（包含 prerequisite 先修關係）。若當前系列已完結，則會自動挑選合適的「獨立起步節點」提供。*
*   **編譯並輸出 Mermaid 程式碼（獨立 CLI 工具）**：
    ```bash
    node scripts/mindmap.js --action generate-mermaid
    ```
    *   *讀取 `completed.json`，將已完成節點著色為 Notion 淺綠色（支援超連結跳轉）， pending 節點著色為藍色，直接輸出 Mermaid 語法。*
    *   *註：首頁已改用 Cytoscape 學習地圖，不再內嵌此 Mermaid 輸出；本指令保留作為獨立查閱工具。*
*   **編譯並輸出首頁學習地圖 payload**：
    ```bash
    node scripts/mindmap.js --action generate-learning-map
    ```
    *   *輸出首頁 Cytoscape 學習地圖所用的 renderer-neutral JSON payload（Root → Category → Topic 階層與跨群 / 群內關聯）。*

### 3. 自動化模板編譯器 `generate.js`
將草稿組裝至外殼，並同步更新全站地圖與目錄。
*   **執行編譯命令**：
    ```bash
    node scripts/generate.js --topic <topic-id> --title "<Title>" --category "<Category>"
    ```
    *   *自動讀取 `drafts/<topic-id>/content.html` 注入 `CONTENT_PLACEHOLDER`。*
    *   *自動掃描內文中的 `<section>` 與 `<h2>`，動態生成左側 TOC 導覽列注入 `TOC_PLACEHOLDER`。*
    *   *自動呼叫 `mindmap.js` 編譯首頁 Cytoscape 學習地圖 payload，注入首頁 `books/index.html`。*
    *   *自動將本次完成寫入 `docs/completed.json`。*

---

## 📂 資料夾結構

```
system-design-every-day/
├── Agents.md                 # AI Agent 專屬自動化工作指南（Agent 啟動必讀 🚨）
├── README.md                 # 專案概念與工具鏈說明（本文件）
├── guidelines/
│   └── style-guide.md        # Notion 淺色極簡風格與互動式演示規格
├── docs/
│   ├── todo.json             # 待辦主題池（由使用者維護）
│   ├── mindmap.json          # 技能樹心智圖 (定義節點與關係)
│   └── completed.json        # 已完成主題 metadata（由 generate.js 自動維護）
├── templates/
│   └── base.html             # 全站 HTML 範本 (雙欄 TOC 佈局、Notion 淺色風格)
├── drafts/                   # 草稿工作區 (Agent 或開發者自由讀寫)
│   └── {topic-id}/
│       ├── content.html      # H2 結構化內文 (由 auto-TOC 掃描)
│       └── script.html       # 可選：自包含 Vanilla JS
├── books/
│   ├── index.html            # 手冊目錄首頁 (內含可互動、可點擊的 Cytoscape 學習地圖 🌳)
│   └── {topic-id}/
│       └── index.html        # 各主題最終發佈網頁 (雙欄、Scrollspy 導覽、演示)
└── scripts/
    ├── completed-ledger.js   # 輕量完成日誌查詢 CLI
    ├── mindmap.js            # 智能心智圖推薦、Mermaid CLI 與首頁學習地圖 payload 編譯器
    └── generate.js           # 範本組裝、Auto-TOC 抽取與首頁技能樹更新
```

---

## 🚀 開發與測試說明

### 1. 新增學習規劃
編輯 `docs/todo.json` 加入您的待辦，並在 `docs/mindmap.json` 中配置它與現有節點的邊（例如 prerequisite 或 related），構建您的個人心智圖。

### 2. 本地手動組裝測試
如果您想親自撰寫或測試流程：
```bash
# 1. 建立草稿目錄
mkdir -p drafts/rate-limiter

# 2. 依照 style-guide.md 規格，在 drafts/rate-limiter/ 撰寫 content.html 
# 3. 執行自動化編譯
node scripts/generate.js --topic rate-limiter --title "Rate Limiter (限流器)" --category "Infrastructure"
```
完成後，您可以直接用瀏覽器打開 `books/index.html`，即可看到最新的**互動式 Cytoscape 學習地圖**中 `rate-limiter` 節點已轉綠，點選分群即可進入閱讀您剛產出的完美頁面！

---

## 🚨 Agent 必讀事項

所有參與本專案的 AI Agent，在執行任務前**必須嚴格閱讀並遵循**以下文件：
- **[Agents.md](Agents.md)**：包含智能選題的 CLI 調用步驟，與寫作的 6 個核心鐵律。
- **[guidelines/style-guide.md](guidelines/style-guide.md)**：包含色彩系統（Notion-like Light Mode）、`.callout`、`.oneliner`、與互動元件類別的定義。

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
