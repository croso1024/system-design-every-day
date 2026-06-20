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
const { generateMermaid } = require('./mindmap');

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

  // Dynamic compilation of the beautiful Mermaid DAG tech tree!
  const mermaidDiagram = generateMermaid();

  const html = `<!DOCTYPE html>
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
    <!-- ===================== KNOWLEDGE GRAPH (MINDMAP) ===================== -->
    <section class="mb-14">
      <div class="mb-6">
        <h2 class="text-xl font-semibold text-stone-800">系統設計知識地圖</h2>
        <p class="text-xs text-stone-400 mt-1 font-mono">Interactive Knowledge Roadmap (綠色代表已完成可點擊閱讀，藍色代表待解鎖)</p>
      </div>
      <div class="mermaid">
${mermaidDiagram}
      </div>
    </section>

    <!-- ===================== COMPLETED CARDS ===================== -->
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

/**
 * Scan content.html for sections to build dynamic TOC links
 */
function extractToc(content) {
  const sections = [];
  let match;
  // Regex matches <section id="id"> ... (optionally <span class="sec-num">num</span>) ... <h2>title</h2>
  const sectionRegex = /<section\s+id="([^"]+)"[^>]*>[\s\S]*?(?:<span\s+class="sec-num">([^<]*)<\/span>\s*)?<h2>([^<]+)<\/h2>/g;
  
  while ((match = sectionRegex.exec(content)) !== null) {
    sections.push({
      id: match[1],
      num: match[2] ? match[2].trim() : '',
      title: match[3].trim()
    });
  }
  
  if (sections.length === 0) {
    return '';
  }
  
  return sections
    .map((s) => {
      const numSpan = s.num ? `<span class="n">${escapeHtml(s.num)}</span>` : '';
      return `<a href="#${escapeHtml(s.id)}">${numSpan}${escapeHtml(s.title)}</a>`;
    })
    .join('\n        ');
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

  // Extract TOC dynamically from content.html
  const tocHtml = extractToc(content);

  const html = template
    .replace('<!-- TITLE_PLACEHOLDER -->', escapeHtml(title))
    .replace('<!-- TOC_PLACEHOLDER -->', tocHtml)
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
