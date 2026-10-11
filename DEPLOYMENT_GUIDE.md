# CI/CD 部署與自動化驗證指南

本文件說明 **System Design Every Day** 的 GitHub Actions CI/CD Pipeline，以及首次部署時需要在 GitHub 網站上完成的設定。
Agent 的撰文、選題與收尾流程不在本文件範圍，一律以 `.claude/skills/` 下的 Skill 與 `AGENTS.md` 為準。

---

## 1. Pipeline 組成

### A. `.github/workflows/deploy.yml`
每當有推送（Push）到 `main` 分支（或手動觸發 `workflow_dispatch`）時執行：
1. 拉取程式碼。
2. 初始化 Node.js 24 環境。
3. 執行 `node scripts/validate.js`：一旦驗證失敗即中斷 Pipeline，損毀或不同步的狀態檔不會被部署。
4. 執行 `node scripts/inject-build-meta.js`：把本次部署的 commit 與時間注入首頁 `books/index.html` 的 `<!-- BUILD_META -->` 位置。
5. 打包 `books/` 資料夾（手冊所有網頁與首頁），透過 GitHub 官方 Actions 部署至 GitHub Pages，不需要維護 `gh-pages` 分支。

### B. `scripts/validate.js`
驗證 `docs/` 下的狀態檔（todo / completed / mindmap / categories.json）彼此一致，並檢查首頁學習地圖 payload 與 `docs/` 重算結果同步。
完整檢查項目見 `scripts/validate.js` 檔頭。首頁過時時，錯誤訊息會提示執行 `node scripts/reindex-home.js`。

---

## 2. GitHub 網站設定（首次部署必做）

### 將 GitHub Pages 的來源改為 GitHub Actions
1. 進入 GitHub Repository 頁面，點擊 ⚙️ **`Settings`**。
2. 在左側 **`Code and automation`** 區塊點擊 **`Pages`**。
3. 在 **`Build and deployment`** 區塊的 **`Source`** 下拉選單，將 `Deploy from a branch` 切換為 🟢 **`GitHub Actions`**。

> Workflow 所需的權限（`contents: read`、`pages: write`、`id-token: write`）已在 `deploy.yml` 中明確宣告，不需要調整 Repository 層級的 Workflow permissions 預設值。

---

## 3. 本地驗證與推送

推送前可在本地執行同一套驗證：
```bash
node scripts/validate.js
```

- Agent 的收尾順序（`generate.js → remove-todo.js → validate.js → commit`）與 commit message 格式，以 `.claude/skills/topic-author/SKILL.md` 為單一真相來源。
- Cursor Cloud 自動化環境直推 `main`、推送失敗才改發 PR 的規則，見 `AGENTS.md`「Remote Sync Strategy」。
- 推送到 `main` 後，GitHub Actions 會自動驗證、打包並發佈到 GitHub Pages。
