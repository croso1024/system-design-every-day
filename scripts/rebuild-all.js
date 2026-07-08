#!/usr/bin/env node

'use strict';

/**
 * rebuild-all.js — 從 drafts/ 全站（或指定）重建 books/<id>/index.html。
 *
 * 用於模板 / 全站樣式改動後的重生。與 generate.js 語義一致，共用同一組 lib：
 *   - 版面組裝：lib/assemble.js（buildTocHtml / assemblePageHtml）。
 *   - 首頁與 completed 輔助：lib/books.js。
 *   - 原子寫：lib/atomic.js。
 *
 * 關鍵不變量：
 *   1. 保留既有 completed_at ── metadata（title / category / completed_at / path）一律自現有
 *      docs/completed.json 讀回，「絕不」以 new Date() 洗成當天。故本腳本「不異動」completed.json，
 *      是最強的保留：只重繪頁面與首頁。
 *   2. 缺 draft 或抽不到章節的主題「不靜默略過」──全部先掃描，任一異常即零副作用中止並明確報出，
 *      避免半重建的不一致狀態。
 *   3. 重建後三檔（產物 / completed.json / books/index.html）維持一致，validate.js 需通過。
 *
 * Usage:
 *   node scripts/rebuild-all.js [--dry-run] [--topic <id>]
 *     --dry-run   列出將重建哪些主題與各自保留的 completed_at，不寫任何檔。
 *     --topic <id> 只重建單篇。
 */

const fs = require('fs');
const path = require('path');
const {
  loadCompleted,
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
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, 'utf8');
}

function main() {
  const args = parseArgs(process.argv);
  const dryRun = Boolean(args['dry-run']);
  const onlyTopic = typeof args.topic === 'string' ? args.topic : null;

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`Template not found: ${TEMPLATE_PATH}`);
    process.exit(1);
  }

  const completed = loadCompleted();
  let targets = completed.slice();
  if (onlyTopic) {
    targets = completed.filter((item) => item.id === onlyTopic);
    if (targets.length === 0) {
      console.error(`--topic "${onlyTopic}" 不在 docs/completed.json 清單中。`);
      process.exit(1);
    }
  }

  console.log(`rebuild-all${dryRun ? ' [DRY-RUN]' : ''} — 目標 ${targets.length} 篇\n`);

  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

  // ---- 階段一：全部先掃描並純計算（不落任何檔）。任一異常即零副作用中止。 ----
  const problems = [];
  const plans = [];
  for (const item of targets) {
    const draftDir = path.join(ROOT, 'drafts', item.id);
    const contentPath = path.join(draftDir, 'content.html');
    const scriptPath = path.join(draftDir, 'script.html');

    if (!fs.existsSync(contentPath)) {
      problems.push(`${item.id}：缺 draft（drafts/${item.id}/content.html 不存在）`);
      continue;
    }
    const content = readFileOrDefault(contentPath);
    const script = readFileOrDefault(scriptPath);
    const tocHtml = buildTocHtml(content);
    if (!tocHtml) {
      problems.push(`${item.id}：draft content 抽不到任何合法 <section id> + <h2> 章節`);
      continue;
    }

    const relativeOutputPath = path.posix.join('books', item.id, 'index.html');
    const html = assemblePageHtml(template, { title: item.title, tocHtml, content, script });
    plans.push({
      id: item.id,
      title: item.title,
      completed_at: item.completed_at,
      hasScript: Boolean(script),
      outputPath: path.join(ROOT, 'books', item.id, 'index.html'),
      relativeOutputPath,
      html,
    });
  }

  if (problems.length) {
    console.error('偵測到問題，為避免半重建的不一致狀態，未寫入任何檔案：');
    problems.forEach((p) => console.error(`  ✖ ${p}`));
    process.exit(1);
  }

  // ---- Dry-run：列出計畫與保留的 completed_at，不落檔。 ----
  if (dryRun) {
    plans.forEach((p) => {
      console.log(`  • ${p.id}  completed_at=${p.completed_at}（保留）  ${p.hasScript ? 'content+script' : 'content'}`);
    });
    console.log(`\n[DRY-RUN] 將重建 ${plans.length} 篇，completed.json 不異動（completed_at 全數保留）。未寫入任何檔案。`);
    return;
  }

  // ---- 階段二：集中原子落檔。completed.json 不異動（metadata 保留），故無需回滾保護。 ----
  plans.forEach((p) => {
    ensureDir(path.dirname(p.outputPath));
    writeFileAtomic(p.outputPath, p.html);
    console.log(`  ✔ ${p.relativeOutputPath}  (completed_at=${p.completed_at} 保留)`);
  });

  // 重繪首頁：完整站台重建時，讓 lib/books.js / mindmap 的改動也傳遞到 books/index.html。
  // 若只重建單篇，首頁由相同 completed 推導，重繪為冪等。
  writeBooksIndex(buildBooksIndexHtml(completed));
  console.log('  ✔ books/index.html（依現有 completed.json 重繪）');

  console.log(`\n重建完成：${plans.length} 篇。docs/completed.json 未異動（completed_at 全數保留）。`);
  console.log('請執行 node scripts/validate.js 確認三檔一致。');
}

main();
