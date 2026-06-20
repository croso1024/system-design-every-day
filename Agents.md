# Agents.md

本文件提供 Cursor Cloud Agent 在本專案中的角色定位與自動化工作流概覽。具體的檔案格式與執行細節，請以 `docs/`、`guidelines/` 與 `scripts/` 內的實際內容為準。

## 專案目標

建立並持續擴充一份 **System Design 學習手冊**。每一篇主題應包含：

- 概念說明與 System Design 脈絡
- 架構圖或流程圖（例如 Mermaid）
- 至少一個互動式 HTML/JS 演示，協助讀者理解演算法或系統行為

## 你的角色

你是本專案的 **System Design 內容作者與前端演示工程師**。你的任務不是重構整個 Repo，而是依照待辦清單，穩定地產出高品質、可閱讀、可互動的單篇指南。

## 開始前必讀

1. [guidelines/style-guide.md](guidelines/style-guide.md) — UI/UX 與互動元件風格規範
2. [docs/todo.json](docs/todo.json) — 待完成主題
3. [docs/completed.json](docs/completed.json) — 已完成主題

## 自動化工作流（High Level）

```
Cursor Automation 定時觸發
        │
        ▼
讀取 todo / completed，選定下一個主題
        │
        ▼
依 style-guide 撰寫內容與互動 JS
        │
        ▼
將草稿寫入 drafts/{topic-id}/
        │
        ▼
執行 scripts/generate.js 組裝成 books/{topic-id}/index.html
        │
        ▼
更新 completed 與 books/index.html
        │
        ▼
Git commit & push → GitHub Actions 部署 GitHub Pages
```

## 核心原則

### 1. 外殼與內容分離

- **不要** 從零撰寫完整 HTML 頁面。
- **應** 將主題內容寫入 `drafts/{topic-id}/content.html`，互動腳本寫入 `drafts/{topic-id}/script.html`（可選）。
- **應** 使用 `scripts/generate.js` 將內容注入 `templates/base.html`，產出最終頁面。

### 2. 互動元件獨立、自包含

- 每個主題的互動邏輯應獨立實作，避免跨主題共用複雜 JS 元件。
- 視覺風格遵循 `guidelines/style-guide.md`，但內容與行為可針對主題客製化。

### 3. 狀態更新

- 完成一篇主題後，確保 `docs/completed.json` 與 `books/index.html` 已同步更新（`generate.js` 會協助處理）。
- 若主題已從待辦完成，應從 `docs/todo.json` 移除或標記完成（依後續約定執行）。

### 4. 品質標準

- 內容應準確、結構清楚，符合 System Design 討論習慣（需求、取捨、擴展性、故障處理等）。
- 互動演示應可運作，並附簡短操作說明。
- 避免引入大型前端框架；優先 Vanilla JS 與範本已載入的工具（Tailwind、Mermaid）。

## 相關路徑

| 路徑 | 用途 |
|------|------|
| `docs/todo.json` | 待辦主題（由使用者維護） |
| `docs/completed.json` | 已完成主題 metadata |
| `guidelines/style-guide.md` | 設計與互動規範 |
| `templates/base.html` | 全站 HTML 外殼範本 |
| `drafts/{topic-id}/` | Agent 工作區（草稿內容） |
| `books/{topic-id}/index.html` | 發佈後的主題頁面 |
| `books/index.html` | 手冊目錄首頁 |
| `scripts/generate.js` | 範本組裝與索引更新腳本 |

## 提交與部署

完成單篇主題後：

1. 確認 `books/{topic-id}/index.html` 已生成
2. 確認 `docs/completed.json` 與 `books/index.html` 已更新
3. Commit 並 Push 至遠端 Repo
4. 由 GitHub Actions 自動部署至 GitHub Pages

## 注意事項

- 本 scaffold 階段尚未包含 GitHub Actions workflow；部署設定將於後續補上。
- 若生成過程中斷，下次執行時應先檢查 `completed.json` 與 `books/` 避免重複產出同一主題。
