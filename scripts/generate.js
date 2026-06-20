#!/usr/bin/env node

/**
 * Assemble a topic page from templates/base.html and draft content files.
 *
 * Usage:
 *   node scripts/generate.js --topic <topic-id> --title "Topic Title"
 *
 * Draft files (created by Agent before running this script):
 *   drafts/<topic-id>/content.html   - HTML body content (injected into CONTENT_PLACEHOLDER)
 *   drafts/<topic-id>/script.html    - Optional extra scripts (injected into SCRIPT_PLACEHOLDER)
 *
 * Output:
 *   books/<topic-id>/index.html
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'base.html');
const COMPLETED_PATH = path.join(ROOT, 'docs', 'completed.json');
const BOOKS_INDEX_PATH = path.join(ROOT, 'books', 'index.html');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function readFileOrDefault(filePath, fallback = '') {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadCompleted() {
  if (!fs.existsSync(COMPLETED_PATH)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(COMPLETED_PATH, 'utf8'));
}

function saveCompleted(entries) {
  fs.writeFileSync(COMPLETED_PATH, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
}

function upsertCompletedEntry(entry) {
  const completed = loadCompleted();
  const index = completed.findIndex((item) => item.id === entry.id);
  if (index >= 0) {
    completed[index] = { ...completed[index], ...entry };
  } else {
    completed.push(entry);
  }
  completed.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
  saveCompleted(completed);
  return completed;
}

function renderBooksIndex(completed) {
  const cards = completed.length
    ? completed
        .map(
          (item) => `
        <a href="${item.path.replace(/^books\//, '')}" class="block rounded-xl border border-slate-800 bg-slate-900 p-5 transition hover:border-indigo-500 hover:bg-slate-800">
          <p class="text-xs uppercase tracking-wide text-indigo-300">${escapeHtml(item.category || 'General')}</p>
          <h2 class="mt-2 text-lg font-semibold text-white">${escapeHtml(item.title)}</h2>
          <p class="mt-2 text-sm text-slate-400">Completed: ${escapeHtml(item.completed_at || 'N/A')}</p>
        </a>`
        )
        .join('\n')
    : `
        <div class="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-8 text-center text-slate-400">
          尚無已完成的主題。Agent 完成第一篇後，目錄會自動更新。
        </div>`;

  const html = `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>System Design Every Day</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="min-h-screen bg-slate-950 text-slate-100">
  <header class="border-b border-slate-800">
    <div class="mx-auto max-w-6xl px-6 py-10">
      <p class="text-sm uppercase tracking-[0.2em] text-indigo-300">Learning Handbook</p>
      <h1 class="mt-3 text-4xl font-bold text-white">System Design Every Day</h1>
      <p class="mt-4 max-w-3xl text-slate-400">
        每日自動更新的 System Design 學習手冊。每篇指南包含概念說明、架構圖與互動式演示。
      </p>
    </div>
  </header>

  <main class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl font-semibold text-white">已完成主題</h2>
      <span class="text-sm text-slate-400">${completed.length} topic(s)</span>
    </div>
    <div class="grid gap-4 md:grid-cols-2">
      ${cards}
    </div>
  </main>

  <footer class="border-t border-slate-800 py-8 text-center text-sm text-slate-500">
    <p>Generated from docs/completed.json</p>
  </footer>
</body>
</html>`;

  ensureDir(path.dirname(BOOKS_INDEX_PATH));
  fs.writeFileSync(BOOKS_INDEX_PATH, html, 'utf8');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function main() {
  const args = parseArgs(process.argv);
  const topicId = args.topic;
  const title = args.title;
  const category = args.category || 'General';

  if (!topicId || !title) {
    console.error('Usage: node scripts/generate.js --topic <topic-id> --title "Topic Title" [--category "Category"]');
    process.exit(1);
  }

  const draftDir = path.join(ROOT, 'drafts', topicId);
  const contentPath = path.join(draftDir, 'content.html');
  const scriptPath = path.join(draftDir, 'script.html');
  const outputDir = path.join(ROOT, 'books', topicId);
  const outputPath = path.join(outputDir, 'index.html');
  const relativeOutputPath = path.posix.join('books', topicId, 'index.html');

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`Template not found: ${TEMPLATE_PATH}`);
    process.exit(1);
  }

  if (!fs.existsSync(contentPath)) {
    console.error(`Draft content not found: ${contentPath}`);
    console.error('Create drafts/<topic-id>/content.html before running generate.js');
    process.exit(1);
  }

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  const content = readFileOrDefault(contentPath);
  const script = readFileOrDefault(scriptPath);

  const html = template
    .replace('<!-- TITLE_PLACEHOLDER -->', escapeHtml(title))
    .replace('<!-- CONTENT_PLACEHOLDER -->', content)
    .replace('<!-- SCRIPT_PLACEHOLDER -->', script ? `\n${script}\n` : '');

  ensureDir(outputDir);
  fs.writeFileSync(outputPath, html, 'utf8');

  const completedAt = new Date().toISOString().slice(0, 10);
  const completed = upsertCompletedEntry({
    id: topicId,
    title,
    category,
    completed_at: completedAt,
    path: relativeOutputPath
  });

  renderBooksIndex(completed);

  console.log(`Generated: ${relativeOutputPath}`);
  console.log(`Updated: docs/completed.json`);
  console.log(`Updated: books/index.html`);
}

main();
