# Demo 實作 Sub-Agent 共用 Brief

主線把 demo 的撰寫或重做派給 Sub-Agent 時，把本檔**逐字附在指派之後**。
指派本身寫明：負責哪幾篇、每篇的 archetype（主／次）、同 archetype 其他篇的視覺載體，以及本次範圍。

本檔只放「派工」才需要的規則。視覺、圖表與 demo 規範的唯一來源是 `guidelines/style-guide.md`，
下文以章節名稱引用，不重複內容。回覆使用繁體中文，技術名詞保留英文。

---

## 1. 絕對約束（違反即任務失敗）

1. **只准修改 `drafts/<id>/content.html` 與 `drafts/<id>/script.html`。** 其他檔案一律不准動。
2. **不得執行** `scripts/generate.js`、`scripts/validate.js`、`git add`、`git commit`、`git checkout`。
   產頁與提交由主線串行處理（並行會撞 `docs/completed.json`／`books/index.html`）。
3. **不得手改 `books/<id>/index.html`**——它是產物，draft 才是內容真相來源。
4. **不得派遣你自己的 Sub-Agent。**
5. **不得開瀏覽器、不得截圖、不得做點測。** 本專案禁止以瀏覽器做產文 QA（見 `AGENTS.md`）。
6. **兩階段作業**：第一階段**只交設計說明並停下**，不寫 code、不碰任何檔案。
   主線比對全部設計後會通知你繼續，你才進第二階段實作。
7. **不擴大戰場**：只做指派寫明的範圍。重做 demo 時不順手改文章論述；指派另有列出的項目（例如補 cap）才做。

---

## 2. 開工前必讀

1. `guidelines/style-guide.md` 的三段：
   - 「圖表與示意圖規範」（三條鐵律、選型表）
   - 「互動式演示 (Interactive Demo) 元件規格」全章，尤其 §0 Demo Archetype 與 §0.5 compute／render 分離與 `@probe`
   - 「嚴格禁止的作法」
2. 你負責的每一篇的 `drafts/<id>/content.html`（全篇，要懂論述才能設計 demo）與 `drafts/<id>/script.html`（全篇）。
3. 程式結構的參考（讀來理解水準，**不是**拿來複製骨架）：`scripts/quality/fixtures/drafts/good-sim/script.html`
   是最小的五段結構範例；`drafts/distributed-transactions-handbook/script.html` 是完整規模的範例
   （一頁 6 個 demo，6 組 `compute*`／`@probe` 集中在第 (2) 段，demo 樣式全部放在該篇自己的 `<style>`）。
   計算深度的參考見 style-guide §0.1 表格的「站內範本」欄。

---

## 3. 派工專用規範

### 3.1 Archetype 由主線指派，你不選型

指派會寫成「主＝X、次＝Y」。**不要改 archetype**，也不要「兩種都做」。
若讀完文章後認為指派的形式明顯不適合，**在第一階段的設計說明裡提出異議並附理由，然後停下**，由主線裁決。
`content.html` 開頭的宣告要同步成指派的 archetype（格式見 style-guide §0.2 鐵律 1）。

### 3.2 視覺載體不得與同 archetype 的其他篇同形

指派會列出同 archetype 的其他篇各用什麼畫面。**兩篇同 archetype 不得用同一種畫面**。
可選的載體例如：inline `<svg>` 幾何圖、`<canvas>`、CSS grid 矩陣、橫條圖、時間軸帶、逐 byte 色塊、巢狀盒、表格熱區。

### 3.3 不得沿用舊骨架

L1 閘門會掃這些指紋，**出現任一個即退回**：

```
function setSeg    function logRow    var verdict = {    var metrics = {
function fresh()   panel = { op       -p-writable        -p-risk       -p-hwm
```

同理，`.X-panel` + `.prow` + `.pk` / `.pv` 那組「事件／規則／指派／客戶端」四行面板是舊骨架的臉，**不要照抄**。

### 3.4 拆掉的 chrome 要連 CSS 一起移除

依 style-guide §0.4 拆掉 `.X-metric`／`.X-verdict`／`.X-wire` 時，連帶移除 `content.html` 的 `<style>` 裡對應的規則，不留孤兒 class。
留下的每一個都要在設計說明第 8 欄寫明理由。

---

## 4. 第一階段交付物：設計說明（每個 demo 一份，11 欄，不要寫散文）

```
## <topic-id> · demo <n>／<共幾個>

1. 位置：第 N 節「<小節標題>」
2. Archetype：<指派的代號>｜<一句話：為什麼這個形式就是本篇命題的形狀>
3. 自由度清單：
   - <控制項> → <slider／select／canvas 點選／文字輸入／toggle>｜值域 <…>｜它改變什麼
   - （至少 2 個，每一個都要在第 4 欄有對應的輸出反應）
4. 算出來的輸出（≥3，這是硬性 gate）：
   - <輸出名> ← <一行公式或演算法偽碼>｜為什麼不可能是查表
5. 寫死的常數（誠實申報）：
   - <固定資料集／固定文案>｜為什麼它可以是常數
   - ※ 若某個輸出其實是查表，必須列在這一欄。混進第 4 欄視為不通過。
6. 視覺載體：<svg／canvas／CSS grid／橫條／時間軸／逐 byte 色塊…>
   與同 archetype 其他篇的差異：<一句話>
7. `.seg` 組數：<n>（單一 demo 上限 2）｜是否拆成多個 demo：<是/否，幾個>
8. 移除清單：`.X-metric` <拆/留＋理由>、`.X-verdict` <拆/留＋理由>、`.X-wire` <拆/留＋理由>
   連帶移除的 CSS：<class 清單>
9. 新寫聲明：本 demo 的 CSS/JS 骨架為新寫；不含 §3.3 任何指紋。
   新增的 class 前綴：<`xx-`>
10. 不做什麼：<明確列出放棄的功能，防 scope creep>
11. 上站需人眼確認的操作步驟（草稿）：
    - 步驟：<含具體數值>　→　預期看到：<含具體數字>　→　在驗什麼：<哪條公式/規範>
```

最後附一段 `@probe` 三行註解的草稿（讓主線先確認斷言跑得起來）。

**交完就停下**，等主線通知再實作。

---

## 5. 第二階段交付物（收到主線的「開始實作」訊息後）

1. 改 `drafts/<id>/content.html`：開頭宣告、demo markup、`<style>` 增刪、周邊敘述與 `.cap` 的必要調整。
2. 改 `drafts/<id>/script.html`：依 style-guide §0.5 的五段結構撰寫。
3. 自檢（唯讀，可以跑，**全部 exit 0 才回報完成**）：
   ```bash
   node scripts/quality/demo-audit.js <id>
   node scripts/quality/compute-probe.js <id>
   node scripts/quality/archetype-window.js --topic <id>
   ```
   L1 第 6、9 項若為誤報（style-guide §0.6），在回報中逐項說明。
4. 回報：每篇列出**改了哪些區塊、最終的 `@probe` 三行、以及第 11 欄的實測步驟定稿**。
   若實作過程中偏離了設計說明，明確說明哪一項、為什麼。

---

## 6. 附則：修訂既有文章時（`topic-reviser` 派工才適用）

### 6.1 只補宣告的篇

若指派寫「只補宣告」：只在 `content.html` 開頭加宣告註解，**不改任何其他內容**，除非指派另列「補 cap」清單。
這類篇不要求新增 compute 函式；它們在 L1 第 11 項與 L2 的既有失敗已登錄於 `docs/tech-debt.md`。

### 6.2 靜態圖換形式（chip row 類）

依 style-guide「圖表與示意圖規範」的選型表：時序／往返 → Mermaid `sequenceDiagram` 或 CSS grid swimlane；
狀態＋轉移 → `stateDiagram-v2`；並列組合 → `.tbl-wrap` 表格。每張補 `<p class="cap">`。
連帶移除不再被引用的 CSS class（若別處仍有引用則保留）。**同一篇的多張圖不要全換成同一種形式。**
