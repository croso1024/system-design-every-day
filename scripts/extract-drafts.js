#!/usr/bin/env node

'use strict';

/**
 * extract-drafts.js — 從已發佈產物反解重建 drafts/<id>/。
 *
 * 因 generate.js 對 templates/base.html 做「逐字注入、零轉換」，content 完整保存在每個
 * books/<id>/index.html 中，反解是「確定性逆運算」而非猜測還原：
 *   - content.html：<main> 內 <div class="inner"> 與其對應 </div> 之間，以結構錨點切割。
 *   - script.html ：固定 TOC script 的 </script> 之後、到 script 區尾錨點之前；空 → 該篇無 script。
 *
 * 落檔閘門（不靠人眼）：對切出的 content 套用與 generate.js 同源的 extractSections，
 * 逐項比對「頁面左側已渲染的 .toc-nav 章節」(id / 序號 / 標題 / 數量)。任一不符 → 標記
 * 需人工檢視、不落檔，其餘照常處理。
 *
 * Usage:
 *   node scripts/extract-drafts.js [--dry-run] [--topic <id>]
 *     --dry-run   只反解 + 驗證並輸出報告，完全不寫任何檔。
 *     --topic <id> 只處理單篇（便於除錯與抽驗）。
 */

const fs = require('fs');
const path = require('path');
const { loadCompleted, escapeHtml, ensureDir } = require('./lib/books');
const { extractSections } = require('./lib/assemble');
const { writeFileAtomic } = require('./lib/atomic');

const ROOT = path.resolve(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'templates', 'base.html');

// ---- 反解錨點（皆為模板結構常數，已用真實產物逐 byte 驗證） ----
const INNER_OPEN = '<div class="inner">';
const MAIN_CLOSE = '</main>';
const CONTENT_PH = '<!-- CONTENT_PLACEHOLDER -->';
const TOC_MARK = '/* ===== TOC scrollspy & mobile toggle ===== */';
const SCRIPT_CLOSE = '</script>';
// script 區尾錨點：依序嘗試以耐模板漂移（早期頁面 fullscreen 為事後 patch 注入）。
const SCRIPT_END_ANCHORS = ['<!-- FULLSCREEN-FEATURE:START -->', '</body>'];
const TOC_NAV_OPEN = '<div class="toc-nav">';

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

/**
 * 從模板精確推導 content 注入點前後的框架字串（generate.js 的 A/B 常數）：
 *   prefix = <div class="inner"> 與 <!-- CONTENT_PLACEHOLDER --> 之間（如 "\n        "）
 *   suffix = <!-- CONTENT_PLACEHOLDER --> 與 </main> 之間（如 "\n      </div>\n    "）
 * 用「精確剝除」取代貪婪 regex，才能保留內容自身的起始/結尾縮排（避免過度剝除）。
 */
function computeContentFrames(template) {
  const openIdx = template.indexOf(INNER_OPEN);
  const phIdx = template.indexOf(CONTENT_PH, openIdx);
  const mainIdx = template.indexOf(MAIN_CLOSE, phIdx);
  if (openIdx < 0 || phIdx < 0 || mainIdx < 0) {
    throw new Error('templates/base.html 缺少 content 注入結構（inner / CONTENT_PLACEHOLDER / main）');
  }
  return {
    prefix: template.slice(openIdx + INNER_OPEN.length, phIdx),
    suffix: template.slice(phIdx + CONTENT_PH.length, mainIdx),
  };
}

/**
 * 反解 content：以模板框架精確剝除。頁面框架須與模板逐 byte 相符（body 框架跨版本穩定；
 * 不符代表非預期漂移，不敢反解 → 標記需人工），確保還原 byte-exact 且不誤傷內容自身縮排。
 * @returns {{ok:true, content:string} | {ok:false, reason:string}}
 */
function extractContent(raw, frames) {
  const openIdx = raw.indexOf(INNER_OPEN);
  if (openIdx < 0) return { ok: false, reason: '找不到 content 起點錨點 <div class="inner">' };
  const contentStart = openIdx + INNER_OPEN.length;
  const mainIdx = raw.indexOf(MAIN_CLOSE, contentStart);
  if (mainIdx < 0) return { ok: false, reason: '找不到 content 終點錨點 </main>' };

  const pagePrefix = raw.slice(contentStart, contentStart + frames.prefix.length);
  if (pagePrefix !== frames.prefix) {
    return { ok: false, reason: 'content 前綴框架與模板不符（inner-open 後縮排漂移）' };
  }
  const suffixStart = mainIdx - frames.suffix.length;
  if (suffixStart < contentStart + frames.prefix.length) {
    return { ok: false, reason: 'content 區間過短，框架比對越界' };
  }
  const pageSuffix = raw.slice(suffixStart, mainIdx);
  if (pageSuffix !== frames.suffix) {
    return { ok: false, reason: 'content 後綴框架與模板不符（inner-close 縮排漂移）' };
  }

  return { ok: true, content: raw.slice(contentStart + frames.prefix.length, suffixStart) };
}

/**
 * 反解 script：固定 TOC script 的 </script> 之後、到 script 區尾錨點之前。
 * @returns {{ok:true, script:string} | {ok:false, reason:string}}
 *   ok 且 script==='' 代表該篇合法地無互動 script。
 */
function extractScript(raw) {
  const tocIdx = raw.indexOf(TOC_MARK);
  if (tocIdx < 0) return { ok: false, reason: '找不到固定 TOC script 錨點' };
  const closeIdx = raw.indexOf(SCRIPT_CLOSE, tocIdx);
  if (closeIdx < 0) return { ok: false, reason: 'TOC script 未見 </script> 收尾' };

  const regionStart = closeIdx + SCRIPT_CLOSE.length;
  let endIdx = -1;
  let endAnchor = '';
  for (const anchor of SCRIPT_END_ANCHORS) {
    const idx = raw.indexOf(anchor, regionStart);
    if (idx >= 0) {
      endIdx = idx;
      endAnchor = anchor;
      break;
    }
  }
  if (endIdx < 0) {
    return { ok: false, reason: `找不到 script 區尾錨點（${SCRIPT_END_ANCHORS.join(' / ')}）` };
  }

  const script = raw.slice(regionStart, endIdx).trim();
  return { ok: true, script, endAnchor };
}

/**
 * 解析頁面左側 .toc-nav 已渲染的章節錨點，作為往返驗證的對照基準。
 * 對照的是「已 escape 的呈現值」，故比對時把 extractSections 結果也過 escapeHtml。
 * @returns {{id:string,num:string,title:string}[]|null}
 */
function parseRenderedToc(raw) {
  const navIdx = raw.indexOf(TOC_NAV_OPEN);
  if (navIdx < 0) return null;
  const navStart = navIdx + TOC_NAV_OPEN.length;
  // toc-nav 內只有 Auto-TOC 的 <a>，其後即 </div>；取到第一個 </div> 為界。
  const navEnd = raw.indexOf('</div>', navStart);
  if (navEnd < 0) return null;
  const navHtml = raw.slice(navStart, navEnd);

  const anchors = [];
  const anchorRegex = /<a\s+href="#([^"]*)">(?:<span class="n">([^<]*)<\/span>)?([^<]*)<\/a>/g;
  let match;
  while ((match = anchorRegex.exec(navHtml)) !== null) {
    anchors.push({
      id: match[1],
      num: match[2] !== undefined ? match[2] : '',
      title: match[3],
    });
  }
  return anchors;
}

/**
 * TOC 往返驗證：extractSections(content) → escape → 與頁面已渲染 toc-nav 逐項比對。
 * @returns {{pass:boolean, reason?:string, sectionCount:number}}
 */
function verifyToc(content, raw) {
  const sections = extractSections(content);
  const rendered = parseRenderedToc(raw);
  if (rendered === null) {
    return { pass: false, reason: '頁面找不到 .toc-nav 區塊，無法比對', sectionCount: sections.length };
  }
  if (sections.length === 0) {
    return { pass: false, reason: '反解 content 抽不到任何合法章節', sectionCount: 0 };
  }
  if (sections.length !== rendered.length) {
    return {
      pass: false,
      reason: `章節數量不符：反解 ${sections.length} vs 已渲染 ${rendered.length}`,
      sectionCount: sections.length,
    };
  }
  for (let i = 0; i < sections.length; i += 1) {
    const s = sections[i];
    const r = rendered[i];
    const expId = escapeHtml(s.id);
    const expNum = s.num ? escapeHtml(s.num) : '';
    const expTitle = escapeHtml(s.title);
    if (expId !== r.id || expNum !== r.num || expTitle !== r.title) {
      return {
        pass: false,
        reason: `第 ${i + 1} 章不符：反解 {id:"${expId}", num:"${expNum}", title:"${expTitle}"} vs 已渲染 {id:"${r.id}", num:"${r.num}", title:"${r.title}"}`,
        sectionCount: sections.length,
      };
    }
  }
  return { pass: true, sectionCount: sections.length };
}

/** 反解單篇，回傳結構化結果（不落檔）。 */
function extractTopic(id, frames) {
  const pagePath = path.join(ROOT, 'books', id, 'index.html');
  if (!fs.existsSync(pagePath)) {
    return { id, status: 'manual', reasons: [`產物不存在：books/${id}/index.html`] };
  }
  const raw = fs.readFileSync(pagePath, 'utf8');

  const reasons = [];
  const contentResult = extractContent(raw, frames);
  if (!contentResult.ok) {
    reasons.push(contentResult.reason);
    return { id, status: 'manual', reasons };
  }
  const content = contentResult.content;

  const toc = verifyToc(content, raw);
  if (!toc.pass) {
    reasons.push(`TOC 往返驗證失敗：${toc.reason}`);
    return { id, status: 'manual', reasons, sectionCount: toc.sectionCount };
  }

  // content 通過閘門即可落檔；script 為次要，找不到錨點僅警示、不阻擋 content。
  const scriptResult = extractScript(raw);
  let script = '';
  let hasScript = false;
  if (scriptResult.ok) {
    if (scriptResult.script) {
      script = `${scriptResult.script}\n`;
      hasScript = true;
    }
  } else {
    reasons.push(`script 反解無法定位（${scriptResult.reason}）；content 仍可落檔，script 需人工檢視`);
  }

  return {
    id,
    status: 'pass',
    reasons,
    sectionCount: toc.sectionCount,
    hasScript,
    content,
    script,
  };
}

/** 落檔通過驗證的篇章。 */
function writeDraft(result) {
  const draftDir = path.join(ROOT, 'drafts', result.id);
  ensureDir(draftDir);
  writeFileAtomic(path.join(draftDir, 'content.html'), result.content);
  if (result.hasScript) {
    writeFileAtomic(path.join(draftDir, 'script.html'), result.script);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const dryRun = Boolean(args['dry-run']);
  const onlyTopic = typeof args.topic === 'string' ? args.topic : null;

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`Template not found: ${TEMPLATE_PATH}`);
    process.exit(1);
  }
  const frames = computeContentFrames(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

  const completed = loadCompleted();
  let ids = completed.map((item) => item.id);
  if (onlyTopic) {
    if (!ids.includes(onlyTopic)) {
      console.error(`--topic "${onlyTopic}" 不在 docs/completed.json 清單中。`);
      process.exit(1);
    }
    ids = [onlyTopic];
  }

  console.log(`extract-drafts${dryRun ? ' [DRY-RUN]' : ''} — 目標 ${ids.length} 篇\n`);

  const passed = [];
  const manual = [];
  for (const id of ids) {
    const result = extractTopic(id, frames);
    if (result.status === 'pass') {
      passed.push(result);
      if (!dryRun) {
        writeDraft(result);
      }
      const scriptTag = result.hasScript ? 'content+script' : 'content';
      const note = result.reasons.length ? `  ⚠ ${result.reasons.join('；')}` : '';
      console.log(`  ✔ ${id}  (${result.sectionCount} 章, ${scriptTag}${dryRun ? '' : ', 已落檔'})${note}`);
    } else {
      manual.push(result);
      console.log(`  ✖ ${id}  需人工檢視：${result.reasons.join('；')}`);
    }
  }

  console.log('\n──────── 報告 ────────');
  console.log(`總數：${ids.length}`);
  console.log(`通過${dryRun ? '（將落檔）' : '（已落檔）'}：${passed.length}`);
  console.log(`需人工檢視（不落檔）：${manual.length}`);
  if (manual.length) {
    console.log('\n需人工清單：');
    manual.forEach((m) => console.log(`  - ${m.id}：${m.reasons.join('；')}`));
  }
  if (dryRun) {
    console.log('\n[DRY-RUN] 未寫入任何檔案。');
  }
}

main();
