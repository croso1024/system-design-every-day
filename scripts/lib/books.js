'use strict';

/**
 * books.js — completed.json 與手冊首頁 books/index.html 的共用邏輯。
 * 由 generate.js (發佈) 與 remove-completed.js (撤回) 共用，使首頁渲染只有單一真相。
 * 純計算 (build 系列) 與落檔 (save / write 系列) 拆開，便於呼叫端先算後寫、必要時回滾。
 *
 * 首頁知識地圖：payload v2 由 mindmap.js `buildLearningMapData` 產生（排版在產頁時算好），
 * 畫面由 lib/home-map-render.js 伺服器端輸出，前端 templates/home-learning-map.js 只做選取互動。
 * 零第三方依賴（不載入 Tailwind，也沒有圖形引擎 CDN）；手機寬度改顯示伺服器端分組清單，故不需要 <noscript> 後備。
 * 設計 token（:root）在產頁時從 templates/base.html 抽出（extractRootTokens），首頁與文章頁共用同一份真相；
 * 首頁殼層與地圖 CSS 只能用這些 token 或 .learning-map 內命名過的 --lm-* 顏色，不得寫 raw hex。
 */

const fs = require('fs');
const path = require('path');
const { buildLearningMapData } = require('../mindmap');
const { renderLearningMapSection } = require('./home-map-render');
const { writeJSONAtomic, writeFileAtomic } = require('./atomic');

const ROOT = path.resolve(__dirname, '..', '..');
const COMPLETED_PATH = path.join(ROOT, 'docs', 'completed.json');
const BOOKS_INDEX_PATH = path.join(ROOT, 'books', 'index.html');
const BASE_TEMPLATE_PATH = path.join(ROOT, 'templates', 'base.html');
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
 * 從 templates/base.html 抽出第一個 `:root { … }` token 區塊（單一真相來源），供首頁 <style> 使用。
 * base.html 改了 token，reindex 後首頁自動跟上；找不到區塊時 throw，讓呼叫端零副作用中止。
 * 換行統一為 LF，避免 base.html 的 CRLF 混進首頁產物。
 */
function extractRootTokens(baseHtml) {
  const match = String(baseHtml).match(/:root\s*\{[^}]*\}/);
  if (!match) {
    throw new Error('templates/base.html 找不到 :root { … } token 區塊，無法組出首頁');
  }
  return `    ${match[0].replace(/\r\n/g, '\n')}`;
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
  const rootTokens = extractRootTokens(readTemplate(BASE_TEMPLATE_PATH, 'base.html'));

  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Design Every Day | 系統設計學習手冊</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
${rootTokens}
    /* 首頁不載入 Tailwind。以下是等價於其 preflight 的最小重置，讓地圖樣式的基準與改版前一致。 */
    *, *::before, *::after { box-sizing: border-box; border: 0 solid currentColor; }
    html { line-height: 1.5; -webkit-text-size-adjust: 100%; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--text); font-family: var(--sans); }
    h1, h2, h3, h4 { margin: 0; font-size: inherit; font-weight: inherit; }
    p { margin: 0; }
    a { color: inherit; text-decoration: inherit; }
    ol, ul { list-style: none; margin: 0; padding: 0; }
    button { margin: 0; padding: 0; font: inherit; color: inherit; background: transparent; cursor: pointer; }
    svg { display: block; vertical-align: middle; }
    summary { display: list-item; }
    /* 首頁殼層：顏色、字體一律取自上方 token。 */
    .page-wrap { max-width: 1760px; margin: 0 auto; padding-left: 24px; padding-right: 24px; }
    .site-header { border-bottom: 1px solid var(--border); background: var(--bg-soft); }
    .site-header > .page-wrap, .site-main, .site-footer { padding-top: 48px; padding-bottom: 48px; }
    .site-kicker { font-family: var(--mono); font-size: 12px; line-height: 16px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--text-3); }
    .site-title { margin-top: 12px; font-size: 36px; line-height: 40px; font-weight: 700; letter-spacing: -0.025em; color: var(--text); }
    .site-lede { margin-top: 16px; max-width: 42rem; font-weight: 300; line-height: 1.625; color: var(--text-2); }
    .site-meta { margin-top: 12px; font-family: var(--mono); font-size: 12px; line-height: 16px; color: var(--text-3); }
    .site-meta a { text-underline-offset: 2px; }
    .site-meta a:hover { color: var(--text-2); text-decoration: underline; }
    .site-footer { border-top: 1px solid var(--border); text-align: center; font-family: var(--mono); font-size: 12px; line-height: 16px; color: var(--text-3); }
${learningMapCss}
  </style>
</head>
<body>
  <header class="site-header">
    <div class="page-wrap">
      <p class="site-kicker">Learning Handbook</p>
      <h1 class="site-title">System Design Every Day</h1>
      <p class="site-lede">
        每日自動更新的 System Design 學習手冊。每篇指南皆包含概念說明、System Design 脈絡、架構圖與可互動的演算法/系統行為演示。
      </p>
      <!-- BUILD_META -->
    </div>
  </header>

  <main class="site-main page-wrap">
    ${learningMapHtml}
  </main>

  <footer class="site-footer">
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
  extractRootTokens,
  buildBooksIndexHtml,
  writeBooksIndex,
};
