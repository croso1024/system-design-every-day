# Agents.md — AI Agent 自動化工作指南（全專案 High-Level 視圖）

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
| 決定主題、新增主題到 mindmap/todo、規劃學習順序 | 前段 | `.cursor/skills/topic-explorer/` |
| 撰寫 `drafts/<id>/`、`generate.js` 發佈、品質檢查、收尾 | 後段 | `.cursor/skills/topic-author/` |
| 視覺與互動元件風格規範 | 撰稿必讀 | `guidelines/style-guide.md` |

> 選題具「非確定性」：`mindmap.js --action next` 回傳最多 5 筆候選，Agent 自發擇一；
> 但每筆帶有 `prerequisites_satisfied` / `missing_prereqs`，**務必優先選先備已齊者**，
> 避免先備未齊就進入更深主題。

---

## 🚨 全域鐵律（永遠適用）

1. **嚴禁直接、完整讀寫大型 JSON**（`docs/completed.json`、`docs/mindmap.json`、`docs/todo.json`）。
   規模擴大後全量載入會干擾上下文、浪費 token 且易解析錯誤。一律改用 CLI 取得精簡輸出：
   - `node scripts/completed-ledger.js --action status | get-recent --limit <n>`（唯讀查詢）
   - `node scripts/mindmap.js --action next`（唯讀推薦）
   - 新增主題用 `topic-explorer` skill 內的 `add-topic.js`，不要手拼大型 JSON。
2. **改完任何 `docs/*.json` 必跑** `node scripts/validate.js`，未通過不可收工。
3. **Notion 淺色極簡基調為全站視覺底線**：禁止 Dark Mode 樣式與高對比配色，禁止引入大型前端框架。
4. **不要從零撰寫 HTML 外殼**（header/footer 等），由 `templates/base.html` + `generate.js` 自動組裝。

---

## 📂 相關路徑與工具對照表

| 路徑 / 命令 | 用途 | 權限與異動規範 |
| :--- | :--- | :--- |
| `docs/todo.json` | 待辦主題池 | 由 `topic-explorer` skill 維護（`add-topic.js` 寫入；發佈後由 author 收尾移除） |
| `docs/mindmap.json` | 全站心智圖 (DAG) | 記錄 Prerequisites / Related 關係；經 `add-topic.js` 寫入，勿手拼 |
| `docs/completed.json` | 已完成主題 metadata | **自動更新**（由 `generate.js` 維護，勿手動編輯） |
| `guidelines/style-guide.md` | 視覺與互動元件風格規範 | 撰稿前嚴格閱讀遵循 |
| `templates/base.html` | 全站 HTML 外殼範本 (Notion 淺色版) | 嚴格讀取，不建議手動更改 |
| `drafts/{topic-id}/` | **撰稿主要工作區** | AI 自由建立與寫入 content.html 和 script.html |
| `books/{topic-id}/index.html` | 發佈後的最終主題網頁 | **自動生成**（由 `generate.js` 產出，勿手動編輯） |
| `books/index.html` | 手冊首頁（目錄 + 可點擊心智圖） | **自動生成**（由 `generate.js` 產出，勿手動編輯） |
| `node scripts/completed-ledger.js` | 完成日誌查詢 CLI | **唯讀查詢** |
| `node scripts/mindmap.js` | 心智圖推薦與 Mermaid 編譯 CLI | **唯讀查詢與編譯** |
| `node scripts/generate.js` | 範本組裝、Mermaid 編譯與索引更新編譯器 | **自動化執行** |
| `node scripts/validate.js` | 狀態檔一致性驗證 | **改完 JSON 必跑** |
