/**
 * draft.js — scripts/quality/ 共用的 draft 解析 helper
 *
 * 1. demo-archetype 宣告（drafts/<id>/content.html 開頭）
 * 2. script.html 去殼（取出所有 <script> 區塊的內容）
 *
 * ---- demo-archetype 宣告 ----
 * 宣告格式（見 guidelines/style-guide.md「Demo Archetype」）：
 *   <!-- demo-archetype: B｜參數掃描（主）＋C｜並排對照（次） — 說明 … -->
 * 代號一律寫成「X｜名稱」；**第一個代號即為主 archetype**，撞形檢查只看它。
 * 宣告可跨多行，因此只要求它從前 20 行內開始。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HEAD_LINES = 20;

function parseArchetypeDeclaration(content) {
  const head = content.split(/\r?\n/).slice(0, HEAD_LINES).join('\n');
  const m = head.match(/<!--\s*demo-archetype:\s*([\s\S]*?)-->/);
  if (!m) return { found: false, codes: [], primary: null };
  const codes = m[1].match(/\b[A-F](?=｜)/g) || [];
  return { found: true, codes: codes, primary: codes.length ? codes[0] : null };
}

// 讀出所有 draft 的主 archetype：{ "<topic-id>": "A".."F" | "?" }
// "?" = 沒有 content.html、沒有宣告，或宣告裡抓不到代號
function readPrimaryArchetypes(draftsDir) {
  const out = {};
  fs.readdirSync(draftsDir).forEach(function (id) {
    const p = path.join(draftsDir, id, 'content.html');
    if (!fs.existsSync(p)) return;
    const decl = parseArchetypeDeclaration(fs.readFileSync(p, 'utf8'));
    out[id] = decl.primary || '?';
  });
  return out;
}

// script.html 可能在 <script> 之前先放 <style>，因此不能只剝頭尾標籤：
// 取出所有 <script> 區塊的內容串接；完全沒有 <script> 標籤時視為純 JS 原樣回傳。
function extractScriptJs(raw) {
  const blocks = [];
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(raw))) blocks.push(m[1]);
  return blocks.length ? blocks.join('\n') : raw;
}

module.exports = { parseArchetypeDeclaration, readPrimaryArchetypes, extractScriptJs };
