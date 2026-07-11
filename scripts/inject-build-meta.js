#!/usr/bin/env node
'use strict';

/**
 * inject-build-meta.js — 在 CI deploy 時，把「最後更新時間 + short SHA」
 * 注入 books/index.html 的 <!-- BUILD_META --> placeholder。
 *
 * 語意：戳記對應「本次實際部署的 commit」，而非 generate.js 當下的 HEAD。
 * Agent 撰文 / 選題 / 改稿工作流不需呼叫此腳本。
 *
 * Usage (GitHub Actions):
 *   node scripts/inject-build-meta.js
 *   # 讀取 GITHUB_SHA / GITHUB_REPOSITORY；時間用 UTC now
 *
 * Usage (local override):
 *   node scripts/inject-build-meta.js --sha <full-or-short> --repo owner/name --at <ISO8601>
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'books', 'index.html');
const PLACEHOLDER = '<!-- BUILD_META -->';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--sha') out.sha = argv[++i];
    else if (arg === '--repo') out.repo = argv[++i];
    else if (arg === '--at') out.at = argv[++i];
    else if (arg === '--file') out.file = argv[++i];
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`未知參數：${arg}`);
  }
  return out;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Format as `YYYY-MM-DD HH:mm UTC` from a Date or ISO string. */
function formatUtc(at) {
  const date = at ? new Date(at) : new Date();
  if (Number.isNaN(date.getTime())) {
    throw new Error(`無效的時間：${at}`);
  }
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mi = String(date.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function shortSha(sha) {
  const cleaned = String(sha || '').trim();
  if (!/^[0-9a-f]{7,40}$/i.test(cleaned)) {
    throw new Error(`無效的 git SHA：${sha}`);
  }
  return cleaned.slice(0, 7).toLowerCase();
}

function buildMetaHtml({ sha, repo, at }) {
  const full = String(sha).trim().toLowerCase();
  const short = shortSha(full);
  const when = escapeHtml(formatUtc(at));

  if (repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) {
    const href = `https://github.com/${repo}/commit/${encodeURIComponent(full)}`;
    return `<p class="mt-3 font-mono text-xs text-stone-400">最後更新：${when} · <a href="${href}" class="hover:text-stone-600 underline-offset-2 hover:underline" title="View commit ${escapeHtml(short)}">${escapeHtml(short)}</a></p>`;
  }

  return `<p class="mt-3 font-mono text-xs text-stone-400">最後更新：${when} · ${escapeHtml(short)}</p>`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/inject-build-meta.js [--sha SHA] [--repo owner/name] [--at ISO8601] [--file path]`);
    process.exit(0);
  }

  const sha = args.sha || process.env.GITHUB_SHA;
  const repo = args.repo || process.env.GITHUB_REPOSITORY || '';
  const at = args.at || process.env.BUILD_META_AT || '';
  const filePath = args.file ? path.resolve(args.file) : INDEX_PATH;

  if (!sha) {
    console.error('缺少 SHA：請設定 GITHUB_SHA 或傳入 --sha');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`找不到目標檔案：${filePath}`);
    process.exit(1);
  }

  const html = fs.readFileSync(filePath, 'utf8');
  const count = html.split(PLACEHOLDER).length - 1;
  if (count === 0) {
    console.error(`找不到 placeholder ${PLACEHOLDER}（請確認 books/index.html 或 books.js 已含此標記）`);
    process.exit(1);
  }
  if (count > 1) {
    console.error(`placeholder ${PLACEHOLDER} 出現 ${count} 次，預期恰好 1 次`);
    process.exit(1);
  }

  const metaHtml = buildMetaHtml({ sha, repo, at });
  const next = html.replace(PLACEHOLDER, metaHtml);
  fs.writeFileSync(filePath, next, 'utf8');

  console.log(`已注入 build meta → ${path.relative(ROOT, filePath)}`);
  console.log(`  ${metaHtml.replace(/<[^>]+>/g, '')}`);
}

main();
