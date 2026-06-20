# Style Guide

本文件定義 System Design Every Day 手冊的視覺與互動元件風格。Agent 在產出每一篇主題內容前，應先閱讀並遵循本指南。

## 設計原則

- **一致性優先，但不強求完全相同**：各主題的互動元件可獨立實作，但外觀與互動反饋應大致遵循同一套規範。
- **Self-contained 互動元件**：每個主題頁面的 HTML 與 JS 應自包含，避免跨頁面共用複雜元件邏輯。
- **可讀性優先**：內容區以深色主題為主，確保長文閱讀與互動元件並存時仍清晰。

## 色彩系統

| 用途 | Tailwind 類別 | 說明 |
|------|---------------|------|
| 頁面背景 | `bg-slate-950` | 全站主背景 |
| 內容卡片 | `bg-slate-900` | 一般區塊容器 |
| 互動面板 | `bg-slate-800` | 模擬器、控制面板 |
| 邊框 | `border-slate-700` | 卡片與面板邊框 |
| 主文字 | `text-slate-100` | 標題與正文 |
| 次要文字 | `text-slate-400` | 說明、輔助資訊 |
| 主色按鈕 | `bg-indigo-600 hover:bg-indigo-700` | 主要操作 |
| 成功 / 正向 | `bg-emerald-600 hover:bg-emerald-700` | 成功、新增、啟用 |
| 警告 / 危險 | `bg-rose-600 hover:bg-rose-700` | 刪除、重置、錯誤 |
| 日誌 / 終端機 | `bg-black text-green-400 font-mono text-xs` | 模擬輸出 |

## 排版

- 內容區使用 `prose prose-invert max-w-none` 包裹 Markdown 轉換後的 HTML。
- 標題層級：`h1` 用於主題名稱，`h2` 用於章節，`h3` 用於互動區塊標題。
- 區塊間距：主要區塊使用 `my-8`；互動面板內元素使用 `mb-4`。
- 圓角：卡片與面板統一使用 `rounded-xl`；按鈕使用 `rounded-lg`。

## 按鈕

```html
<button class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition">
  Primary Action
</button>
```

- 所有可點擊元素應有 `transition` 與 hover 狀態。
- 同一互動區塊內，按鈕尺寸與間距應一致（建議 `flex gap-4`）。

## 卡片與互動面板

```html
<div class="my-8 p-6 bg-slate-800 rounded-xl border border-slate-700">
  <h3 class="text-white mb-4">Interactive Demo</h3>
  <!-- controls and canvas -->
</div>
```

- 模擬畫布建議使用 `bg-slate-900 rounded-lg border border-slate-800`。
- 控制項（input、select、range）應放在面板頂部，結果展示區放在下方。

## 圖表與架構圖

- **Mermaid**：用於靜態架構圖、序列圖、狀態圖。使用 ` ```mermaid ` 區塊，由範本統一載入 Mermaid.js 渲染。
- **Canvas / SVG**：用於需要動態更新的互動式圖（例如 hash ring、load balancer 流量）。
- **圖片**：優先使用 SVG 或專案內相對路徑；若需外部資源，應使用穩定的 CDN 或 Repo 內靜態檔。

## 互動元件實作建議

- 使用 Vanilla JS，必要時可在單頁引入輕量 CDN（如 D3.js、Chart.js）。
- 狀態與 DOM 更新邏輯寫在頁面底部 `<script>` 中，或透過 `<!-- SCRIPT_PLACEHOLDER -->` 注入。
- 提供基本的使用說明文字，讓讀者知道如何操作。
- 若有多步驟流程，建議加入簡短 log 區塊顯示系統行為。

## 命名與結構

- 互動元件容器 id 使用 kebab-case，例如 `hash-ring-canvas`、`log-console`。
- 避免使用全域變數污染；必要時使用 IIFE 或模組化函式。

## 不建議的做法

- 不要引入大型前端框架（React/Vue）到單頁內容中。
- 不要硬抽共用 JS 元件庫，除非未來有明確維護需求。
- 不要使用與上述色彩系統衝突的高飽和隨機配色。
