'use strict';

/**
 * books.js — completed.json 與手冊首頁 books/index.html 的共用邏輯。
 * 由 generate.js (發佈) 與 remove-completed.js (撤回) 共用，使首頁渲染只有單一真相。
 * 純計算 (build 系列) 與落檔 (save / write 系列) 拆開，便於呼叫端先算後寫、必要時回滾。
 */

const fs = require('fs');
const path = require('path');
const { generateMermaid } = require('../mindmap');
const { writeJSONAtomic, writeFileAtomic } = require('./atomic');

const ROOT = path.resolve(__dirname, '..', '..');
const COMPLETED_PATH = path.join(ROOT, 'docs', 'completed.json');
const BOOKS_INDEX_PATH = path.join(ROOT, 'books', 'index.html');

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

function buildBooksIndexHtml(completed) {
  const cards = completed.length
    ? completed
        .map(
          (item) => `
        <a href="${item.path.replace(/^books\//, '')}" class="block rounded-xl border border-stone-200 bg-white p-6 transition-all duration-200 hover:border-stone-400 hover:shadow-sm">
          <p class="font-mono text-xs uppercase tracking-wider text-stone-400">${escapeHtml(item.category || 'General')}</p>
          <h3 class="mt-2 text-lg font-semibold text-stone-800 hover:text-stone-900">${escapeHtml(item.title)}</h3>
          <div class="mt-4 flex items-center justify-between text-xs text-stone-400 font-mono">
            <span>Completed: ${escapeHtml(item.completed_at || 'N/A')}</span>
            <span class="text-stone-300">Read more →</span>
          </div>
        </a>`
        )
        .join('\n')
    : `
        <div class="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-12 text-center text-stone-500 w-full sm:col-span-2">
          尚無已完成的主題。Agent 完成第一篇後，目錄會自動更新。
        </div>`;

  // 傳入 in-memory completed，讓 mermaid 節點狀態與上方卡片同源（勿讓 generateMermaid 自行讀磁碟，
  // 否則會在「尚未 saveCompleted」的呼叫端出現節點落後的 off-by-one bug）。
  const mermaidDiagram = generateMermaid(completed);

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
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: 'default',
      securityLevel: 'loose'
    });
  </script>
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
    .mermaid {
      background: var(--bg-soft);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px;
    }
  </style>
</head>
<body class="min-h-screen">
  <header class="border-b border-stone-200 bg-stone-50/50 backdrop-blur">
    <div class="mx-auto max-w-5xl px-6 py-12">
      <p class="font-mono text-xs uppercase tracking-[0.2em] text-stone-400">Learning Handbook</p>
      <h1 class="mt-3 text-4xl font-bold tracking-tight text-stone-800">System Design Every Day</h1>
      <p class="mt-4 max-w-2xl text-stone-500 font-light leading-relaxed">
        每日自動更新的 System Design 學習手冊。每篇指南皆包含概念說明、System Design 脈絡、架構圖與可互動的演算法/系統行為演示。
      </p>
    </div>
  </header>

  <main class="mx-auto max-w-5xl px-6 py-12">
    <section class="mb-14">
      <div class="mb-6">
        <h2 class="text-xl font-semibold text-stone-800">系統設計知識地圖</h2>
        <p class="text-xs text-stone-400 mt-1 font-mono">Interactive Knowledge Roadmap (綠色代表已完成可點擊閱讀，藍色代表待解鎖)</p>
      </div>
      <div class="mermaid">
${mermaidDiagram}
      </div>
    </section>

    <section>
      <div class="mb-8 flex items-center justify-between">
        <h2 class="text-xl font-semibold text-stone-800">已完成主題</h2>
        <span class="font-mono text-xs text-stone-400 bg-stone-100 px-3 py-1 rounded-full">${completed.length} topic(s)</span>
      </div>
      <div class="grid gap-6 sm:grid-cols-2">
        ${cards}
      </div>
    </section>
  </main>

  <footer class="border-t border-stone-100 py-12 text-center text-xs text-stone-400 font-mono">
    <p>Generated with 🤍 by System Design Every Day</p>
  </footer>
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
  loadCompleted,
  saveCompleted,
  upsertCompleted,
  buildBooksIndexHtml,
  writeBooksIndex,
};
