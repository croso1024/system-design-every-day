#!/usr/bin/env node

/**
 * Assemble a topic page from templates/base.html and draft content files.
 *
 * Usage:
 *   node scripts/generate.js --topic <topic-id> --title "Topic Title" [--category "Category"]
 *
 * Draft files (created by Agent before running this script):
 *   drafts/<topic-id>/content.html   - HTML body content (injected into CONTENT_PLACEHOLDER)
 *   drafts/<topic-id>/script.html    - Optional extra scripts (injected into SCRIPT_PLACEHOLDER)
 *
 * Output:
 *   books/<topic-id>/index.html      - the assembled topic page
 *   docs/completed.json              - upserted (auto-maintained, do not hand-edit)
 *   books/index.html                 - re-rendered handbook index
 *
 * 安全設計：
 *   1. 先做「TOC 結構守門」——草稿若抽不到任何合法 <section id> + <h2>，直接 exit 1
 *      且「完全不落任何檔」(零副作用)，避免把壞頁標記成已完成。
 *   2. 「先全部算好、最後集中原子寫入」：所有檔案寫入都走 temp+rename 原子寫，
 *      且 completed.json 與 books/index.html 這對互相一致的狀態具回滾保護。
 */

const fs = require('fs');
const path = require('path');
const {
  loadCompleted,
  saveCompleted,
  upsertCompleted,
  buildBooksIndexHtml,
  writeBooksIndex,
  ensureDir,
} = require('./lib/books');
const { buildTocHtml, assemblePageHtml } = require('./lib/assemble');
const { writeFileAtomic } = require('./lib/atomic');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'base.html');

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

  // ---- 守門 1：必要輸入檔存在 (純檢查，無副作用) ----
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

  // ---- 守門 2：TOC 結構 (必須在任何寫檔之前；失敗則零副作用) ----
  const tocHtml = buildTocHtml(content);
  if (!tocHtml) {
    console.error('草稿未含任何合法 <section id="..."> + <h2> 結構，左側 Auto-TOC 將完全無法渲染，拒絕發佈。');
    console.error(`請依黃金結構公式撰寫 drafts/${topicId}/content.html（見 topic-author SKILL Step 2），再重跑 generate.js。`);
    process.exit(1);
  }

  // ---- 階段一：純計算 (不落任何檔) ----
  const pageHtml = assemblePageHtml(template, { title, tocHtml, content, script });

  const completedAt = new Date().toISOString().slice(0, 10);
  const prevCompleted = loadCompleted();
  const nextCompleted = upsertCompleted(prevCompleted, {
    id: topicId,
    title,
    category,
    completed_at: completedAt,
    path: relativeOutputPath
  });
  const booksIndexHtml = buildBooksIndexHtml(nextCompleted); // generateMermaid 也在此一次算完

  // ---- 階段二：集中原子落檔 ----
  // 順序：主題頁 → completed.json → books/index.html。
  // completed.json 的 path 欄位指向主題頁，故頁必須先存在 (validate 會檢查 path 是否存在)。
  ensureDir(outputDir);
  writeFileAtomic(outputPath, pageHtml);

  saveCompleted(nextCompleted);
  try {
    writeBooksIndex(booksIndexHtml);
  } catch (e) {
    // 首頁寫入失敗 → 回滾 completed.json 至寫入前，避免「completed 已記錄但首頁未同步」。
    // 主題頁留存為無害孤兒 (validate 不檢查孤兒)，重跑 generate.js 即可修正。
    saveCompleted(prevCompleted);
    console.error(`寫入 books/index.html 失敗，已回滾 docs/completed.json：${e.message}`);
    process.exit(1);
  }

  console.log(`Generated: ${relativeOutputPath}`);
  console.log(`Updated: docs/completed.json`);
  console.log(`Updated: books/index.html`);
}

main();
