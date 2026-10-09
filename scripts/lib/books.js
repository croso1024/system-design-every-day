'use strict';

/**
 * books.js — completed.json 與手冊首頁 books/index.html 的共用邏輯。
 * 由 generate.js (發佈) 與 remove-completed.js (撤回) 共用，使首頁渲染只有單一真相。
 * 純計算 (build 系列) 與落檔 (save / write 系列) 拆開，便於呼叫端先算後寫、必要時回滾。
 *
 * 首頁知識地圖：payload v2 由 mindmap.js `buildLearningMapData` 產生（排版在產頁時算好），
 * 畫面由 lib/home-map-render.js 伺服器端輸出，前端 templates/home-learning-map.js 只做選取互動。
 * 零第三方依賴（無圖形引擎 CDN）；手機寬度改顯示伺服器端分組清單，故不需要 <noscript> 後備。
 */

const fs = require('fs');
const path = require('path');
const { buildLearningMapData } = require('../mindmap');
const { renderLearningMapSection } = require('./home-map-render');
const { writeJSONAtomic, writeFileAtomic } = require('./atomic');

const ROOT = path.resolve(__dirname, '..', '..');
const COMPLETED_PATH = path.join(ROOT, 'docs', 'completed.json');
const BOOKS_INDEX_PATH = path.join(ROOT, 'books', 'index.html');
const HOME_MAP_CSS_PATH = path.join(ROOT, 'templates', 'home-learning-map.css');
const HOME_MAP_JS_PATH = path.join(ROOT, 'templates', 'home-learning-map.js');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape JSON for safe embedding inside <script type="application/json">.
 * Prevents </script> breakout and HTML entity surprises.
 */
function escapeJsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function loadCompleted() {
  if (!fs.existsSync(COMPLETED_PATH)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(COMPLETED_PATH, 'utf8'));
  } catch (e) {
    throw new Error(`docs/completed.json 解析失敗（檔案可能損壞）：${e.message}`);
  }
}

function saveCompleted(entries) {
  writeJSONAtomic(COMPLETED_PATH, entries);
}

function upsertCompleted(completed, entry) {
  const next = completed.slice();
  const index = next.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    next[index] = { ...next[index], ...entry };
  } else {
    next.push(entry);
  }
  next.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
  return next;
}

function readTemplate(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`缺少首頁 Learning Map 模板：${label}（${filePath}）`);
  }
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * 組出完整首頁 HTML（純計算，不落檔）。
 * 傳入 in-memory completed，讓 payload 與 ledger 同源（勿讓 builder 自行讀磁碟，
 * 否則會在「尚未 saveCompleted」的呼叫端出現節點落後的 off-by-one bug）。
 * payload 建構（登記表、分類層成環、edge 穿卡）失敗時 throw，呼叫端在寫任何檔案之前即中止。
 */
function buildBooksIndexHtml(completed) {
  const learningMapData = buildLearningMapData(completed);
  const learningMapJson = escapeJsonForScript(learningMapData);
  const learningMapHtml = renderLearningMapSection(learningMapData);
  // 內嵌進 <style> / <script> 前，硬化可能提前關閉標籤的序列（`</style>` / `</script>`）。
  // 目前兩個模板檔皆不含這些序列，此為 defense-in-depth，保護未來對模板的編輯不致破頁；
  // 反斜線在 CSS / JS 字串語境中皆為透明轉義（`<\/style` 等價 `</style`），故對合法內容無副作用。
  const learningMapCss = readTemplate(HOME_MAP_CSS_PATH, 'home-learning-map.css').replace(/<\/(style)/gi, '<\\/$1');
  const learningMapJs = readTemplate(HOME_MAP_JS_PATH, 'home-learning-map.js').replace(/<\/(script)/gi, '<\\/$1');

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Design Every Day | 系統設計學習手冊</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {
      --bg: #ffffff;
      --bg-soft: #fafaf9;
      --text: #262a2f;
      --text-2: #6b7078;
      --text-3: #9aa0a8;
      --border: #ecebe8;
      --border-strong: #dedcd8;
      --code-bg: #f6f5f3;
      --accent: #3f6188;
      --accent-soft: #eef2f7;
      --accent-line: #cdd9e6;
      --ok: #4d7d68;
      --ok-soft: #eef4f1;
      --warn: #a3743e;
      --warn-soft: #f6f0e7;
      --bad: #a8554f;
      --bad-soft: #f6ecea;
      --radius: 10px;
      --radius-sm: 7px;
      --sans: "Noto Sans TC", system-ui, -apple-system, "Segoe UI", sans-serif;
      --mono: "JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
    }
    .page-wrap {
      max-width: 1760px;
      margin: 0 auto;
      padding-left: 24px;
      padding-right: 24px;
    }
${learningMapCss}
  </style>
</head>
<body class="min-h-screen">
  <header class="border-b border-stone-200 bg-stone-50/50 backdrop-blur">
    <div class="page-wrap py-12">
      <p class="font-mono text-xs uppercase tracking-[0.2em] text-stone-400">Learning Handbook</p>
      <h1 class="mt-3 text-4xl font-bold tracking-tight text-stone-800">System Design Every Day</h1>
      <p class="mt-4 max-w-2xl text-stone-500 font-light leading-relaxed">
        每日自動更新的 System Design 學習手冊。每篇指南皆包含概念說明、System Design 脈絡、架構圖與可互動的演算法/系統行為演示。
      </p>
      <!-- BUILD_META -->
    </div>
  </header>

  <main class="page-wrap py-12">
    ${learningMapHtml}
  </main>

  <footer class="border-t border-stone-100 py-12 text-center text-xs text-stone-400 font-mono">
    <p>Generated with 🤍 by System Design Every Day</p>
  </footer>

  <script id="learning-map-data" type="application/json">${learningMapJson}</script>
  <script>
${learningMapJs}
  </script>
</body>
</html>`;
}

function writeBooksIndex(html) {
  ensureDir(path.dirname(BOOKS_INDEX_PATH));
  writeFileAtomic(BOOKS_INDEX_PATH, html);
}

module.exports = {
  ROOT,
  COMPLETED_PATH,
  BOOKS_INDEX_PATH,
  ensureDir,
  escapeHtml,
  escapeJsonForScript,
  loadCompleted,
  saveCompleted,
  upsertCompleted,
  buildBooksIndexHtml,
  writeBooksIndex,
};
