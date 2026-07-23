'use strict';

/**
 * books.js — completed.json 與手冊首頁 books/index.html 的共用邏輯。
 * 由 generate.js (發佈) 與 remove-completed.js (撤回) 共用，使首頁渲染只有單一真相。
 * 純計算 (build 系列) 與落檔 (save / write 系列) 拆開，便於呼叫端先算後寫、必要時回滾。
 */

const fs = require('fs');
const path = require('path');
const { buildLearningMapData } = require('../mindmap');
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

const RECENT_COMPLETED_LIMIT = 5;

/**
 * Server-rendered 後備清單：已完成文章的純 HTML `<a>` 連結。
 * 預設隱藏（.lm-hidden）；僅在 JS 停用（<noscript> 覆寫）或 Cytoscape / boot 失敗（前端解除隱藏）時顯示。
 * 目的：即使第三方 CDN 或 client-side JS 失效，讀者仍能導覽文章，且連結存在於 HTML 原始碼（利於爬蟲）。
 */
function buildFallbackListHtml(completed) {
  if (!completed.length) {
    return '<p class="lm-fallback-empty">尚無已完成主題。Agent 完成第一篇後，這裡會列出可閱讀的文章。</p>';
  }
  const rows = completed
    .map((item) => {
      const href = String(item.path || '').replace(/^books\//, '');
      const title = escapeHtml(item.title || item.id);
      const category = escapeHtml(item.category || 'General');
      const date = escapeHtml(item.completed_at || 'N/A');
      const label = `<span class="lm-fallback-meta">${category} · ${date}</span>`;
      // path 理論上必存在（validate 強制），仍防禦性處理：無 path 時退回純文字，不產生指向首頁的空連結。
      const titleHtml = href
        ? `<a href="${escapeHtml(href)}">${title}</a>`
        : `<span>${title}</span>`;
      return `        <li class="lm-fallback-row">${titleHtml}${label}</li>`;
    })
    .join('\n');
  return `<ul class="lm-fallback-list">\n${rows}\n      </ul>`;
}

/**
 * 首頁 `#lm-documents` 未選取分群時的 SSR 初值：最近完成 K 篇。
 * 與 client `renderRecentCompleted` 同源規則（completed_at desc、limit 5）。
 * 「在圖上定位」按鈕由 client boot 後掛上事件；SSR 先輸出結構避免閃爍。
 */
function buildRecentCompletedListHtml(completed) {
  const recent = completed
    .filter((item) => item && item.path)
    .slice()
    .sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''))
    .slice(0, RECENT_COMPLETED_LIMIT);

  if (!recent.length) {
    return '            <p class="lm-documents-hint">尚無已完成主題。</p>';
  }

  const rows = recent.map((item) => {
    const href = String(item.path || '').replace(/^books\//, '');
    const title = escapeHtml(item.title || item.id);
    const category = escapeHtml(item.category || 'General');
    const date = escapeHtml(item.completed_at || 'N/A');
    const safeHref = escapeHtml(href);
    return [
      '            <li class="lm-document-row">',
      '              <div class="lm-document-title">',
      `                <a href="${safeHref}" data-completed-link="${safeHref}" aria-label="閱讀已完成文件：${title}">${title}</a>`,
      '              </div>',
      `              <div class="lm-document-meta">${category} · 發佈日期：${date}</div>`,
      `              <button type="button" class="lm-locate-button" aria-label="在學習圖譜上選取 ${title}">在圖上定位</button>`,
      '            </li>'
    ].join('\n');
  }).join('\n');

  return `            <ul class="lm-document-list">\n${rows}\n            </ul>`;
}

function buildBooksIndexHtml(completed) {
  // 傳入 in-memory completed，讓 graph payload 與 ledger 同源（勿讓 builder 自行讀磁碟，
  // 否則會在「尚未 saveCompleted」的呼叫端出現節點落後的 off-by-one bug）。
  const learningMapData = buildLearningMapData(completed);
  const learningMapJson = escapeJsonForScript(learningMapData);
  // 內嵌進 <style> / <script> 前，硬化可能提前關閉標籤的序列（`</style>` / `</script>`）。
  // 目前兩個模板檔皆不含這些序列，此為 defense-in-depth，保護未來對模板的編輯不致破頁；
  // 反斜線在 CSS / JS 字串語境中皆為透明轉義（`<\/style` 等價 `</style`），故對合法內容無副作用。
  const learningMapCss = readTemplate(HOME_MAP_CSS_PATH, 'home-learning-map.css').replace(/<\/(style)/gi, '<\\/$1');
  const learningMapJs = readTemplate(HOME_MAP_JS_PATH, 'home-learning-map.js').replace(/<\/(script)/gi, '<\\/$1');
  const completedCount = completed.length;
  const fallbackListHtml = buildFallbackListHtml(completed);
  const recentCompletedListHtml = buildRecentCompletedListHtml(completed);

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
  <script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.4/cytoscape.min.js" defer></script>
  <style>
    :root {
      --bg: #ffffff;
      --bg-soft: #fafaf9;
      --text: #262a2f;
      --text-2: #6b7078;
      --text-3: #9aa0a8;
      --border: #ecebe8;
      --border-strong: #dedcd8;
      --accent: #3f6188;
      --accent-soft: #eef2f7;
      --sans: "Noto Sans TC", system-ui, -apple-system, sans-serif;
      --mono: "JetBrains Mono", monospace;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
    }
${learningMapCss}
  </style>
  <noscript>
    <style>
      /* JS 停用：隱藏無作用的互動控制與「載入中」狀態，改顯示 server-rendered 後備文章清單。 */
      #lm-status,
      .learning-map .lm-controls { display: none !important; }
      #lm-fallback { display: block !important; }
    </style>
  </noscript>
</head>
<body class="min-h-screen">
  <header class="border-b border-stone-200 bg-stone-50/50 backdrop-blur">
    <div class="mx-auto max-w-6xl px-6 py-12">
      <p class="font-mono text-xs uppercase tracking-[0.2em] text-stone-400">Learning Handbook</p>
      <h1 class="mt-3 text-4xl font-bold tracking-tight text-stone-800">System Design Every Day</h1>
      <p class="mt-4 max-w-2xl text-stone-500 font-light leading-relaxed">
        每日自動更新的 System Design 學習手冊。每篇指南皆包含概念說明、System Design 脈絡、架構圖與可互動的演算法/系統行為演示。
      </p>
      <!-- BUILD_META -->
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-6 py-12">
    <section class="mb-10 learning-map" aria-labelledby="learning-map-heading">
      <div class="mb-6">
        <h2 id="learning-map-heading" class="text-xl font-semibold text-stone-800">系統設計知識地圖</h2>
        <p class="text-xs text-stone-400 mt-1 font-mono">Interactive Knowledge Roadmap（點選 Category / Topic 聚焦分群並顯示群內 Topic 關聯；綠色為已完成，藍色為待學習）</p>
      </div>

      <div class="lm-controls" aria-label="學習地圖控制">
        <button id="lm-color-toggle" class="lm-button" type="button" aria-pressed="false">分群色彩：關閉</button>
        <span class="lm-control-separator" aria-hidden="true"></span>
        <button id="lm-zoom-in" class="lm-button" type="button" aria-label="放大學習地圖">放大</button>
        <button id="lm-zoom-out" class="lm-button" type="button" aria-label="縮小學習地圖">縮小</button>
        <button id="lm-fit-map" class="lm-button" type="button">適應畫布</button>
        <button id="lm-reset-map" class="lm-button" type="button">重設</button>
      </div>

      <p id="lm-status" class="lm-status" role="status" aria-live="polite">正在載入學習地圖…</p>

      <div id="lm-map-content" class="lm-map-content lm-hidden">
        <section class="lm-canvas-card" aria-label="完整學習圖譜">
          <div class="lm-map-legend" aria-label="圖例">
            <span class="lm-legend-item"><i class="lm-node-key root" aria-hidden="true"></i>Root</span>
            <span class="lm-legend-item"><i class="lm-node-key category" aria-hidden="true"></i>Category hub</span>
            <span class="lm-legend-item"><i class="lm-node-key topic" aria-hidden="true"></i>Topic satellite</span>
            <span class="lm-legend-item"><i class="lm-status-key completed" aria-hidden="true">完</i>已完成</span>
            <span class="lm-legend-item"><i class="lm-status-key pending" aria-hidden="true">待</i>待學習</span>
            <span class="lm-legend-item"><i class="lm-line-key prerequisite" aria-hidden="true"></i>Category prerequisite</span>
            <span class="lm-legend-item"><i class="lm-line-key related" aria-hidden="true"></i>Category related</span>
            <span class="lm-legend-item"><i class="lm-line-key prerequisite" aria-hidden="true"></i>Topic links（選取分群後）</span>
          </div>
          <div
            id="cy"
            role="application"
            tabindex="0"
            aria-label="完整 System Design 學習圖譜"
            aria-describedby="lm-graph-instructions"
          ></div>
          <p id="lm-graph-instructions" class="lm-visually-hidden">可用滑鼠或觸控平移、縮放及點選節點。預設視圖會顯示所有 topic 標題；僅在極端縮小時降低標題對比。鍵盤使用者可在畫布取得焦點後，以方向鍵依序選取 category 與 topic，按 Escape 清除選取。</p>
        </section>

        <section id="lm-documents" class="lm-documents" aria-labelledby="lm-documents-title">
          <div class="lm-documents-header">
            <h3 id="lm-documents-title">最近完成</h3>
            <p id="lm-documents-summary" class="lm-documents-summary"></p>
          </div>
          <div id="lm-documents-body">
${recentCompletedListHtml}
          </div>
        </section>
      </div>

      <section id="lm-fallback" class="lm-fallback lm-hidden" aria-label="已完成文章清單（後備）">
        <h3 class="lm-fallback-title">已完成文章</h3>
        <p class="lm-fallback-note">互動式學習地圖目前無法載入（可能因網路或第三方資源失敗）。以下為已完成文章的純文字清單，可直接點選閱讀。</p>
        ${fallbackListHtml}
      </section>
    </section>

    <section class="mb-4">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold text-stone-800">知識圖譜總覽</h2>
        <span class="font-mono text-xs text-stone-400 bg-stone-100 px-3 py-1 rounded-full">${completedCount} completed · ${learningMapData.topics.length} topics</span>
      </div>
      <p class="mt-2 text-sm text-stone-500">未選取分群時顯示最近完成文章；選取上方分群後，文件清單會切換為該 Category 的發佈日期或「尚未發佈」狀態。</p>
    </section>
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
