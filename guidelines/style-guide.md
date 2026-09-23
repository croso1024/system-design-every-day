# Style Guide — Notion 極簡風格與互動元件設計規範

本手冊定義 System Design Every Day 專案的視覺風格與互動式演示 (Interactive Demo) 元件規範。
未來的 AI Agent 在撰寫新指南前，**必須嚴格閱讀並遵循本規範**。

> ⚠️ **「一致」指的是視覺語彙，不是內容形式。** 請分清楚兩件事：
> - **要一致**：配色、字體、`.callout` / `.oneliner` / `.tbl-wrap` / `.demo` 外殼等元件樣式。
> - **要多樣**：圖表形式（見「圖表與示意圖規範」）與 Demo 互動模型（見「Demo Archetype」）。
>
> 多 demo 結構的參考標的 `drafts/distributed-transactions-handbook` 一頁有 **6 個 demo、6 種不同互動形式**。
> 借它的**結構**（拆小、各司其職、就近擺放），**不要**把它的某一個 demo 當成所有主題的模板；
> 其中 4 個 demo 的輸出仍是字面常數，**不可作為實作參考**（見 §0.3）。

---

## 🎨 設計哲學：極簡與高度可讀性 (Notion-like Light Mode)

我們屏棄了傳統科技文檔沉重的 Dark Mode，採用 **Notion 淺色極簡風格**。
視覺以大面積的白、柔和灰、灰褐色邊框、以及低飽和度的主色與狀態色為主，字體以高質感的 `Noto Sans TC` 與 `JetBrains Mono` 為標準。

---

## 🧭 雙欄 TOC 自動化佈局規範 (極重要)

每篇指南在編譯時會被自動組裝成雙欄佈局：左側為 **Sticky TOC 導覽列**，右側為 **內文區**。
為了解放 AI 生產力，`scripts/generate.js` 會**自動掃描並抽取**內容中的章節生成 TOC。

### 📌 內文結構黃金公式

每一個一級章節（TOC 項目）都必須嚴格採用以下 HTML 結構：

```html
<section id="s1">
  <div class="sec-head">
    <span class="sec-num">01</span>
    <h2>總覽與定位</h2>
  </div>
  <p class="sec-sub">是什麼、解決什麼痛、在系統設計版圖中的座標。</p>

  <!-- 這裡放你的 Markdown 轉譯 HTML 或互動演示 -->
</section>
```

#### 規則細節：
1. **`<section id="sX">`**：必須有唯一的 `id`，這將成為 TOC 的錨點（Anchor），請依序使用 `s1`, `s2`, `s3` 等。
2. **`sec-head` 與 `sec-num`**：包含一個數字前綴（例如 `01`, `02`）以及一個 `<h2>` 標題。數字與標題將被自動解析並渲染至左側 TOC。
3. **`sec-sub`**：可選的章節副標題，使用輕量、淡色文字補充說明此章節核心。

---

## 🧱 基礎色彩系統 (CSS 變數)

全站基於 CSS 變數進行視覺渲染，請**避免**使用與這套系統衝突的高飽和、隨機 Tailwind 配色：

| 變數名稱 | 顏色範例 | 具體色值 | 適用場景 |
| :--- | :---: | :--- | :--- |
| `--bg` | ⬜️ 白 | `#ffffff` | 全站主頁面背景 |
| `--bg-soft` | 🌫 柔和灰 | `#fafaf9` | 控制面板背景、區塊背景 |
| `--text` | 🐈 深灰 | `#262a2f` | 主標題、段落正文字 |
| `--text-2` | 🪙 中灰 | `#6b7078` | 副標題、輔助說明文字 |
| `--text-3` | 🪨 淡灰 | `#9aa0a8` | 超連結邊框、TOC 數字、未啟用狀態 |
| `--border` | ◽️ 細線灰 | `#ecebe8` | 一般卡片、表格、面板細邊框 |
| `--border-strong` | ◾️ 強調灰 | `#dedcd8` | 互動主邊框、按鈕邊框、強調邊界 |
| `--code-bg` | 💻 程式底色 | `#f6f5f3` | 行內與區塊程式碼背景色 |
| `--accent` | 💙 主藍色 | `#3f6188` | 品牌主色、主按鈕、作用中狀態、高亮 |
| `--accent-soft` | 🐳 淡藍底 | `#eef2f7` | 主色背景高亮、作用中 TOC 項目底色 |
| `--ok` | 🟢 成功綠 | `#4d7d68` | 成功狀態、已提交 (Committed) 狀態 |
| `--ok-soft` | 🥬 淡綠底 | `#eef4f1` | 成功狀態的軟背景色 |
| `--warn` | 🟡 警告黃 | `#a3743e` | 警告狀態、已預留/鎖定 (Prepared) 狀態 |
| `--warn-soft` | 🧀 淡黃底 | `#f6f0e7` | 警告狀態的軟背景色 |
| `--bad` | 🔴 異常紅 | `#a8554f` | 錯誤、阻塞、終止 (Aborted) 狀態 |
| `--bad-soft` | 🍉 淡紅底 | `#f6ecea` | 錯誤狀態的軟背景色 |

---

## 📝 質感排版與 Notion 專屬組件

請活用以下高質感自訂組件，讓技術手冊呈現宛如 Notion 一般的精緻排版。

### 1. 資訊提示框 (`.callout`)

用於穿插關鍵知識點、補充座標或注意事項。支援兩種色調：

#### A. 知識聚焦藍 (`.callout.accent`)
```html
<div class="callout accent">
  <div class="c-title"><span class="ic">關鍵</span>不會出現「Confirm 完又 Cancel」</div>
  <p>全域決策是二元且有順序的，Try 成功才進入 Confirm，Try 失敗就 Cancel。</p>
</div>
```

#### B. 異常警告橘 (`.callout.warn`)
```html
<div class="callout warn">
  <div class="c-title"><span class="ic">陷阱</span>常見誤區</div>
  <p>以為 3PC 解決了所有問題。其實它仍無法在網絡分割（Network Partition）下保證一致性。</p>
</div>
```

### 2. 面試考點一句話摘要 (`.oneliner`)

置於每個章節的尾聲，供讀者快速掌握能在面試中秒答的「黃金標準答案」。

```html
<div class="oneliner">
  <b>一句話答法</b>2PC 用協調者把提交拆成 Prepare / Commit 兩步換取強一致，但代價是同步阻塞與協調者單點。
</div>
```

### 3. 表格包裝 (`.tbl-wrap`)

所有 `<table>` 元素皆必須使用 `.tbl-wrap` 包裹，以確保在行動端有完美的響應式滾動，並呈現高質感的 Notion 線條。

```html
<div class="tbl-wrap">
  <table>
    <thead>
      <tr>
        <th>方案</th>
        <th>一致性</th>
        <th>可用性 (A)</th>
        <th>吞吐量</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>2PC</td>
        <td class="hl">強一致 (CP)</td>
        <td>低</td>
        <td>低 (同步阻塞)</td>
      </tr>
    </tbody>
  </table>
</div>
<p class="cap">指標對比：在一致性與可用性之間不存在免費的銀彈。</p>
```

### 4. 數學表示法 (`<var>` 與 `.formula`)

> ⚠️ **嚴禁使用 LaTeX 數學語法。** 本站的 `templates/base.html` **不會載入** MathJax / KaTeX 等數學渲染庫，任何 LaTeX 分隔符都會被瀏覽器當作**純文字**原樣顯示，造成渲染錯誤（例如頁面上直接出現 `$N$` 或 `\[ W + R > N \]`）。
>
> 因此 **禁止** 使用：行內 `$...$`、`\( ... \)`，區塊 `$$ ... $$`、`\[ ... \]`，以及 `\frac`、`\sum`、`\times`、`\leq` 等任何反斜線 LaTeX 巨集。

請改用以下原生 HTML 寫法：

#### A. 行內數學變數 (`<var>`)

單一變數或符號（如 `N`、`W`、`R`、`O(n)`）一律使用 `<var>` 標籤，會自動套用等寬字體與主色強調。

```html
<p>寫入成功的節點數 <var>W</var> 與讀取請求的節點數 <var>R</var> 必須滿足條件。</p>
```

#### B. 區塊數學公式 (`.formula`)

獨立成行、需要強調的公式，使用 `.formula` 區塊（置中、等寬、淡灰底）。

```html
<div class="formula">W + R &gt; N</div>
```

> 🚨 **務必轉義 HTML 特殊字元**：公式中的 `>`、`<`、`&` 必須寫成 `&gt;`、`&lt;`、`&amp;`，否則會被當成 HTML 標籤解析而破版。
>
> 📌 **結構提醒**：`.formula` 是區塊級 `<div>`，**不可**置於 `<p>` 內（非法巢狀）。若公式夾在段落中間，請先收掉前段 `</p>`，放置 `.formula`，再以新的 `<p>` 承接後文。

---

## 📐 圖表與示意圖規範 (Diagrams)

> **這章為什麼存在**：`AGENTS.md` 把「精美且具結構感的圖表」列為每篇必備支柱，但本規範過去從未定義圖表長什麼樣。
> 結果是 Agent 只能拿手邊唯一的視覺原語（藥丸 chip）去拼流程，產出**一排折行的色塊**——它表達不了任何順序或因果。
> 本章給出「語意 → 正確形式」的對照與可直接複製的結構。**圖表的 CSS 區塊是設計來被複製的**（與 Demo 邏輯相反，見下一章）。

### 0. 先選型：語意決定形式

動筆前先問一句：**這張圖要表達的是哪一種語意？** 再對照下表取形式。

| 你要表達的語意 | 正確形式 | 明確禁用 |
| :--- | :--- | :--- |
| **靜態拓樸 / 資料流管線**（誰接誰、元件組成） | `.<p>-row` 盒 + 箭頭（節點 ≤ 6 個） | chip row |
| **時序 / 因果**（誰先誰後、跨參與者往返、失敗發生在哪一刻） | Mermaid `sequenceDiagram`，或 `.<p>-lane` CSS grid swimlane | **絕對禁止** chip row |
| **狀態機**（狀態 + 轉移條件） | Mermaid `stateDiagram-v2`；需 demo JS 驅動時用 inline `<svg>` | chip row |
| **空間 / 幾何**（hash ring、向量空間、分區環、位址空間） | inline `<svg>` | 任何 HTML 盒排列 |
| **A vs B 對照** | `.tbl-wrap` 表格，或 `.<p>-split` 並排雙欄 | 上下兩排 chip |
| **分層 / 包含**（協定分層、儲存層級、快取階層） | `.<p>-stack` 直向巢狀盒 | 橫排 chip |
| **數量 / 比例 / 成本** | `.tbl-wrap` 表格，或 `.<p>-bar` 橫條 | chip |

> `<p>` 代表本篇的 class 前綴（如 `eda-`、`cdc-`）。沿用專案既有慣例：draft 自帶 CSS、不跨主題共用選擇器。

### 1. 三條鐵律

#### 鐵律 1｜節點與邊必須是**不同元素**

- **節點**（服務、元件、狀態、資料）→ `.<p>-node`：**實線框、白底、`min-width: 110px`、置中**。
- **邊**（訊息名、動作、條件）→ `.<p>-arrow`：**無框、灰字、自帶箭頭字元**。

兩者若共用同一個 class（只差虛線邊框或灰字），讀者無法分辨「框」與「線」，圖就失去層級。

```html
<!-- ❌ 錯誤：節點與訊息名長得一樣，讀者分不出哪個是服務、哪個是事件 -->
<div class="eda-flow">
  <span class="eda-chip node">庫存</span>
  <span class="eda-chip op">StockReserved</span>
  <span class="eda-chip node">出貨</span>
</div>

<!-- ✅ 正確：盒是節點，箭頭是邊，訊息名依附在箭頭上 -->
<div class="eda-row">
  <div class="eda-node"><div class="nn">庫存服務</div><div class="ns">扣減可用量</div></div>
  <span class="eda-arrow">──StockReserved──▸</span>
  <div class="eda-node"><div class="nn">出貨服務</div><div class="ns">開立出貨單</div></div>
</div>
```

#### 鐵律 2｜橫排節點超過 6 個，一律不准用 `flex-wrap`

內文欄寬（含 Sticky TOC）約 720px。**7 個以上的節點必然折行**，而折行後 DOM 順序不再等於視覺閱讀順序——
時序語意當場歸零，最後一個節點會孤零零掉在第三列，與它所屬的流程完全斷開。

超過 6 個節點時，**必須**改用下列之一：直向 `.<p>-lane`（每列一步）、Mermaid、或 inline `<svg>`。

> 若你正在寫的橫列有 8 個以上的 `<span>`，停下來換形式。這不是風格偏好，是版面物理。

#### 鐵律 3｜每張圖下方必須有 `<p class="cap">`

一句話說明「這張圖在講什麼、讀者該看哪裡、哪個細節是重點」。
`.cap` 是圖表語意的最後一道保險。**沒有 cap 的圖等同沒畫。**

---

### 2. `.<p>-row` — 線性管線 / 拓樸（節點 ≤ 6）

適用：資料流、請求路徑、元件組成。站內良好範例：`drafts/rag-fundamentals`（`.rag-arch-row` + `.rag-box` + `.rag-arr`）。

```html
<div class="dns-row">
  <div class="dns-node">
    <div class="nn">Stub Resolver</div>
    <div class="ns">作業系統內建</div>
  </div>
  <span class="dns-arrow">▸</span>
  <div class="dns-node accent">
    <div class="nn">Recursive Resolver</div>
    <div class="ns">代你跑完整條查詢</div>
  </div>
  <span class="dns-arrow">▸</span>
  <div class="dns-node">
    <div class="nn">Root / TLD / 權威</div>
    <div class="ns">逐層 referral</div>
  </div>
</div>
<p class="cap">遞迴解析器是唯一會「跑完整條鏈」的角色；Stub 只發一次問，權威只答自己那一段。</p>
```

```css
/* 圖表 CSS 設計來被複製；改前綴即可，結構請勿改 */
.dns-row {
  display: flex; flex-wrap: wrap; gap: 10px;
  align-items: stretch; justify-content: center;
  margin: 14px 0 6px;
}
.dns-node {
  border: 1px solid var(--border-strong); border-radius: 8px;
  background: #fff; padding: 10px 12px;
  min-width: 110px; max-width: 200px; text-align: center;
}
.dns-node .nn { font-family: var(--mono); font-size: 12px; font-weight: 700; color: var(--text); }
.dns-node .ns { font-size: 11px; color: var(--text-2); margin-top: 3px; line-height: 1.4; }
.dns-node.accent { border-top: 3px solid var(--accent); }
.dns-node.ok     { border-top: 3px solid var(--ok); }
.dns-node.warn   { border-top: 3px solid var(--warn); }
.dns-node.bad    { border-top: 3px solid var(--bad); }
/* 邊：無框、灰字、只負責指向 */
.dns-arrow {
  display: flex; align-items: center;
  font-family: var(--mono); font-size: 13px; color: var(--text-3);
  white-space: nowrap;
}
```

---

### 3. `.<p>-lane` — 時序 Swimlane（純 CSS grid，不折行）

適用：**跨參與者的往返、且需要看出「第幾步」**。每列一個時間步，每欄一個參與者——這是 chip row 最常被誤用的場合。

```html
<div class="cs-lane">
  <div class="lh">步驟</div><div class="lh">Client A</div><div class="lh">鎖服務</div><div class="lh">資源</div>
  <div class="lt">t1</div>
  <div class="lc act">請求鎖</div><div class="lc">核發 token=17</div><div class="lc">—</div>
  <div class="lt">t2</div>
  <div class="lc bad">GC pause</div><div class="lc">租約到期、釋放</div><div class="lc">—</div>
  <div class="lt">t3</div>
  <div class="lc">甦醒，帶 token=17 寫入</div><div class="lc">—</div><div class="lc ok">已見過 23 &gt; 17，拒絕</div>
</div>
<p class="cap">關鍵在 t3：資源端（不是鎖服務）比對 fencing token，才擋得住這個已經失去鎖卻毫不知情的客戶端。</p>
```

```css
.cs-lane {
  display: grid; grid-template-columns: 52px repeat(3, 1fr); gap: 1px;
  background: var(--border); border: 1px solid var(--border);
  border-radius: 8px; overflow: hidden; margin: 14px 0 6px;
}
.cs-lane > div { background: #fff; padding: 8px 10px; font-size: 12px; line-height: 1.5; }
.cs-lane .lh { background: var(--bg-soft); font-family: var(--mono); font-size: 11px;
               font-weight: 700; color: var(--text-2); }
.cs-lane .lt { background: var(--bg-soft); font-family: var(--mono); font-size: 11px; color: var(--text-3); }
.cs-lane .lc.act { background: var(--accent-soft); }
.cs-lane .lc.ok  { background: var(--ok-soft); }
.cs-lane .lc.bad { background: var(--bad-soft); }
@media (max-width: 720px) { .cs-lane { grid-template-columns: 44px repeat(3, minmax(0, 1fr)); font-size: 11px; } }
```

> Grid **不會折行**——欄數固定，這正是它比 `flex-wrap` 適合時序的原因。

---

### 4. Mermaid — 時序圖與狀態機的預設手段

`templates/base.html` 已載入 `mermaid@10`（`theme: 'default'`、`startOnLoad: true`）。
**這是本站唯一被背書的時序圖 / 狀態機工具，畫時序請優先用它**，不要手刻 SVG 座標。

```html
<pre class="mermaid">
sequenceDiagram
    participant P as Producer
    participant L as Leader
    participant F as Follower
    P->>L: produce(acks=all)
    L->>F: replicate
    F-->>L: ack
    L-->>P: 已提交
</pre>
<p class="cap">acks=all 的等待點在 Leader：它必須收齊 ISR 的 ack 才回應 Producer，延遲換到的是不遺失。</p>
```

使用邊界：

1. **只用三種圖**：`sequenceDiagram`、`stateDiagram-v2`、`flowchart LR|TD`。其他圖種（gantt、pie、journey…）一律不用。
2. **不得改 theme**（`base.html` 已統一為 `default`，勿在頁面內覆寫）。
3. **不得放進 `.demo` 內**。Mermaid 是靜態圖；互動一律走 Vanilla JS + DOM/SVG。
4. **節點文字要短**（中文 ≤ 8 字、英文 ≤ 3 詞），長說明放 `.cap`，否則節點會被撐爆。
5. 一樣**必須**配 `.cap`。

---

### 5. inline `<svg>` — 空間幾何，與需要 JS 重繪的圖

**何時用**：(a) 幾何 / 座標語意（hash ring、向量空間、環狀分區）；(b) 圖需要被 demo 的 JS 即時重繪。

站內範本：`drafts/consistent-hashing-handbook`（雜湊環）、`drafts/coordination-services`（鎖競態時間軸）、
`drafts/leader-election-and-raft`（Raft 狀態機，log 矩陣與 quorum 票型由狀態機推導）。

> ⚠️ 本節談的是**畫法**。`drafts/data-replication-basics` 曾列在這份清單上——它的 SVG 沿路徑動畫封包的寫法可以參考，
> 但**它的模擬層是假的**（「Client 讀到舊值」是寫死的字串，不是去讀當下 follower 的狀態），所以已從清單移除。
> 借用它的畫法時，不要一起借走它的資料層。

規範：

- 一律 `viewBox="0 0 W H"` + `style="width:100%; height:auto"`（不要寫死 px 寬）。
- 背景 `#ffffff` 或 `#fafaf9`；文字 `#262a2f`；線條與狀態色用 `var(--border-strong)` / `var(--accent)` / `var(--ok)` / `var(--warn)` / `var(--bad)`。
- 文字字級 **≥ 11px**（縮放後仍需可讀），字體 `var(--mono)`。
- 加 `role="img"` 與 `<title>`，供無障礙與 CDN 失效時理解。
- 箭頭用 `<marker>` defs 定義一次重複使用，不要用文字 `→` 冒充。

---

### 6. 圖表禁止事項

1. **禁止用 `.tag` / `.legend` / `.seg` 的藥丸樣式冒充圖表節點。** 這三者分別是「關鍵字標籤」「狀態圖例」「互動切換器」，都不是圖形元件。
2. **禁止同一個 class 同時承載節點與邊**（只靠虛線或灰字區分不算區分）。
3. **禁止超過 6 個節點的 `flex-wrap` 橫排。**
4. **禁止表達時序語意卻不畫方向**——有「先／後／回傳／逾時／失敗」的圖，必須有箭頭或明確的時間軸欄。
5. **禁止無 `.cap` 的圖表。**
6. **禁止把上一篇的 `.X-flow` / `.X-chip` 整塊複製過來改前綴**；先回 §0 重新選型。

---
## 🎮 互動式演示 (Interactive Demo) 元件規格

高質感的互動模擬器 (Interactive Demo) 是本專案的靈魂。

> ⚠️ **本章分兩層，請勿混淆：**
> - **§0 Demo Archetype** — 這篇 demo 是「哪一種形式」。這一層**要求多樣**：不同概念需要不同的互動模型。
> - **§1 起的 UI 外殼詞彙** — `.demo` / `.seg` / `.btn` / `.status-line` / `.legend` 的統一樣式。這一層**要求一致**。
>
> §1 之後的範例是**外殼**，不是互動模型。**照抄外殼不等於完成設計**。
> 先完成 §0 的選型，再回來套外殼。

---

### 0. Demo Archetype — 先選型，再寫 code ★本章最重要

#### 0.1 六種 Archetype

| # | Archetype | 核心互動 | 適合的概念 | 站內範本 |
| :---: | :--- | :--- | :--- | :--- |
| **A** | **時序推進**<br>Step-through | 按「下一步」走過一組固定步驟 | 本質**就是**固定順序協定的主題（2PC、TLS handshake、ICE、TCP 三向交握） | `drafts/tcp-udp-and-socket-programming`（點選封包注入丟包，cwnd／ssthresh／累積 ACK 真算） |
| **B** | **參數掃描**<br>Parameter sweep | 拖 slider / 改數值，結果**即時重算** | 有可調參數、且參數會改變結果的機制（watermark 延遲、W+R>N、TTL、acks、chunk size） | `drafts/stream-processing`（視窗×水位）、`drafts/nat-port-forwarding`（自由輸入→四元組比對→改寫或 DROP） |
| **C** | **並排對照**<br>Side-by-side | 同一組輸入同時餵給兩個面板（「天真 vs 正確」，或兩種都合法的相反設計） | 有明確錯誤解法、或有兩種對立取捨的主題（dual-write vs Outbox、B-Tree vs LSM-Tree） | `drafts/embedded-database`（SQLite vs RocksDB，MemTable／L0 stall／write amp 真算） |
| **D** | **空間視覺化**<br>Spatial | 在幾何／座標空間上點選、拖曳、增刪節點 | 有空間語意的主題（hash ring、向量空間、分區環、子網位址空間） | `drafts/consistent-hashing-handbook`（successor rule 與 remap% 真算）、`drafts/vector-database-fundamentals`（canvas，IVF／HNSW 真的只掃被 probe 的部分） |
| **E** | **決策器**<br>Decision | 回答數個問題 → 導出選型建議與理由 | 選型類、trade-off 類、「什麼時候該用哪個」 | `drafts/distributed-transactions-handbook`「選型決策器」（三題 → `decide()` 推導，含衝突需求的特例） |
| **F** | **拆解器**<br>Decomposer | 輸入一筆真實資料 → 逐層 / 逐 byte 拆解標註 | 有格式或編碼結構的主題（protobuf wire format、封包標頭、子網遮罩、JWT、URL） | `drafts/ip-addressing-subnetting`（逐 bit 切 net／host，含 /31 /32 邊界）、`drafts/search-analytics-engine`（分詞→posting→合併→BM25 逐階段攤開） |

同一個主題常常有不只一種可行選型。**若 A 與 B 都說得通，優先選 B**——能被使用者擾動的 demo 幾乎總是資訊量更大。

> **這張表的「站內範本」欄只列經過逐行查核、確認輸出真的由輸入算出來的篇。**
> 不要拿其他篇當範本——全站曾有近半數的 demo 是把預寫敘事播一遍的播放器（見 §0.2 鐵律 4 的假 demo 判準），
> 照著抄只會複製那個錯誤。每一格括號裡註明的就是「它真的算了什麼」，那是你該對齊的水準。
>
> 範本示範的是**計算深度**，不是程式結構：表中多數篇早於 §0.5 的 compute／render 約定。
> 新寫或重做 demo 時，程式結構一律以 §0.5 為準。

#### 0.2 選型鐵律

**1. 必須宣告。** `drafts/<id>/content.html` 的**第一行**寫一則 HTML 註解：

```html
<!-- demo-archetype: B｜參數掃描 — 讀者可拖動每個事件的 event-time 與 watermark 延遲，
     即時觀察視窗歸屬、遲到判定與側輸出的變化。選 B 是因為本篇的核心是「參數如何改變判定」。 -->
```

註解需包含：**archetype 代號 + 一句話說明使用者能操作什麼 + 為何這個形式最適合這個概念**。

代號一律寫成「`X｜名稱`」（全形 `｜`，工具靠它抓代號）。一篇有主、次 demo 時依序列出，
**第一個代號就是主 archetype**，撞形檢查只看它：

```html
<!-- demo-archetype: E｜決策器（主，第 6 節）＋B｜參數掃描（次，第 5 節） — 讀者調 acks／min.isr／RF
     與「幾台掛掉」，即時算出可否寫入、會不會遺失，並導出建議設定。選 E 是因為核心命題是一個判定問題。 -->
```

這則宣告是全站 archetype 的**唯一真相來源**，不另外維護對照表。

**2. 不得與最近 3 篇撞形。** 開工前跑：

```bash
node scripts/quality/archetype-window.js            # 列出全站發佈序 × 主 archetype，與「下一篇不可用的主 archetype」
```

寫好宣告後再跑一次閘門模式，未通過不得 generate：

```bash
node scripts/quality/archetype-window.js --topic <id>   # 尚未發佈的篇視為下一篇；只判定牽涉 <id> 的視窗
```

**若你想用的形式已在最近 3 篇出現過，換一個。**
撞形時的處理順序：先回 §0.1 找第二適合的 archetype；真的只有一種形式可行，就把 demo 拆小、換切入角度（例如同樣是 A，改成從失敗路徑倒著走）。

**3. Archetype A 是受限選項。** 只有在概念本質就是「一組固定且有順序的步驟」時才可用。
自我檢查：**如果你正在寫 `if (step === 1) ... else if (step === 5)` 的巨型 dispatch，而且每個情境各抄一份敘事——
你做的是投影片，不是模擬器。** 回到 §0.1 換一種。

選了 A 也必須是**真 A**：

- **禁止** `SCENARIOS = { normal: [frame, frame, …] }` 這類 frames 陣列；每一步的狀態必須由**讀者設定的參數 ＋ 規則函式**算出來
  （例：DNS 每一步問哪一層，由各層快取的 TTL 剩餘量決定；task 的下一個狀態，由讀者注入的事件套用轉移表決定）。
- compute 函式簽名建議 `computeX(params, step)` 或回傳整條 `timeline[]`；`@probe sweep` 要把 `step`（或 `tick`）也列為參數。
- 每一步的說明句可以由狀態拼出（模板 ＋ 算出來的數字），不得是預寫的整段文案。

**4. 至少三個算出來的輸出。** 使用者的操作必須改變**計算結果**，而不是切換到另一段預先寫好的旁白。
門檻訂在三個，是因為一個太容易用「總步數」「計數器 +1」這類無教學意義的算術交差；
§0.5 的 L2 閘門會機械檢查這一條。

> **假 demo 判準**：把所有情境的輸出字串列出來。如果它們全部都是程式碼裡的字面常數，
> 這個 demo 就是一台播放器，不是模擬器。
>
> 「算出來」指**由使用者的輸入經過運算推導**。以下**不算**：從預寫的 `SC = { normal: {...}, crash: {...} }`
> 取出對應文案；`step` 遞增、`total` 常數、印出陣列長度；只換了顏色 class、數字沒換。

#### 0.3 一篇可以有多個小 demo

結構參考標的 `drafts/distributed-transactions-handbook` 有 **6 個 demo、6 種不同 archetype**（光譜、流程、時序實驗室、補償鏈、並排對照、決策器）。

- **兩三個各司其職的小 demo，遠優於一個塞滿多層 `.seg` 的巨型 demo。**
- 經驗法則：**若單一 demo 需要 3 組以上 `.seg` 才講得完，那是在提示你該拆成 2 個 demo。**
  注意這條規則的單位是**單一 demo**：一頁有 6 個 demo、每個各 1 組 `.seg`，完全合規。
- 小 demo 可以就近放在它所解釋的那個章節，不必全部堆到文末。

> 借它的**結構**（拆小、各司其職、就近擺放），不要以為它每個 demo 的深度都夠：
> 6 個之中只有「補償鏈」與「決策器」兩個有真自由度，另外 4 個的輸出仍是字面常數。
> 結構對了還要過 §0.2 鐵律 4。

#### 0.4 非必備 chrome — 不要因為「上一篇有」就加

以下三者**不是**本規範的元件，是某幾篇的偶然產物。除非該 archetype 真的需要，否則**不得預設加入**：

| 元素 | 只在什麼情況下才加 |
| :--- | :--- |
| `.X-metric`「步 N / M」進度計數列 | 僅 archetype A，且步數對讀者真的有意義時 |
| `.X-verdict` 結論判定條 | 僅當同一組操作真的會導出不同**結論**（C / E）時 |
| `.X-wire` 事件日誌捲軸 | 僅當「訊息往返順序」本身就是教學重點時 |

> **三者同時出現 = 進度條 + 旁白 + 字幕捲軸 = 播放器。** 這正是本專案要避免的觀感。

#### 0.5 compute／render 分離與 `@probe`（必填）

本專案禁止以瀏覽器做 demo 驗收，因此 demo 的計算必須能在**沒有 DOM** 的環境下被機械驗證。
`script.html` 的 IIFE 內**依序**排列五段：

```js
<script>
(function () {
  "use strict";

  /* (1) 常數與參數表 */
  var MAX_CONN = 60000;

  /* (2) compute* 純函式 —— 不得出現 document / getElementById / innerHTML / classList / addEventListener */
  // @probe fn       computeDrain
  // @probe baseline {"nodes":4,"batchSize":1,"budgetSec":30,"jitterPct":20}
  // @probe sweep    {"nodes":[2,16],"batchSize":[1,8],"budgetSec":[5,300],"jitterPct":[0,100]}
  function computeDrain(p) {
    /* 只吃 p、只回傳物件。所有教學上重要的數字都在這裡算出來。 */
    return { perNode: …, waves: …, reconnectPeak: …, skew: [...], safe: … };
  }

  /* (3) DOM 參照 */
  /* (4) render(state) —— 只讀 state 畫出來，不做任何判斷 */
  /* (5) 事件綁定 */
})();
</script>
```

每個 compute 進入點上方的**三行 `@probe` 註解是必填的**（一頁多個 demo 就寫多組）：

| 指令 | 意義 |
| :--- | :--- |
| `@probe fn <name>` | 斷言的進入點函式名 |
| `@probe baseline {...}` | 一組預設參數（JSON 單行） |
| `@probe sweep {...}` | 每個參數要被推到的兩端值（JSON 單行，值為陣列） |

L2 閘門會在完全沒有 `document` 的 vm sandbox 裡求值 (1)+(2)，逐一把 sweep 的每個參數推到兩端、比對輸出。
判定標準：**每個參數都必須至少改變一個輸出，且會變動的輸出總數 ≥ 3**。
所以 (2) 不能依賴 (3) 之後才宣告的任何變數，也不能碰 DOM——碰了會直接 ReferenceError。

> 這是**架構約定，不是 UI 骨架**，不違反「禁止複製上一篇 demo 骨架」：
> 互動模型與畫面仍須為每一篇從頭設計，只是把「算」和「畫」分開放。

#### 0.6 Demo 品質閘門（generate 之前必過）

```bash
node scripts/quality/demo-audit.js <id>             # L1：11 項機械檢查（宣告、.seg、三件組、舊骨架、語法、id 綁定、cap…）
node scripts/quality/compute-probe.js <id>          # L2：依 @probe 證明它是模擬器而非播放器
node scripts/quality/archetype-window.js --topic <id>   # 撞形檢查（§0.2 鐵律 2）
```

三者皆 exit 0 才可 generate。L1 的第 6 項（id 綁定）與第 9 項（cap）是啟發式：
動態組出 id 再 `getElementById` 會被誤報為死控制項、cap 位置判斷只看容器後 4000 字。
逐一確認屬誤報後可放行，並在回報中註明。

早於本約定的舊篇會在 L1 第 11 項或 L2 失敗，清單登錄於 `docs/tech-debt.md`；
**只改論述、不動 demo** 的修訂不受這些既有失敗阻擋，動到 demo 就必須讓它通過。

---

### 1. 模擬器外殼 (`.demo`)

每一個模擬器必須使用 `.demo` 外殼包裹，它自帶一條漂亮的標題列，左右分立標題與操作說明。

```html
<div class="demo" id="demo-hash-ring">
  <div class="demo-bar">
    <span class="label">互動 · 一致性雜湊環</span>
    <span class="label" style="text-transform:none;font-family:var(--sans);font-size:12px;color:var(--text-2)">點選節點或按鈕，觀看動態路由</span>
  </div>
  <div class="demo-body">
    <!-- 控制面板與模擬畫布置於此處 -->
  </div>
</div>
```

### 2. 模式/情境分段切換器 (`.seg`)

藥丸造型的情境切換器（非 Tab 頁，而是互動選項）。點選時利用 Vanilla JS 動態更新 `aria-pressed="true|false"`。

```html
<div class="seg" role="group" aria-label="情境切換">
  <button data-sc="normal" aria-pressed="true">正常提交</button>
  <button data-sc="crash" aria-pressed="false">協調者掛掉</button>
</div>
```

> **用量上限**：單一 demo 內 `.seg` 群組建議 **≤ 2 組**。
> 需要 3 組以上才講得完，代表這個 demo 承載了太多主題——請依 §0.3 拆成兩個 demo，
> 而不是繼續往上疊切換器。切換器疊越多層，讀者越難知道自己正在看什麼組合。

### 3. 按鈕系列 (`.btn` / `.btn.primary`)

- **`.btn`**：一般操作按鈕（如：重置、重來）。
- **`.btn.primary`**：核心操作按鈕（如：下一步、執行）。採用品牌主藍底白字，hover 時底色漸變。

```html
<button class="btn primary" id="btn-next">下一步</button>
<button class="btn" id="btn-reset">重置</button>
```

### 4. 互動狀態日誌面板 (`.status-line`)

用來顯示多步驟模擬的當前行為、日誌輸出或邏輯判定結果。

```html
<div class="status-line" id="demo-status">
  按「下一步」開始走兩階段流程。
</div>
```

### 5. 狀態色圖例 (`.legend` 與 `.dot`)

讓讀者能清晰辨識模擬畫布或狀態節點的語意。狀態點大小為 9x9px 圓角正方形。

```html
<div class="legend">
  <span><i class="dot ns-idle"></i>待命</span>
  <span><i class="dot ns-lock"></i>已鎖定</span>
  <span><i class="dot ns-ok"></i>已提交</span>
  <span><i class="dot ns-bad"></i>阻塞 / 異常</span>
</div>
```

#### 圖例狀態對應 Class：
- **`.ns-idle`**：白色底、淡灰框。代表初始、閒置、無鎖。
- **`.ns-lock`**：淡橘底、橘黃框。代表 Try、Prepare、資源已凍結、暫存鎖定。
- **`.ns-ok`** : 淡綠底、深綠框。代表 Confirm、Commit、執行成功。
- **`.ns-bad`**：淡紅底、紅色框。代表 Cancel、Rollback、異常、失敗、超時。
- **`.ns-wait`**：淡藍底、主色藍框。代表 Pending、網路傳輸中、等待指令。

---

## 🚫 嚴格禁止的作法

### 視覺與結構

1. **禁止引入大型前端框架 (React/Vue/Svelte)** 到頁面中。
2. **禁止使用與 Notion-like 風格衝突的高對比度配色**（例如純綠 `#00ff00`、純紅 `#ff0000`）。
3. **絕對不要從零撰寫完整的 HTML 外殼**（例如 header、footer 等），這些會由 `generate.js` 基於 `templates/base.html` 自動組裝。
4. **禁止在寫代碼前不思考結構**：每次產出 `content.html` 必須精準對齊 `<section id="sX">` 與雙欄 TOC 機制。

### 圖表

5. **禁止用 `.tag` / `.legend` / `.seg` 的藥丸樣式冒充圖表節點。**
6. **禁止同一個 class 同時承載「節點」與「邊」**（只靠虛線或灰字區分不算區分）。
7. **禁止超過 6 個節點的 `flex-wrap` 橫排**；時序語意一律不得用 chip row 表達。
8. **禁止無 `<p class="cap">` 的圖表。**

### 互動 Demo

9. **禁止未宣告 archetype 就動手寫 demo**（`content.html` 第一行的 `<!-- demo-archetype: ... -->` 註解為必填）。
10. **禁止與最近 3 篇使用相同的 archetype。**
11. **禁止「腳本重播型」demo**——整個 demo 的輸出全是程式碼裡的字面常數、使用者操作只是切換播放哪一段預寫敘事。至少要有三個輸出是**算出來的**（§0.2 鐵律 4）。
12. **禁止複製上一篇的 demo 骨架再改 class 前綴。** Demo 的 CSS/JS 骨架**不是**共享資產（與圖表 CSS 相反）；每篇的互動模型必須從 §0 重新選型。
13. **禁止把 `.X-metric`（步 N/M）、`.X-verdict`、`.X-wire` 當成必備 chrome**；三者同時出現即為「播放器」，見 §0.4。
14. **禁止缺 `@probe` 或未過 §0.6 品質閘門就 generate。**

### 內容

15. **禁止編號式跨篇引用**：手冊是單篇閱讀的，讀者不會記得發佈順序。不得寫「前一篇」「第一篇」「篇 3」「第 5 篇的 s8」「（s7 選型階梯）」；
    一律用**短稱＋內容描述**，例如「WebSocket 篇談保活的那一節」「TCP/UDP 篇那張 backpressure 策略表」。
    本篇內的章節自引用寫「第 N 節」（頁面章節有可見編號）並視空間補短標題；「上一篇／下一篇」只有同一句已點名目標時才可保留。
    demo 的旁白字串也是讀者可見文字，同樣適用。
