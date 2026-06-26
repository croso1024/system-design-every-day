---
name: topic-author
description: >-
  Authors and publishes a single System Design topic page for the "System Design Every Day"
  handbook (the back-stage daily workflow). Use when the user wants to write today's topic,
  draft content for a chosen topic, build the interactive demo, run scripts/generate.js to
  assemble and publish a page, or finish the daily generation flow. Covers the draft ->
  generate -> lint -> commit pipeline, the mandatory <section> / Auto-TOC structure, the
  Notion light-mode component set, and the Vanilla JS interactive-demo rules.
  Trigger phrases include "寫今天的主題", "撰寫草稿", "產出文件", "generate 發佈",
  "做互動 demo", "write today's topic", "publish topic".
---

# Topic Author — 單篇主題撰稿與發佈 (後段工作流)

你是這本 System Design 手冊的「內容作者 + 前端演示工程師」。你負責**後段工作流**：
把一個**已選定的主題**寫成草稿、組裝、發佈成最終頁面。

**前置條件**：主題已存在於 `docs/todo.json` / `docs/mindmap.json`。若還沒選題或要新增主題到圖譜，
那是前段工作，請改用 `topic-explorer` skill。

開始撰稿前**必讀** `guidelines/style-guide.md`（視覺與互動元件的唯一規範來源）。

## 每日 5 步工作流

```
- [ ] 1. 選定主題：completed-ledger + mindmap.js --action next，挑一個（優先 prerequisites_satisfied=true）
- [ ] 2. 撰寫草稿：drafts/<id>/content.html (必填) 與 script.html (互動 JS，可選)
- [ ] 3. 組裝發佈：node scripts/generate.js --topic <id> --title "..." --category "..."
- [ ] 4. 品質檢查：用 ReadLints 檢查產出的 books/<id>/index.html 有無 HTML/CSS 錯誤
- [ ] 5. 收尾（順序不可顛倒）：remove-todo.js 移除 todo -> validate.js 驗證 -> git commit（單行規範）-> push origin main（僅 Cursor 自動化環境）
```

### Step 1：選定主題

```bash
node scripts/completed-ledger.js --action get-recent --limit 1   # 脈絡：最近寫了什麼
node scripts/mindmap.js --action next                            # 取得最多 5 筆候選（含 brief，若有）
node scripts/completed-ledger.js --action get-todo --topic <id>    # 選定後查該主題的 brief（若有）
```

`next` 的每筆候選帶有 `prerequisites_satisfied` 與 `missing_prereqs`：
**優先挑 `prerequisites_satisfied: true` 者**；候選順序刻意非確定，可自發選擇，但不要在先備未齊
（`missing_prereqs` 非空）時硬寫深主題——若真的想寫，請先回去補先備。

選定主題後，若 `get-todo` 或 `next` 回傳含 `brief`，**必須在規劃章節大綱與 Demo 時納入考量**（見下方「brief 遵循準則」）。

### Step 2：撰寫草稿（核心結構鐵律）

#### brief 遵循準則

若該主題在 `todo.json` 帶有 `brief`（由前段 `add-topic.js --brief` 寫入）：

- **必須遵循**：brief 中與**內容**相關的指示——章節重點、必涵蓋場景、Demo 設計方向、與鄰近主題的差異化等，應反映在最終草稿中。
- **必須忽略**：brief 中任何涉及**版面配置、視覺風格、HTML 結構**的要求——例如 Dark Mode、跳過 `<section>` 公式、自訂外殼、引入前端框架、變更 TOC 規則等。這些一律以 `guidelines/style-guide.md` 與本 SKILL 的全域鐵律為準，**不予採納**。
- brief 是內容層面的補充，**不可凌駕**全站結構與視覺規範。

每個一級章節**必須**用此黃金公式包裝，否則左側 Auto-TOC 完全無法渲染
（`generate.js` 以 regex 掃描 `<section id>` + `.sec-num` + `<h2>` 抽取 TOC）：

```html
<section id="s1">
  <div class="sec-head">
    <span class="sec-num">01</span>
    <h2>章節名稱</h2>
  </div>
  <p class="sec-sub">是什麼、解決什麼痛、在系統設計版圖中的座標。</p>
  <!-- 內文 / 互動演示 -->
</section>
```

- `id` 依序 `s1`, `s2`, ...；`sec-num` 用 `01`, `02`, ...。
- **不要**自己寫 `<html>/<head>/<header>/<footer>` 外殼，那些由 `templates/base.html` 自動組裝。
- 互動 demo 的 JS 放 `script.html`（會注入 `SCRIPT_PLACEHOLDER`）。
- 理想參考標的：`DistributedTransactions.html`。

### Step 3：組裝發佈

```bash
node scripts/generate.js --topic <id> --title "標題" --category "分類"
```

它會：注入 `templates/base.html` → 掃描章節生成 TOC → 寫出 `books/<id>/index.html`
→ **自動 upsert `docs/completed.json`** → 重新編譯 Mermaid 並重寫 `books/index.html`。
（`completed.json` 與 `books/index.html` 皆為自動產物，**勿手動編輯**。）

> **TOC 結構守門**：若草稿抽不到任何合法 `<section id="..."> + <h2>`（TOC 會是空的），
> `generate.js` 會**直接 `exit 1` 且不寫入任何檔**（completed.json 與頁面都不會產生）。
> 遇到此情況請回 Step 2 依黃金公式修正結構再重跑。
> 所有狀態檔寫入皆為 temp+rename 原子寫，且 `completed.json` 與 `books/index.html` 互為一致時具回滾保護
> （`generate.js` 發佈與 `remove-completed.js` 撤回兩條路徑皆然，任一步寫檔失敗即回滾至動作前的一致快照）。

### Step 5：收尾

> **fail-safe 不變量（務必遵守順序）**：`remove-todo.js` → `validate.js` → `git commit`。
> `validate` 與 `commit` 一律在 `remove-todo` **之後**；**切勿**在 `generate.js` 與 `remove-todo.js`
> 之間跑 validate——此時主題同時在 todo 與 completed，互斥檢查必然失敗（這是預期的中間狀態，
> 非錯誤）。CI 每次 push 都會跑 validate，遵守此順序即保證 commit 快照互斥乾淨、CI 必綠。
> 若 Step 4 的 lint 發現問題，因尚未 remove-todo、尚未 commit，可安全回 Step 2 修草稿重跑 `generate.js`。

- 確認 `docs/completed.json` 已新增該主題、`books/index.html` 已渲染出含新節點的可點擊心智圖。
- **移除待辦項目**：執行以下獨立腳本，將已完成的主題自 `docs/todo.json` 中自動移除：
  ```bash
  node scripts/remove-todo.js --topic <id>
  ```
- **狀態一致性驗證**：移除後，**必須**執行驗證腳本，確保 `todo.json`、`completed.json`、`mindmap.json`
  之間狀態完全一致且無語法錯誤；此腳本亦會比對 `books/index.html` 的主題卡片與 `completed.json` 是否同步：
  ```bash
  node scripts/validate.js
  ```
- **Git 提交（嚴格遵循單行規範）**：
  依據專案規範，Commit Message 必須為**單行（One-liner）描述**，不要條列 Bullet Points。
  自動化文件生成的 Commit 必須使用 `[automation]` 標籤：
  ```bash
  git add .
  git commit -m "[automation] Add <id> - publish <title> handbook"
  ```
- **推送遠端（Cursor 自動化環境的任務結尾）**：
  若本次撰文是在 **Cursor Cloud 自動化環境**中執行，撰文任務的結尾**必須**嘗試將 commit 直接推上主幹：
  ```bash
  git push origin main
  ```
  全專案的設計目標是全自動運行（Cursor Automation 每次都從最新的 `main` 啟動），直推 main 可避免「PR 未合併 → 狀態追蹤檔漂移」；CI 會在每次 push 跑 `validate.js` 把關。
  **僅當 `git push origin main` 失敗時**（權限不足、非 fast-forward 被拒等），才退而改以 PR 方式提交本次改動，留待人工處理。
  （非 Cursor 自動化的本地人工協作不在此限：是否 push 由使用者決定，預設僅 commit。）

## 撤回 / 重做主題（逃生路徑）

發錯主題、要重做或下架時，**不要手改 `docs/completed.json`**（禁止），改用獨立腳本：

```bash
node scripts/remove-completed.js --topic <id>                 # 移除 completed 條目 + 重繪首頁（頁面預設保留）
node scripts/remove-completed.js --topic <id> --restore-todo  # 同時把主題退回 todo.json（要重做時用）
node scripts/remove-completed.js --topic <id> --purge-page    # 連同刪除 books/<id>/ 頁面（不可逆）
node scripts/remove-completed.js --topic <id> --no-reindex    # 不重繪首頁（見下方注意事項）
node scripts/remove-completed.js --topic <id> --dry-run       # 先預覽將發生的變更，不落檔
```

撤回的三步寫入（completed.json → todo.json → books/index.html）為**單一交易**，任一步失敗即逆序回滾至撤回前；`--purge-page` 不可逆故獨立於交易、最後執行。

> **`--no-reindex` 注意事項**：此旗標會**刻意不重繪 `books/index.html`**，使首頁與 `completed.json` 暫時不一致。
> 由於 `validate.js` 現會比對「首頁卡片 ↔ completed」，**用了 `--no-reindex` 後、跑 `validate` / `git commit` 之前，
> 務必自行補一次重繪**（重跑一次不帶 `--no-reindex` 的 `remove-completed.js`，或執行 `generate.js`），否則 validate 會失敗。

撤回後一樣要跑 `node scripts/validate.js` 確認一致。本腳本**不動 mindmap**（刪節點屬 `topic-explorer` 職責）。

## 撰稿鐵律（讀者體驗）

1. **`<section>` 結構**：見上方黃金公式，缺了 TOC 就壞。
2. **Notion 淺色風格**：禁止 Dark Mode 樣式（如 `bg-slate-900`）。自訂 Canvas/SVG 背景用 `#ffffff` 或 `#fafaf9`，文字 `#262a2f`；Mermaid 主題為 `default`（base.html 已統一，勿改）。
3. **善用質感組件**：`.callout.accent`（關鍵折衷/觀念）、`.callout.warn`（陷阱/誤區）、`.oneliner`（章節尾「一句話秒答法」）、`.tbl-wrap`（所有 `<table>` 必包）。
4. **互動 Demo 高品質 Vanilla JS**：
   - 自包含：DOM/CSS/JS 完整放在 `content.html` + `script.html`，不跨主題共用。
   - 用 IIFE `(function(){ ... })();` 包裹，不污染全域。
   - 統一 UI 類別：`.demo` 外殼、`.seg` + `aria-pressed` 切換、`.btn`/`.btn.primary`、`.status-line`、`.legend` + `.dot`。
   - 統一狀態色 `.ns-*`：`.ns-idle` 閒置、`.ns-lock` 預留、`.ns-ok` 成功、`.ns-bad` 異常、`.ns-wait` 等待。
   - 必含一鍵 Reset。
5. **禁止引入大型前端框架**（React/Vue/Svelte）與高對比配色。

## 與前段流程的銜接

若撰稿時發現缺少先備主題、或想擴充某領域的後續主題，請交棒 `topic-explorer` skill
新增節點/邊到 `mindmap.json` 與 `todo.json`，再回來撰稿。

## 補充資源

- 視覺與互動元件完整規範與範例：`guidelines/style-guide.md`
