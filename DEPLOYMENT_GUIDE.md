# CI/CD 部署與自動化驗證指南

本文件記錄了本次工作階段為 **System Design Every Day** 專案所建置的 GitHub Actions CI/CD Pipeline、狀態驗證機制，以及後續在 GitHub 網站上需手動進行的設定步驟。

---

## 1. 架構改動與交付內容

為了實現「自動驗證狀態文件」與「自動發佈 GitHub Pages」，我們新增了以下兩個核心檔案：

### A. 檔案路徑與功能說明

1. **`scripts/validate.js` (狀態文件驗證指令碼)**
   - **功能**：專門用來檢驗 `docs/todo.json`、`docs/completed.json` 與 `docs/mindmap.json`。
   - **驗證項目**：
     - JSON 格式與語法正確性。
     - 必要欄位（如 `id`、`title`、`category`）的存在與型別。
     - `completed.json` 的完成時間格式（YYYY-MM-DD）及網頁相對路徑（`path`）是否在專案中真實存在（避免指到不存在的 html 檔案）。
     - 節點一致性：驗證 `todo.json` 與 `completed.json` 的 `id` 是否皆有在 `mindmap.json` 的節點（`nodes`）中宣告。
     - 關係一致性：驗證 `mindmap.json` 中的 `edges` 連接的節點是否存在。

2. **`.github/workflows/deploy.yml` (GitHub Actions 工作流)**
   - **功能**：每當有推送（Push）或合併（Merge）到 `main` 分支時，自動執行驗證與發佈。
   - **執行流程**：
     1. 拉取程式碼。
     2. 初始化 Node.js 20 環境。
     3. 執行 `node scripts/validate.js`（一旦驗證失敗，即時中斷 Pipeline，保護線上環境不被損毀的追蹤文件影響）。
     4. 打包 `books/` 資料夾（此資料夾為手冊所有網頁與首頁目錄）。
     5. 直接透過 GitHub 官方 Actions 部署至 GitHub Pages，無需額外建立或維護 `gh-pages` 分支。

---

## 2. GitHub 網站手動設定步驟 (必做)

在將代碼推送至 GitHub 後，**請務必前往 GitHub Repository 網頁手動完成以下設定**，否則 Pipeline 部署將會因為權限不足或設定錯誤而失敗：

### 步驟 A：將 GitHub Pages 的來源改為 GitHub Actions
1. 開啟瀏覽器，進入您的 GitHub Repository 頁面。
2. 點擊頂部選單最右側的 ⚙️ **`Settings`** (設定)。
3. 在左側側邊欄中，找到 **`Code and automation`** 區塊，點擊 **`Pages`**。
4. 找到頁面中間的 **`Build and deployment`** 區塊。
5. 在 **`Source`** 下拉選單中，將預設的 `Deploy from a branch` 切換為 🟢 **`GitHub Actions`**。

### 步驟 B：啟用 Workflow 的讀寫權限
1. 在相同的 ⚙️ **`Settings`** 頁面中，點擊左側側邊欄的 **`Actions`** -> **`General`**。
2. 捲動至頁面最底部，找到 **`Workflow permissions`** 區塊。
3. 將選項從原本預設的 `Read repository contents and packages permissions` 改為選取 🟢 **`Read and write permissions`**。
4. 點擊 **`Save`** 按鈕保存設定。

---

## 3. 本地驗證與日常工作流

### A. 本地驗證指令
在將變更推送或發起 PR 之前，您可以在本地手動執行驗證，確保狀態文件格式無誤：
```bash
node scripts/validate.js
```

### B. Cursor Automation 日常開發工作流 (重點)
當您在其他電腦上繼續開發，或設定 Cursor Automation 讓 Agent 自動寫入新文件時，請確保 Agent 遵循以下步驟：
1. **讀取與挑選主題**：讀取 `docs/todo.json` 並挑選下一個主題。
2. **撰寫草稿**：在 `drafts/{topic-id}/` 建立 `content.html` 與 `script.html`（可選）。
3. **本地編譯 (重要)**：
   執行以下指令組裝 HTML 頁面並自動更新 `completed.json` 及 `books/index.html`：
   ```bash
   node scripts/generate.js --topic <topic-id> --title "主題名稱" --category "分類名稱"
   ```
4. **本地驗證**：
   ```bash
   node scripts/validate.js
   ```
5. **提交變更並推送**：
   將變更 commit 並推送到 GitHub：
   ```bash
   git add .
   git commit -m "feat: add topic <topic-id>"
   git push origin main
   ```
6. **Actions 自動部署**：
   GitHub Actions 將會在 30 秒內自動驗證、打包並將更新發佈至您的 GitHub Pages。
