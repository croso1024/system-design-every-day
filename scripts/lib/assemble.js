'use strict';

/**
 * assemble.js — 主題頁組裝的單一真相來源。
 *
 * 由 generate.js（發佈）與 rebuild-all.js（全站重建）共用：
 *   - buildTocHtml：掃描 content 章節、產生左側 Auto-TOC。
 *   - assemblePageHtml：把 title / toc / content / script 逐字注入 templates/base.html。
 *
 * 「逐字注入、零轉換」是本專案內容流水線的核心不變量：draft + 模板決定產物的每一個位元組。
 * 章節掃描 regex 只定義在這裡。
 */

const { escapeHtml } = require('./books');

// 章節掃描：<section id="id"> ...(可選 <span class="sec-num">num</span>)... <h2>title</h2>
// 左側 Auto-TOC 與產頁前的章節守門都以此為準。
const SECTION_REGEX = /<section\s+id="([^"]+)"[^>]*>[\s\S]*?(?:<span\s+class="sec-num">([^<]*)<\/span>\s*)?<h2>([^<]+)<\/h2>/;

/**
 * 掃描 content 內所有合法章節。
 * @returns {{id:string,num:string,title:string}[]} 依出現順序；找不到則為空陣列。
 */
function extractSections(content) {
  const sections = [];
  // 每次呼叫用全新的 stateful regex，避免共用 lastIndex 造成跨呼叫污染。
  const regex = new RegExp(SECTION_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(content)) !== null) {
    sections.push({
      id: match[1],
      num: match[2] ? match[2].trim() : '',
      title: match[3].trim(),
    });
  }
  return sections;
}

/**
 * 由 content 產生左側 Auto-TOC 的內層 HTML（<a> 串接）。
 * 回傳空字串代表「找不到任何合法章節」——呼叫端（generate.js / rebuild-all.js）據此守門並拒絕產頁。
 */
function buildTocHtml(content) {
  const sections = extractSections(content);
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

/**
 * 將各區塊逐字注入模板：title 全域替換並 escape；toc、content 逐字注入；script 非空時前後各補一個換行。
 * replacement 一律用函式形式：字串形式會把內容裡的 `$'`、`$&`、`$$` 等當成替換樣式展開（JS 字串裡的 `$` 很常見）。
 * tocHtml 由呼叫端先算好傳入，讓呼叫端能在落檔前先做 TOC 守門。
 */
function assemblePageHtml(template, { title, tocHtml, content, script }) {
  return template
    .replace(/<!-- TITLE_PLACEHOLDER -->/g, () => escapeHtml(title))
    .replace('<!-- TOC_PLACEHOLDER -->', () => tocHtml)
    .replace('<!-- CONTENT_PLACEHOLDER -->', () => content)
    .replace('<!-- SCRIPT_PLACEHOLDER -->', () => (script ? `\n${script}\n` : ''));
}

module.exports = { buildTocHtml, assemblePageHtml };
