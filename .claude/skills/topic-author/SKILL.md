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
- [ ] 5. 收尾：執行 remove-todo.js 移除 todo -> 執行 validate.js 驗證 -> git commit（遵循單行規範）
```

### Step 1：選定主題

```bash
node scripts/completed-ledger.js --action get-recent --limit 1   # 脈絡：最近寫了什麼
node scripts/mindmap.js --action next                            # 取得最多 5 筆候選
```

`next` 的每筆候選帶有 `prerequisites_satisfied` 與 `missing_prereqs`：
**優先挑 `prerequisites_satisfied: true` 者**；候選順序刻意非確定，可自發選擇，但不要在先備未齊
（`missing_prereqs` 非空）時硬寫深主題——若真的想寫，請先回去補先備。

### Step 2：撰寫草稿（核心結構鐵律）

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

### Step 5：收尾

- 確認 `docs/completed.json` 已新增該主題、`books/index.html` 已渲染出含新節點的可點擊心智圖。
- **移除待辦項目**：執行以下獨立腳本，將已完成的主題自 `docs/todo.json` 中自動移除：
  ```bash
  node scripts/remove-todo.js --topic <id>
  ```
- **狀態一致性驗證**：移除後，**必須**執行驗證腳本，確保 `todo.json`、`completed.json` 與 `mindmap.json` 之間的狀態完全一致且無語法錯誤：
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
  （注意：除非使用者明確要求，否則**不要**擅自 push 到遠端。）

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
- 理想成品參考：`DistributedTransactions.html`
