#!/usr/bin/env node

'use strict';

/**
 * reindex-home.js — 只重繪首頁 books/index.html（不動文章頁、不動狀態檔）。
 *
 * 動機：
 *   首頁的 Learning Map payload 由 docs/mindmap.json + docs/completed.json 推導，
 *   validate.js 會要求「每個 mindmap 節點都出現在首頁 payload」。因此 topic-explorer 以
 *   add-topic.js 新增 / 修改節點後，若不重繪首頁，validate 會失敗。
 *   而 generate.js 需要 draft 才能跑、rebuild-all.js 會連帶重建全部文章頁（blast radius 過大），
 *   兩者都不適合「只想同步首頁」的情境——本腳本補上最小、冪等的「只重繪首頁」路徑。
 *
 * 保證（不變量）：
 *   1. 只讀 docs/completed.json 與 docs/mindmap.json；只寫 books/index.html。
 *      「絕不」異動 completed.json / todo.json / mindmap.json / 任何 books/<id>/ 文章頁。
 *   2. 原子寫（temp+rename），與 generate.js / rebuild-all.js 共用同一組 lib/books。
 *   3. 冪等：相同輸入重跑產生相同 books/index.html。
 *
 * Usage:
 *   node scripts/reindex-home.js [--dry-run]
 *     --dry-run   只印出將寫入的首頁摘要（completed / topics / categories 數），不落任何檔。
 */

const {
  loadCompleted,
  buildBooksIndexHtml,
  writeBooksIndex,
} = require('./lib/books');
const { buildLearningMapData } = require('./mindmap');

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

function main() {
  const args = parseArgs(process.argv);
  const dryRun = Boolean(args['dry-run']);

  let completed;
  try {
    completed = loadCompleted();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  let html;
  let payload;
  try {
    // payload 供摘要 / dry-run 顯示；html 為實際落檔內容。兩者同源於同一份 completed，故一致。
    payload = buildLearningMapData(completed);
    html = buildBooksIndexHtml(completed);
  } catch (e) {
    // 多半是缺少 templates/home-learning-map.{css,js}（readTemplate 會 throw），fail-loud。
    console.error(`重繪 books/index.html 失敗：${e.message}`);
    process.exit(1);
  }

  const summary = `completed=${completed.length} · topics=${payload.topics.length} · categories=${payload.categories.length}`;

  if (dryRun) {
    console.log(`[DRY-RUN] 將重繪 books/index.html（${summary}）。未寫入任何檔案。`);
    return;
  }

  writeBooksIndex(html);
  console.log(`已重繪 books/index.html（${summary}）。docs/ 狀態檔與文章頁皆未異動。`);
  console.log('提示：請執行 `node scripts/validate.js` 確認三檔一致。');
}

main();
