---
name: topic-reviser
description: >-
  Revises and re-publishes an EXISTING topic page in the "System Design Every Day" handbook —
  the update / enhancement counterpart to topic-author. Use when the user is unhappy with an
  already-published article, wants to strengthen unclear concepts, add missing examples, or
  when an interactive demo is broken / behaves oddly. Handles two entry modes (user names the
  parts to fix, OR asks for an open-ended quality audit), always discusses the change direction
  first, then runs the draft -> generate (with --keep-date) -> user-review -> commit pipeline.
  Trigger phrases include "這篇寫得不夠好", "更新/補強某篇", "這個 demo 怪怪的/有問題",
  "元件異常", "檢視 drafts/<id>", "revise topic", "improve this page", "the demo is broken".
---

# Topic Reviser — 既有文件修訂與重新發佈 (更新工作流)

你是這本 System Design 手冊的「內容審稿人 + 前端演示醫生」。你負責**修訂已發佈的文件**：
找出不足、和使用者確認改動方向、更新草稿、重新發佈。這是 `topic-author`（新建）的對照兄弟。

```
topic-explorer  →  選題、維護知識圖譜        （前段）
topic-author    →  撰稿 → 發佈新主題          （新建）
topic-reviser   →  修訂既有「已發佈」文件      （更新）← 你在這
```

**前置條件**：主題**已發佈**（同時存在於 `books/<id>/index.html`、`docs/completed.json`、`drafts/<id>/`）。
- 若使用者其實想寫**全新**主題 → 交棒 `topic-author`。
- 若要**選題 / 新增節點到圖譜** → 交棒 `topic-explorer`。

開始前**必讀** `guidelines/style-guide.md`（視覺與互動元件的唯一規範來源），並沿用 `topic-author`
的「撰稿鐵律」——本 skill 不重複那些規則，只補「更新情境」的差異。

> **草稿是內容真相來源**：`drafts/<id>/content.html`（與 `script.html`）是產物頁面的來源。
> **一律改草稿再重跑 `generate.js`，禁止直接手改 `books/<id>/index.html`。**
> 若 `drafts/<id>/` 缺失或疑似與線上不同步，先用反解腳本重建（確定性逆運算，非猜測）：
> ```bash
> node scripts/extract-drafts.js --topic <id> --dry-run   # 先預覽 + 驗證，不落檔
> node scripts/extract-drafts.js --topic <id>             # 確認無誤後重建草稿
> ```

## 兩種進入模式（先判斷，再進共同管線）

### Mode A — 使用者已指定範圍（directed）
使用者明確點名要改哪些部分（某章不清楚、某段要補、某元件壞了）。
1. **只針對被點名的部分**做定點檢查（不擴大戰場）。
2. 讀懂現況後，提出 1–3 個具體改動方向。
3. → 進入「討論 gate」。

### Mode B — 開放式體檢（audit）
使用者只說「這篇寫得不夠好」，未指定。你**主動**依下方標準清單掃描全篇，
整理成一份「觀察報告」，讓使用者挑要不要改、怎麼改。

#### 標準體檢清單（五維度）
| 維度 | 檢查什麼 |
|---|---|
| **① 概念清晰度** | 抽象術語有無具體化/視覺化？多個概念之間的關係（層級、包含、順序、交互）是說清楚了，還是只是**平行條列**？ |
| **② 論證鏈完整性** | 有無「懸空結論」——講了 what 卻沒給 why/how、給了規則卻無**具體範例**佐證？關鍵警告有無對應的**反例/後果**？ |
| **③ 圖表適切性** | 依 style-guide「圖表與示意圖規範」逐張檢查：**圖的形式對得上它要表達的語意嗎**？特別揪出 **`.X-flow` / `.X-chip` 的 flex-wrap chip row**——若它承載的是時序／因果（誰先誰後、往返、失敗時點），一律判為不合格，改 Mermaid `sequenceDiagram` 或 grid swimlane。另檢查：節點與邊是否共用同一 class？橫排是否超過 6 個而必定折行？有無 `<p class="cap">`？ |
| **④ 互動元件健康度** | 能否**實際跑**（見「元件實測」）？每個控制項是否**有意義**且對齊章節敘事（別留無用/會誤導的模式）？是否遵守 style-guide 外殼規格（`.demo`/`.seg`/`.btn`/`.status-line`/`.legend`/`.ns-*`、IIFE、一鍵 Reset）？<br>**更要問互動模型本身**：這篇的 archetype 是什麼、有宣告嗎、與鄰近幾篇撞形嗎？是否為「腳本重播型」——所有輸出都是字面常數、使用者只是切換播放哪一段預寫敘事？`.X-metric`（步 N/M）+ `.X-verdict` + `.X-wire` 是否三者俱全而讓 demo 變成「播放器」？ |
| **⑤ 表達與結構品質** | `<section>` 黃金公式完整（TOC 可抽取）、`.callout`/`.oneliner`/`.tbl-wrap` 使用得當、錯字/語意、資訊密度是否恰當。 |

> 📌 **Mode B 體檢時，③ 與 ④ 仍是最常出問題的兩項**（全站曾有過半數篇含時序 chip row、連續 10 篇共用同一套 demo 骨架，
> 已經過數輪校訂）。體檢前先看 `docs/tech-debt.md`：該篇若已有登錄的待處理項，直接納入觀察報告，不必重新發現。

**觀察報告格式**：每一項標明「**位置**（`sXX` 章節 / 哪個元件）+ **為什麼是問題** + **建議方向**」。
不要在報告階段直接動手改。

#### 元件實測（④ 的具體手段，不開瀏覽器）
```bash
node scripts/quality/demo-audit.js <id>                 # L1：宣告、.seg、三件組、舊骨架、語法、id 綁定、cap…
node scripts/quality/compute-probe.js <id>              # L2：依 @probe 判定模擬器 vs 播放器（找死參數）
node scripts/quality/archetype-window.js --topic <id>   # 與發佈序上相鄰 3 篇是否撞形
```
- 再逐一核對每個控制項的事件綁定與 render 邏輯，找「永遠 0 命中」「無實際作用」「與敘事脫節」的死控制項。
- 早於 compute／render 約定的舊篇在 L1 第 11 項或 L2 會失敗，這些已登錄於 `docs/tech-debt.md`，報告中引用即可。
- 瀏覽器點測**不是** Agent 的驗收手段（見 `AGENTS.md`）；Step 4 的預覽是給使用者看的。

## 討論 Gate（兩模式共同的必經關卡）

> 這是本 skill 的核心精神，對齊全域「Discussion-First」原則：
> **提出方向 → 等使用者確認 → 才動手。** 未確認前不改任何草稿。

把方向/報告交給使用者，等待「就照這樣改」或使用者的調整意見。使用者可能只挑其中幾項。

## 共同管線（方向確認後）

```
- [ ] 1. 改草稿：drafts/<id>/content.html 與/或 script.html（禁止手改 books/<id>/index.html）
- [ ] 2. 落地前驗證：demo-audit.js / compute-probe.js / archetype-window.js --topic <id>
         動到 demo → 三者皆須 exit 0（L1 第 6、9 項確認為誤報可放行，見 style-guide §0.6）
         只改論述 → demo-audit.js 不得出現本次新增的失敗；tech-debt.md 已登錄的既有失敗不阻擋
- [ ] 3. 重新發佈（務必帶 --keep-date + 沿用既有 title/category）：
         node scripts/generate.js --topic <id> --title "<既有 title>" --category "<既有 category>" --keep-date
- [ ] 4. 使用者審核：提供 open books/<id>/index.html 預覽，等待確認（可反覆回 Step 1 修正）
- [ ] 5. 一致性驗證：node scripts/validate.js
- [ ] 6. 提交（確認後才做，單行 [docs] 規範，僅 stage 本次觸及的檔）
```

### 更新情境的鐵律（與新建流程的關鍵差異）

1. **`--keep-date` 保留原始完成日期**：更新 ≠ 重新完成。`generate.js` 預設會把 `completed_at`
   bump 成今天；更新時**必須**加 `--keep-date`，讓它沿用 `completed.json` 的原始日期（旗標會自動
   讀取既有 entry 的 `completed_at`）。**這是最容易漏的坑。**
2. **沿用既有 `title` / `category`**：從 `docs/completed.json` 讀該主題現有的 `title` 與 `category`，
   原封傳入，**不要更動 metadata**（改標題/分類不屬於「內容修訂」）。
3. **不動 `todo.json` / `mindmap.json`、不跑 `remove-todo.js`**：主題早已完成、不在 todo，
   純內容更新與選題/圖譜無關。（這正是與 `topic-author` 收尾流程最大的不同——沒有 remove-todo 步驟。）
4. `completed.json` 與 `books/index.html` 皆為 `generate.js` 自動產物，**勿手動編輯**。
5. **改 archetype 等於改撞形版圖**：宣告的主 archetype 一變，發佈序上前後各 3 篇的視窗都要重判；
   以 `archetype-window.js --topic <id>` 的結果為準。
6. **重做 demo 時沿用新約定**：依 style-guide §0.5 改成五段結構並補 `@probe`，讓該篇脫離 tech-debt 的舊篇清單；
   處理完一項 tech-debt 就更新 `docs/tech-debt.md` 那一列的狀態與處理 commit。
7. **大批次校訂派 Sub-Agent 時**，把 `guidelines/demo-agent-brief.md` 逐字附在指派之後（含第 6 節修訂附則）。

### Step 6：Git 提交（單行 `[docs]` 規範）

比照專案單行 commit 慣例，內容修訂用 `[docs]` 標籤，單行描述改了什麼：
```bash
git add drafts/<id>/content.html drafts/<id>/script.html books/<id>/index.html   # 僅本次觸及的檔
git commit -m "[docs] refine <id>: <一句話說明本次修訂重點>"
```
- **只 stage 本次真正改動的檔**，勿 `git add .`（避免夾帶無關檔案）。
- 帶 `--keep-date` 時 `completed.json` / `books/index.html` 通常不會有日期 diff；
  若確實無變更，就不需 stage 它們。
- 本地人工協作預設**僅 commit，不 push**；是否 push 由使用者決定。

## 逃生 / 注意事項

- 若 Step 4 使用者不滿意，因**尚未 commit**，可安全回 Step 1 修草稿、重跑 `generate.js`（仍帶 `--keep-date`）。
- 若 `generate.js` 因 TOC 結構守門 `exit 1`（草稿抽不到合法 `<section id> + <h2>`），
  它**零副作用**不落任何檔；回 Step 1 依黃金公式修正結構再重跑。
- 若要把整篇下架或改動 metadata（標題/分類/日期語意本身），那超出「內容修訂」範疇，
  改用 `topic-author` 的撤回逃生路徑（`remove-completed.js`）或重新發佈。

## 與其他 skill 的分工

- 缺先備主題、要擴充後續主題 → `topic-explorer`（維護 `mindmap.json` / `todo.json`）。
- 要寫全新主題 → `topic-author`。
- 視覺與互動元件完整規範 → `guidelines/style-guide.md`。
- 已知、尚未處理的全站問題與處理狀態 → `docs/tech-debt.md`。
