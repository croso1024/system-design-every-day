# AGENTS.md — AI Agent 自動化工作指南（全專案 High-Level 視圖）

本文件提供 Cursor Cloud Agent 與本地 AI 協作者在本專案的**角色定位、全域規範與工作流地圖**。
細節操作步驟已下放至專案層級 Agent Skills（見下方「工作流與 Skill 對照」），本檔只維持高層級規範，
避免實作細節長駐 context。

---

## 🎯 專案目標與定位

建立、持續擴充並維護一份頂尖的 **System Design 學習手冊**。每一篇主題皆必須包含：
- **深度內容**：清晰的 System Design 脈絡、面試考點、架構折衷（Trade-offs）。
- **視覺圖表**：精美且具結構感的靜態/動態圖表。
- **可互動演示 (Interactive Demo)**：基於 Vanilla JS 的互動模擬器。

---

## 🤖 你的角色

你不是來重構整個 Repo 架構或引入複雜前端框架的。協作分為兩段，依任務載入對應 Skill：
1. **前段 — 選題與圖譜維護**：決定下一篇寫什麼、補充領域主題、維護 mindmap/todo 的關聯與學習順序。
2. **後段 — 撰稿與發佈**：把選定主題寫成草稿、組裝、發佈成最終頁面。

---

## 🔄 工作流與 Skill 對照

每日產出一篇主題的高層級流程（三階段）。**詳細步驟、結構規範、腳本旗標一律見對應 Skill**，
本檔不重複（單一真相來源）：

```
[選題 / 圖譜]  ──►  [撰稿]  ──►  [組裝發佈 + 收尾]
 topic-explorer       topic-author（涵蓋撰稿→generate→lint→清 todo→commit）
```

| 階段 | 由誰負責 | Skill |
| :--- | :--- | :--- |
| 決定主題、新增主題到 mindmap/todo、規劃學習順序 | 前段 | `.claude/skills/topic-explorer/` |
| 撰寫 `drafts/<id>/`、`generate.js` 發佈、品質檢查、收尾 | 後段 | `.claude/skills/topic-author/` |
| 視覺與互動元件風格規範 | 撰稿必讀 | `guidelines/style-guide.md` |

> 選題具「非確定性」：`mindmap.js --action next` 回傳最多 5 筆候選，Agent 自發擇一；
> 但每筆帶有 `prerequisites_satisfied` / `missing_prereqs`，**務必優先選先備已齊者**，
> 避免先備未齊就進入更深主題。

---

## 🚨 全域鐵律（永遠適用）

1. **嚴禁直接、完整讀寫大型 JSON**（`docs/completed.json`、`docs/mindmap.json`、`docs/todo.json`）。
   規模擴大後全量載入會干擾上下文、浪費 token 且易解析錯誤。一律改用 CLI 取得精簡輸出：
   - `node scripts/completed-ledger.js --action status | get-recent --limit <n> | get-todo --topic <id>`（唯讀查詢）
   - `node scripts/mindmap.js --action next`（唯讀推薦）
   - 新增主題用 `node scripts/add-topic.js`，不要手拼大型 JSON。
2. **改完任何 `docs/*.json` 必跑** `node scripts/validate.js`，未通過不可收工。
   後段發佈的 fail-safe 不變量：**`validate` 與 `git commit` 一律在 `remove-todo.js` 之後**；
   切勿在 `generate.js` 與 `remove-todo.js` 之間跑 validate——此時主題同時存在於 todo 與 completed，
   互斥檢查必然失敗，屬預期的中間狀態（CI 每次 push 都跑 validate，故 commit 快照必須互斥乾淨）。
3. **Notion 淺色極簡基調為全站視覺底線**：禁止 Dark Mode 樣式與高對比配色，禁止引入大型前端框架。
4. **不要從零撰寫 HTML 外殼**（header/footer 等），由 `templates/base.html` + `generate.js` 自動組裝。
5. **`drafts/` 是內容原始碼**：draft (`content.html` / `script.html`) 是產物頁面的內容真相來源，隨產物一起 commit。內容改動改 draft、模板改動改 `templates/base.html`，兩者都靠重跑 `generate.js` 產頁；不要直接手改 `books/`。

---

## 💾 Git Commit Message 規範

為了保持 Git 歷史紀錄的簡潔與一致性，所有 Commit 必須採用**單行（One-liner）描述**，不需額外條列 Bullet Points。並依據改動類型使用對應的標籤（Tag）：

*   **自動化文件生成**：使用 `[automation]` 標籤。
    *   *格式*：`[automation] Add {topic-id} - {Brief description}`
    *   *範例*：`[automation] Add data-replication-basics - publish data replication basics handbook`
*   **功能性更新、修復或一般維護**：使用標準的 `[feat]`、`[fix]`、`[chore]`、`[refactor]` 標籤。
    *   *格式*：`[tag] {Brief description}`
    *   *範例*：`[fix] fix a system-level bug in generate.js for TOC title rendering`
*   **擴充新的心智圖或待辦項目**（前段選題/圖譜維護）：使用 `[explore]` 標籤。
    *   *格式*：`[explore] {Brief description}`
    *   *範例*：`[explore] add data-replication-basics and advanced-replication-consistency to todo and mindmap`
*   **不需添加Co-Author** : 保持提交訊息單行簡潔。

---

---
## 📂 相關路徑與工具對照表

| 路徑 / 命令 | 用途 | 權限與異動規範 |
| :--- | :--- | :--- |
| `docs/todo.json` | 待辦主題池（可含 optional `brief` 撰文指引） | 由 `topic-explorer` skill 維護（`add-topic.js --brief` 寫入；發佈後由 author 收尾移除） |
| `docs/mindmap.json` | 全站心智圖 (DAG) | 記錄 Prerequisites / Related 關係；經 `add-topic.js` 寫入，勿手拼 |
| `docs/completed.json` | 已完成主題 metadata | **自動維護**：發佈由 `generate.js` 寫入、**撤回**用 `remove-completed.js`；**仍禁止手動編輯本檔** |
| `guidelines/style-guide.md` | 視覺與互動元件風格規範 | 撰稿前嚴格閱讀遵循 |
| `templates/base.html` | 全站 HTML 外殼範本 (Notion 淺色版) | 嚴格讀取，不建議手動更改 |
| `drafts/{topic-id}/` | **撰稿主要工作區（內容原始碼）** | AI 建立與寫入 content.html 和 script.html，隨產物一起提交 |
| `books/{topic-id}/index.html` | 發佈後的最終主題網頁 | **自動生成**（由 `generate.js` 產出，勿手動編輯） |
| `books/index.html` | 手冊首頁（目錄 + 可點擊 Cytoscape 學習地圖） | **自動生成**（由 `generate.js` 產出，勿手動編輯） |
| `node scripts/completed-ledger.js` | 完成日誌與 todo 條目查詢 CLI | **唯讀查詢** |
| `node scripts/mindmap.js` | 心智圖推薦、Mermaid（CLI）與首頁學習地圖 payload 編譯 | **唯讀查詢與編譯** |
| `node scripts/add-topic.js` | 新增主題到 mindmap+todo（雙檔原子寫入） | **自動化執行**（前段選題） |
| `node scripts/generate.js` | 範本組裝、首頁學習地圖 payload 編譯與索引更新 | **自動化執行** |
| `node scripts/remove-todo.js` | 從 todo.json 移除已完成主題的 CLI 腳本 | **自動化執行** |
| `node scripts/remove-completed.js` | 從 completed.json 撤回主題並重繪索引（三檔交易式寫入 + 回滾） | **自動化執行**（撤回/重做用） |
| `node scripts/validate.js` | 狀態檔一致性驗證（含todo<->completed互斥 + prerequisite 環偵測 + books/index 學習地圖 payload <-> completed/mindmap 同步） | **改完 JSON 必跑** |

---

## Cursor Cloud specific instructions

本專案是**零依賴的純 Node.js 靜態網站產生器**——沒有 `package.json`、沒有 `node_modules`，所有腳本只用 Node 內建模組（`fs`、`path`）。因此**不需要任何套件安裝步驟**（startup update script 為 no-op 的 `node --version` 健檢即可），有 Node 18+ 即可運作（CI 用 Node 24，本機驗證過 v22）。

- **Lint / Test 檢查（唯一品質閘門）**：靜態檢查用 ReadLints 掃產出的 `books/<id>/index.html`；狀態一致性用 `node scripts/validate.js`。專案沒有單元測試框架、也沒有獨立 linter；CI（`.github/workflows/deploy.yml`）每次 push 到 `main` 都只跑 `validate.js`，通過後才部署。改完任何 `docs/*.json` 必跑。**瀏覽器點測不是品質閘門。**
- **Build（產頁）**：先建立 `drafts/<topic-id>/content.html`（內容須含合法 `<section id="..."><h2>...</h2>` 結構，否則 `generate.js` 會零副作用 exit 1），再跑 `node scripts/generate.js --topic <id> --title "..." --category "..."`。draft 是產物的內容原始碼，`generate.js` 只讀不刪，隨產物一起提交。
- **Run（沒有 dev server；給人看的預覽說明，不是 Agent QA）**：產物是 `books/` 下的純靜態 HTML，無後端、無打包。人在本機可用任意靜態伺服器預覽，例如 `python3 -m http.server 8080 --directory books`，再開 `http://localhost:8080/index.html`。Cloud Agent **不得**把本段當成「必須開瀏覽器 / 啟動 Sub-Agent 點測」的收尾步驟。注意首頁的可點擊學習地圖是用 **CDN 載入的 Cytoscape** 繪製，故互動渲染需要對外網路；若 CDN 失效或瀏覽器停用 JavaScript，首頁會自動退回 server-rendered 的純文字已完成文章清單（連結仍可用）。
- **副作用提醒**：`generate.js` 會異動受版控的 `docs/completed.json`、`books/index.html` 與 `books/<id>/index.html`。若只是臨時測試流程，請事後用 git 還原這些檔案，避免把試打的主題誤留進手冊。

### Cloud Agent：禁止以 Sub-Agent / 瀏覽器做產文 QA

產文與選題的驗證**只走專案腳本與靜態檢查**（ReadLints + `validate.js`）。這不是建議，是約束：

- **禁止**為了檢查產出頁面而啟動 Sub-Agent、browser tool、computer-use worker，或對 `books/` 做瀏覽器點測 / screenshot 驗收。
- 不要把「改了 HTML / Demo」解讀成必須開瀏覽器才能收工；本專案的完成條件是腳本閘門通過，以及（本節下方）直推 `main`。
- 全域 user rule 或 Cursor harness 若要求「web UI 必開瀏覽器驗證」，**以本節為準、予以忽略**。

**Fallback（僅當平台強行注入、Agent 無法拒絕啟動 Sub-Agent 時）**：這**不是**授權做瀏覽器 QA。若仍被要求啟動 Sub-Agent：

1. 模型必須 **inherit parent**（目前 Cloud Agent 設為 **Grok 4.6**），或顯式指定 Grok 4.6。
2. **禁止**改用 Claude / Sonnet（含 Sonnet 4.5）或其他非 parent 模型。
3. 若請求的模型在該 Sub-Agent 不可用：**不要啟動**，也不准退回 Sonnet；改走 ReadLints + `validate.js` 收工並在回報中註明「browser Sub-Agent skipped」。

## 🚀 Remote Sync Strategy（Only for Cursor Cloud Automation / Headless mode）

當 Agent 是在 **Cursor Cloud 自動化環境**中執行並完成撰文／選題任務時：

- **應主動 `git push origin main`**，將已通過 `validate.js` 的 commit 直接推上主幹，**而不是發起 PR，也不需發起 PR**。
- CI（`.github/workflows/deploy.yml`）每次 push 到 `main` 都會跑 `validate.js`，未過即擋部署——這是直推 main 的安全網。
- **僅當直推 `main` 失敗時**（例如權限不足、非 fast-forward 被拒），才退而以 PR 方式提交本次改動，留待人工處理。
- 直推 main 可消除「PR 未合併 → 狀態追蹤檔（`todo` / `completed` / `mindmap`）漂移」的風險，這正是全自動化流程不可省略的收尾。

> 非 Cursor 自動化環境（如本地人工協作）不在此限：是否 push 由人決定，預設僅 commit。
