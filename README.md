# System Design Every Day

每日自動更新的 System Design 學習手冊。透過 Cursor Cloud Agent 與 Cursor Automation，依照**智能心智圖 DAG (Directed Acyclic Graph) 決策鏈**，高效率且循序漸進地產出極具 Notion 極簡質感的 HTML 系統設計指南，並發佈至 GitHub Pages。

---

## 🧭 專案核心概念

本專案將 AI Agent 視為**手冊的內容作者與前端互動演示工程師**。我們設計了一套「最小上下文、智能決策」的 CLI 工具鏈，避開傳統 AI 面臨的大型 JSON 讀寫 Token 膨脹問題，使其能保持全域觀，每天自動產出極高連貫性的技術文章。

1. **規劃主題**：透過 `add-topic.js` 把希望學習的 System Design 主題寫進 `docs/todo.json`，並在 `docs/mindmap.json` 記錄主題間的先修知識與關聯（如 2PC ──► TCC ──► Saga）。
2. **Cursor Automation** 每日定時觸發 Cloud Agent。
3. **Agent 智能決策**：Agent 透過 CLI 工具，僅載入過濾後的極小上下文，自發性決定「最符合連貫教學脈絡」的選題。
4. **組裝編譯**：利用組裝腳本將草稿注入 Notion 風格的 HTML 範本，並重繪**首頁可點擊、可互動的學習地圖**（產頁時在伺服器端完成排版，前端零依賴、不載入任何第三方函式庫）。
5. **自動部署**：由 GitHub Actions 確認 Bot 推送只動到可寫範圍、驗證狀態檔並通過 demo 品質閘門後，將 `books/` 靜態網頁發佈至 GitHub Pages。

---

## 🔄 智能決策工作流 (CLI 驅動)

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
│ 3. 撰寫草稿 (Notion 風格)│  (在 drafts/{topic}/ 產出 content.html 與 script.html，通過 demo 品質閘門)
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ 4. node scripts/generate.js ───► 組裝 drafts/ 內容至 templates/base.html
│    (自動化編譯與組裝)   ├──────► 自動掃描 <h2> 標題生成左側 TOC 導覽列
└───────────┬─────────────┘      └──────► 以 mindmap.json + completed.json + categories.json 排版並輸出可點擊學習地圖
            │
            ▼
┌─────────────────────────┐
│ 5. remove-todo → validate│
│    → Git Commit & Push  │  ───► GitHub Actions 驗證後自動部署至 GitHub Pages
└─────────────────────────┘
```

每一步的詳細規範由 Agent Skill 定義：選題與圖譜維護見 `.claude/skills/topic-explorer/`，撰稿與發佈見 `.claude/skills/topic-author/`，修訂既有文章見 `.claude/skills/topic-reviser/`。

---

## 🛠️ CLI 腳本工具鏈

專案是零依賴的純 Node.js 靜態網站產生器（沒有 `package.json`，Node 18+ 即可），所有腳本都在 `scripts/` 下，各檔檔頭附有完整的 usage。
**完整的工具清單、用途與異動權限，以 [AGENTS.md](AGENTS.md)「相關路徑與工具對照表」為準**；以下只列最常用的入口：

| 指令 | 用途 |
| :--- | :--- |
| `node scripts/mindmap.js --action next` | 推薦下一篇（最多 5 筆，附先備是否已齊） |
| `node scripts/completed-ledger.js --action status` | 全站完成狀態統計 |
| `node scripts/add-topic.js ...` | 新增主題到 mindmap + todo |
| `node scripts/generate.js --topic <id> --title "..."` | 組裝並發佈一篇主題，同步重繪首頁 |
| `node scripts/reindex-home.js` | 只重繪首頁學習地圖 |
| `node scripts/validate.js` | 狀態檔與首頁一致性驗證（CI 每次 push 都跑） |

---

## 📂 資料夾結構

```
system-design-every-day/
├── AGENTS.md          # AI Agent 工作指南（Agent 啟動必讀 🚨；含路徑與工具對照表）
├── .claude/skills/    # topic-explorer / topic-author / topic-reviser 三個 Agent Skill
├── guidelines/        # 視覺、圖表與互動 demo 規範（style-guide.md、demo-agent-brief.md）
├── docs/              # 狀態檔（todo / mindmap / completed / categories.json）與 tech-debt.md
├── templates/         # 文章頁外殼 base.html 與首頁學習地圖的 CSS / JS
├── drafts/            # 各主題的內容原始碼（content.html / script.html），隨產物一起提交
├── books/             # 發佈產物（GitHub Pages 的網站根目錄），由腳本自動生成
├── scripts/           # CLI 工具鏈；lib/ 為共用模組，quality/ 為 demo 品質閘門
└── .github/workflows/ # deploy.yml：Bot 推送路徑 guard → validate → demo 品質閘門 → 注入建置戳記 → 部署 GitHub Pages
```

---

## 🚀 開發與測試說明

### 1. 新增學習規劃
新增主題、分類與調整領域的完整步驟見 `.claude/skills/topic-explorer/SKILL.md`。最短路徑：
```bash
node scripts/mindmap.js --action list-categories      # 查已登記的分類（名稱須逐字一致）
node scripts/add-topic.js --id <topic-id> --title "<標題>" --category "<分類>" [--prereq a,b] [--related c,d]
node scripts/reindex-home.js                          # 先重繪首頁
node scripts/validate.js                              # 再驗證
```

### 2. 本地手動組裝測試
```bash
# 0. 主題必須先存在於 mindmap（見上一節）；generate.js 會從節點帶出分類
# 1. 依照 guidelines/style-guide.md 規格，撰寫 drafts/<topic-id>/content.html（script.html 可選）
# 2. 組裝發佈（--title 與 mindmap 節點的標題一致）
node scripts/generate.js --topic <topic-id> --title "<標題>"
# 3. 收尾：順序不可顛倒
node scripts/remove-todo.js --topic <topic-id>
node scripts/validate.js
```
完成後用任意靜態伺服器預覽，例如 `python3 -m http.server 8080 --directory books`，再開 `http://localhost:8080/index.html`：
該篇在所屬分類卡片上的點會由虛線空心（準備中）變成實心（已發布），從 hover 清單或右側面板即可進入閱讀。

---

## 🚨 Agent 必讀事項

所有參與本專案的 AI Agent，在執行任務前**必須嚴格閱讀並遵循**以下文件：
- **[AGENTS.md](AGENTS.md)**：角色定位、全域鐵律、工作流與 Skill 對照、路徑與工具對照表。
- **[guidelines/style-guide.md](guidelines/style-guide.md)**：色彩系統（Notion-like Light Mode）、圖表選型、`.callout` / `.oneliner` 等元件，以及 Demo Archetype 與品質閘門規範。

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
