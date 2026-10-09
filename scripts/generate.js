#!/usr/bin/env node

/**
 * Assemble a topic page from templates/base.html and draft content files.
 *
 * Usage:
 *   node scripts/generate.js --topic <topic-id> --title "Topic Title" [--category "Category"] [--keep-date]
 *
 *   --category   選填。主題的分類一律由 docs/mindmap.json 的節點帶出（分類的單一真相來源）；
 *                有給此旗標時必須與節點一致，否則 exit 1。主題不在 mindmap 時亦 exit 1
 *                （請先用 add-topic.js 建立節點）。兩種失敗都發生在寫任何檔案之前。
 *   --keep-date  更新既有文件時保留 completed.json 原始 completed_at（不 bump 成今天）。
 *                供 topic-reviser 修訂流程使用；新建主題請省略此旗標。
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
const MINDMAP_PATH = path.join(ROOT, 'docs', 'mindmap.json');

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

/**
 * 守門 0：主題的 category 由 mindmap 節點帶出（純檢查，無副作用）。
 * 節點不存在、或 --category 與節點不一致時回傳 null（錯誤已印出），呼叫端應 exit 1。
 */
function resolveCategoryFromMindmap(topicId, categoryArg) {
  if (!fs.existsSync(MINDMAP_PATH)) {
    console.error(`找不到 docs/mindmap.json（${MINDMAP_PATH}），無法取得主題分類。`);
    return null;
  }
  let mindmap;
  try {
    mindmap = JSON.parse(fs.readFileSync(MINDMAP_PATH, 'utf8'));
  } catch (e) {
    console.error(`docs/mindmap.json 解析失敗（檔案可能損壞）：${e.message}`);
    return null;
  }
  const nodes = Array.isArray(mindmap && mindmap.nodes) ? mindmap.nodes : [];
  const node = nodes.find((item) => item && item.id === topicId);
  if (!node) {
    console.error(`主題 "${topicId}" 不在 docs/mindmap.json 的 nodes 中，拒絕發佈（分類由 mindmap 節點帶出）。`);
    console.error('請先用 node scripts/add-topic.js 建立節點（新分類需帶 --domain），再重跑 generate.js。');
    return null;
  }
  if (typeof node.category !== 'string' || !node.category) {
    console.error(`mindmap 節點 "${topicId}" 缺少 category，請先修正 docs/mindmap.json（node scripts/validate.js 會指出問題）。`);
    return null;
  }
  if (typeof categoryArg === 'string' && categoryArg !== node.category) {
    console.error(`--category "${categoryArg}" 與 mindmap 節點 "${topicId}" 的 category "${node.category}" 不一致，拒絕發佈。`);
    console.error('請省略 --category（由 mindmap 帶出），或改用與節點相同的值；要改分類請調整 docs/mindmap.json。');
    return null;
  }
  return node.category;
}

function main() {
  const args = parseArgs(process.argv);
  const topicId = args.topic;
  const title = args.title;

  if (!topicId || !title) {
    console.error('Usage: node scripts/generate.js --topic <topic-id> --title "Topic Title" [--category "Category"] [--keep-date]');
    process.exit(1);
  }

  // ---- 守門 0：category 由 mindmap 節點帶出 (純檢查，無副作用) ----
  const category = resolveCategoryFromMindmap(topicId, args.category);
  if (category === null) {
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

  const today = new Date().toISOString().slice(0, 10);
  const prevCompleted = loadCompleted();

  // --keep-date：更新既有文件時保留原始 completed_at（更新 ≠ 重新完成），避免 upsert 把日期 bump 成今天。
  // 僅在 completed.json 已有該主題且帶 completed_at 時生效；否則（新主題）退回今天。
  let completedAt = today;
  if (args['keep-date']) {
    const existing = prevCompleted.find((item) => item.id === topicId);
    if (existing && existing.completed_at) {
      completedAt = existing.completed_at;
    } else {
      console.warn(`--keep-date：docs/completed.json 尚無 "${topicId}" 或缺 completed_at，改用今天 ${today}。`);
    }
  }

  const nextCompleted = upsertCompleted(prevCompleted, {
    id: topicId,
    title,
    category,
    completed_at: completedAt,
    path: relativeOutputPath
  });
  const booksIndexHtml = buildBooksIndexHtml(nextCompleted); // Learning Map payload 也在此一次算完

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
