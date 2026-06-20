# Style Guide — Notion 極簡風格與互動元件設計規範

本手冊定義 System Design Every Day 專案的視覺風格與互動式演示 (Interactive Demo) 元件規範。
未來的 AI Agent 在撰寫新指南前，**必須嚴格閱讀並遵循本規範**，以確保產出與 `DistributedTransactions.html` (理想參考標的) 完美一致。

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

---

## 🎮 互動式演示 (Interactive Demo) 元件規格

高質感的互動模擬器 (Interactive Demo) 是本專案的靈魂。我們有一套極度嚴格且統一的 UI 樣式規範。

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

1. **禁止引入大型前端框架 (React/Vue/Svelte)** 到頁面中。
2. **禁止使用與 Notion-like 風格衝突的高對比度配色**（例如純綠 `#00ff00`、純紅 `#ff0000`）。
3. **絕對不要從零撰寫完整的 HTML 外殼**（例如 header、footer 等），這些會由 `generate.js` 基於 `templates/base.html` 自動組裝。
4. **禁止在寫代碼前不思考結構**：每次產出 `content.html` 必須精準對齊 `<section id="sX">` 與雙欄 TOC 機制。
