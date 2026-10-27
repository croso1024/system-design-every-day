# CI/CD 部署與自動化驗證指南

本文件說明 **System Design Every Day** 的 GitHub Actions CI/CD Pipeline，以及首次部署時需要在 GitHub 網站上完成的設定。
Agent 的撰文、選題與收尾流程不在本文件範圍，一律以 `.claude/skills/` 下的 Skill 與 `AGENTS.md` 為準。

---

## 1. Pipeline 組成

### A. `.github/workflows/deploy.yml`
每當有推送（Push）到 `main` 分支（或手動觸發 `workflow_dispatch`）時執行：
1. 拉取程式碼。
2. 初始化 Node.js 24 環境。
3. **Bot 推送 guard**（只在 push 事件、且推送者不是 repo 擁有者時執行）：見下方 C 節。
4. 執行 `node scripts/validate.js`：一旦驗證失敗即中斷 Pipeline，損毀或不同步的狀態檔不會被部署。
5. Demo 品質閘門：`node scripts/quality/demo-audit.js --all` 與 `node scripts/quality/compute-probe.js --all`
   （`scripts/quality/legacy-baseline.json` 封存的舊篇印 SKIP(baseline) 不擋，見 `docs/tech-debt.md` #8）；
   Bot 推送另外對 guard 找到的新增 `drafts/<id>/` 逐一跑 `node scripts/quality/archetype-window.js --topic <id>`。
6. 執行 `node scripts/inject-build-meta.js`：把本次部署的 commit 與時間注入首頁 `books/index.html` 的 `<!-- BUILD_META -->` 位置。
7. 打包 `books/` 資料夾（手冊所有網頁與首頁），透過 GitHub 官方 Actions 部署至 GitHub Pages，不需要維護 `gh-pages` 分支。

### B. `scripts/validate.js`
驗證 `docs/` 下的狀態檔（todo / completed / mindmap / categories.json）彼此一致，並檢查首頁學習地圖 payload 與 `docs/` 重算結果同步。
完整檢查項目見 `scripts/validate.js` 檔頭。首頁過時時，錯誤訊息會提示執行 `node scripts/reindex-home.js`。

### C. Bot 推送 guard
每日撰文由 Cursor Cloud Agent（`cursor[bot]`）直推 `main`，repo 沒有 branch protection，因此由 workflow 自己把關 Bot 能改的範圍：

- **觸發條件**：push 事件，且 `github.actor_id` 不是 repo 擁有者（`HUMAN_ACTOR_ID`）。人推與 `workflow_dispatch` 不跑。
- **比對基準**：透過 repository activity API 取 `main` 上最近一次人推的 `after`，而不是 `github.event.before`。
  比對該 commit 到本次 HEAD 的差異，每個路徑都必須落在 `drafts/**`、`books/**`、`docs/completed.json`、`docs/todo.json`。
- **黏性**：Bot 一旦動過集合外的檔案，之後每次 Bot 推送的部署都會被擋，直到人推一次 commit 重新定錨。
  只認 `activity_type=push`：人的 force push、以及在 GitHub UI merge PR（`pr_merge`）都不算定錨，merge 後仍要人 `git push` 一次。
  這是刻意的決定（2026-10-27）：目前 Bot 只在直推失敗時才發 PR，頻率低；若日後常走 PR，再把 guard 的查詢改成同時接受 `push` 與 `pr_merge`。
- **Fail closed**：查不到人推紀錄、`event.before` 全零、fetch 不到基準 commit，一律視為不通過。
  activity API 官方未載明保留期限；查不到紀錄時人推一次空 commit 即可重新定錨：
  ```bash
  git commit --allow-empty -m "[chore] re-anchor bot push guard"
  git push origin main
  ```
  人推會把當下的 HEAD 視為可信，所以重新定錨前請先檢視 Bot 自上次人推以來的改動。
- **強制開關**：`deploy.yml` 的 `BOT_GUARD_ENFORCE`。`'false'` 只印判定（actor、基準、變動路徑、allow／DENY）不擋部署；其他任何值都視為強制，不符即中斷 Pipeline。

---

## 2. GitHub 網站設定（首次部署必做）

### 將 GitHub Pages 的來源改為 GitHub Actions
1. 進入 GitHub Repository 頁面，點擊 ⚙️ **`Settings`**。
2. 在左側 **`Code and automation`** 區塊點擊 **`Pages`**。
3. 在 **`Build and deployment`** 區塊的 **`Source`** 下拉選單，將 `Deploy from a branch` 切換為 🟢 **`GitHub Actions`**。

> Workflow 所需的權限（`contents: read`、`pages: write`、`id-token: write`）已在 `deploy.yml` 中明確宣告（Bot 推送 guard 查詢 activity API 也只用 `contents: read`），不需要調整 Repository 層級的 Workflow permissions 預設值。

---

## 3. 本地驗證與推送

推送前可在本地執行同一套驗證：
```bash
node scripts/validate.js
node scripts/quality/demo-audit.js --all
node scripts/quality/compute-probe.js --all
node scripts/quality/archetype-window.js --topic <新篇 id>   # 只對本次新增的篇
```

- Agent 的收尾順序（`generate.js → remove-todo.js → validate.js → commit`）與 commit message 格式，以 `.claude/skills/topic-author/SKILL.md` 為單一真相來源。
- Cursor Cloud 自動化環境直推 `main`、推送失敗才改發 PR 的規則，見 `AGENTS.md`「Remote Sync Strategy」。
- 推送到 `main` 後，GitHub Actions 會自動驗證、打包並發佈到 GitHub Pages。
