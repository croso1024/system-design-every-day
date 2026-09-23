#!/usr/bin/env node
/**
 * demo-audit.js — Demo 品質 L1 機械閘門（唯讀；node --check 的暫存檔放 os.tmpdir()）
 *
 * 用法：
 *   node scripts/quality/demo-audit.js <topic-id> [...]
 *   node scripts/quality/demo-audit.js --all
 *   node scripts/quality/demo-audit.js --all --csv      // 只印摘要表，便於橫向比對
 *   任一篇有未過項目即 exit 1。第 6、9 項是啟發式，誤報時以人眼判讀為準。
 *
 * 檢查項：
 *   1  archetype 宣告在 content.html 第一行
 *   2  .seg 組數 <= 2
 *   3  三件組 .X-metric / .X-verdict / .X-wire（只看 markup 用量，不看 CSS 定義）
 *   4  舊 demo 骨架指紋（防複製上一篇）
 *   5  script.html 去殼後 node --check 語法檢查
 *   6  ID 綁定雙向 diff（綁到不存在的 id / 宣告了沒人用的互動元件）
 *   7  委派元件的 data-* 屬性是否真被讀取（抓死控制項）
 *   8  <div> / <section> 標籤平衡
 *   9  圖表容器後缺 <p class="cap">
 *  10  Mermaid 誤入 .demo 內
 *  11  compute/render 分離（compute* 純函式須存在且不碰 DOM）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { parseArchetypeDeclaration, extractScriptJs } = require('./lib/draft');

const ROOT = process.env.SDED_ROOT || path.resolve(__dirname, '..', '..');
const DRAFTS = path.join(ROOT, 'drafts');

const SKELETON_FINGERPRINTS = [
  'function setSeg', 'function logRow', 'var verdict = {', 'var metrics = {',
  'function fresh()', 'panel = { op', '-p-writable', '-p-risk', '-p-hwm',
];

// 圖表容器 class 後綴：出現這些就該有 .cap 收尾
const DIAGRAM_SUFFIX = /-(row|lane|stack|bar|swim|arch|planes|duty|skew|tiers|pipe|split|diag|hs)$/;

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

function countOccurrences(hay, needle) {
  return hay.split(needle).length - 1;
}

function stripStyle(html) {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '');
}

// 只取 markup 的 class 屬性，避開 <style> 裡的 CSS 定義
function markupClasses(html) {
  const out = new Set();
  const re = /\bclass\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(stripStyle(html)))) {
    m[1].trim().split(/\s+/).forEach(function (c) { if (c) out.add(c); });
  }
  return out;
}

function declaredIds(html) {
  const out = new Set();
  const re = /\bid\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) out.add(m[1]);
  return out;
}

// script 裡被查找的 id：getElementById / querySelector("#x") / el("x") 風格 helper
function referencedIds(js) {
  const out = new Set();
  const pats = [
    /getElementById\(\s*(["'])([^"']+)\1\s*\)/g,
    /querySelector(?:All)?\(\s*(["'])#([A-Za-z0-9_-]+)/g,
    /\bel\(\s*(["'])([^"']+)\1\s*\)/g,
  ];
  for (const re of pats) {
    let m;
    while ((m = re.exec(js))) out.add(m[2]);
  }
  return out;
}

/* ---------- 各檢查項 ---------- */

function checkArchetype(content) {
  const decl = parseArchetypeDeclaration(content);
  if (!decl.found) return { ok: false, note: '第一行沒有 demo-archetype 宣告' };
  const codes = decl.codes;
  if (!codes.length) return { ok: false, note: '宣告存在但抓不到 A-F 代號（格式應為 `X｜名稱 — 說明`）' };
  return { ok: true, codes: codes, note: codes.join('+') };
}

// `.seg <= 2 組` 的規範單位是「單一 demo」，不是整個檔案。
// 一頁多個 demo 時，必須逐個 .demo 區塊分別計數，否則 6-demo 的頁面會被誤判。
function splitDemoBlocks(html) {
  const stripped = stripStyle(html);
  const blocks = [];
  const re = /<div class="demo"[^>]*>/g;
  let m;
  while ((m = re.exec(stripped))) {
    const end = matchDivClose(stripped, m.index);
    blocks.push(stripped.slice(m.index, end === -1 ? stripped.length : end));
  }
  return blocks;
}

function matchDivClose(html, from) {
  const re = /<div\b|<\/div>/g;
  re.lastIndex = from;
  let depth = 0;
  let m;
  while ((m = re.exec(html))) {
    if (m[0] === '</div>') {
      depth -= 1;
      if (depth === 0) return m.index + 6;
    } else {
      depth += 1;
    }
  }
  return -1;
}

function checkSeg(content) {
  const total = countOccurrences(content, 'class="seg"');
  const blocks = splitDemoBlocks(content);
  const perDemo = blocks.map(function (b) { return countOccurrences(b, 'class="seg"'); });
  const worst = perDemo.length ? Math.max.apply(null, perDemo) : total;
  const outside = total - perDemo.reduce(function (a, b) { return a + b; }, 0);
  const ok = worst <= 2;
  let note = (blocks.length > 1 ? blocks.length + ' 個 demo，各 [' + perDemo.join(', ') + ']，最多 ' + worst : worst + ' 組');
  if (!ok) note += ' 組（單一 demo 上限 2）';
  if (outside > 0) note += '；另有 ' + outside + ' 組在 .demo 之外';
  return { n: worst, total: total, perDemo: perDemo, demos: blocks.length, ok: ok, note: note };
}

// 三件組不能只靠 class 命名偵測：distributed-sql 的進度列叫 .sql-stepbar、log 捲軸叫 .sql-log，
// data-sharding-in-practice 的進度列叫 .mg-phase——換個名字就漏測。
// 因此除了命名，再加語意偵測：「步/階段 N / M」文字樣式，與 log/trace/wire 類捲軸容器。
function checkChrome(content) {
  const cls = markupClasses(content);
  const stripped = stripStyle(content);
  const hit = { metric: false, verdict: false, wire: false };
  const why = { metric: [], verdict: [], wire: [] };

  cls.forEach(function (c) {
    if (/-metrics?$/.test(c)) { hit.metric = true; why.metric.push('.' + c); }
    if (/-verdict$/.test(c)) { hit.verdict = true; why.verdict.push('.' + c); }
    if (/-wire$/.test(c)) { hit.wire = true; why.wire.push('.' + c); }
    // 換名的進度列 / 日誌捲軸
    if (/-(stepbar|phase|progress|steps?)$/.test(c)) { hit.metric = true; why.metric.push('.' + c + '(改名)'); }
    if (/-(log|trace|console|feed)$/.test(c)) { hit.wire = true; why.wire.push('.' + c + '(改名)'); }
    if (/-(judge|conclusion|result-?bar)$/.test(c)) { hit.verdict = true; why.verdict.push('.' + c + '(改名)'); }
  });

  // 「步 3 / 6」「階段 2 / 6」「Step 4 / 8」這類進度文字
  if (/(步|階段|Step)\s*(<[^>]+>)?\s*\d*\s*(<\/[^>]+>)?\s*\/\s*(<[^>]+>)?\s*\d/.test(stripped)) {
    if (!hit.metric) why.metric.push('「步/階段 N / M」文字');
    hit.metric = true;
  }

  const names = Object.keys(hit).filter(function (k) { return hit[k]; });
  const detail = names.map(function (k) { return k + '[' + why[k].join(' ') + ']'; }).join(' + ');
  return {
    n: names.length,
    hit: hit,
    why: why,
    ok: names.length < 3,
    note: names.length === 0 ? '無' : detail + '（' + names.length + '/3）',
  };
}

function checkSkeleton(js) {
  const hits = SKELETON_FINGERPRINTS.filter(function (f) { return js.indexOf(f) !== -1; });
  return { hits: hits, ok: hits.length === 0, note: hits.length ? hits.join(', ') : '無' };
}

function checkSyntax(js, id) {
  const tmp = path.join(os.tmpdir(), 'demo-audit-' + id + '-' + process.pid + '.js');
  try {
    fs.writeFileSync(tmp, js, 'utf8');
    execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' });
    return { ok: true, note: 'pass' };
  } catch (e) {
    const msg = String(e.stderr || e.message).split('\n').filter(Boolean).slice(0, 3).join(' / ');
    return { ok: false, note: msg };
  } finally {
    try { fs.unlinkSync(tmp); } catch (e2) { /* ignore */ }
  }
}

function checkIdBinding(content, js) {
  const inContent = declaredIds(content);
  const inScript = declaredIds(js); // script 動態產生的 id 也算存在
  const refs = referencedIds(js);

  const dangling = Array.from(refs).filter(function (x) {
    return !inContent.has(x) && !inScript.has(x);
  });

  // 只檢互動元件的 id，避免把章節 id 誤判為死 id
  const re = /<(button|input|select|textarea|canvas)\b[^>]*\bid\s*=\s*"([^"]+)"/gi;
  const interactiveIds = [];
  let m;
  while ((m = re.exec(stripStyle(content)))) interactiveIds.push(m[2]);
  const deadControls = interactiveIds.filter(function (x) {
    return !refs.has(x) && js.indexOf('"' + x + '"') === -1 && js.indexOf("'" + x + "'") === -1;
  });

  const notes = [];
  if (dangling.length) notes.push('綁不存在的 id: ' + dangling.join(', '));
  if (deadControls.length) notes.push('死控制項: ' + deadControls.join(', '));
  return {
    ok: dangling.length === 0 && deadControls.length === 0,
    dangling: dangling,
    deadControls: deadControls,
    note: notes.length ? notes.join('；') : 'ok（ref ' + refs.size + ' / 互動元件 ' + interactiveIds.length + '）',
  };
}

function checkDelegated(content, js) {
  // 沒有 id 的互動元件靠事件委派；檢查它們的 data-* 屬性名是否真被 script 讀取
  const stripped = stripStyle(content);
  const attrs = new Set();
  const re = /<(?:button|input|select)\b([^>]*)>/gi;
  let m;
  let noId = 0;
  while ((m = re.exec(stripped))) {
    const tag = m[1];
    if (!/\bid\s*=/.test(tag)) noId += 1;
    const ar = /\b(data-[a-z0-9-]+)\s*=/gi;
    let a;
    while ((a = ar.exec(tag))) attrs.add(a[1].toLowerCase());
  }
  const lower = js.toLowerCase();
  const unused = Array.from(attrs).filter(function (a) {
    // dataset 形式：data-foo-bar -> fooBar
    const camel = a.replace(/^data-/, '').replace(/-(.)/g, function (s, c) { return c.toUpperCase(); });
    return lower.indexOf(a) === -1 && lower.indexOf(camel.toLowerCase()) === -1;
  });
  return {
    ok: unused.length === 0,
    noId: noId,
    unused: unused,
    note: unused.length
      ? '未被讀取的 data 屬性: ' + unused.join(', ')
      : 'ok（委派元件 ' + noId + ' 個、data 屬性 ' + attrs.size + ' 種）',
  };
}

function checkTagBalance(content) {
  const o = countOccurrences(content, '<div');
  const c = countOccurrences(content, '</div>');
  const so = (content.match(/<section\b/g) || []).length;
  const sc = countOccurrences(content, '</section>');
  const ok = o === c && so === sc;
  return {
    ok: ok,
    note: ok ? 'div ' + o + '=' + c + ' / section ' + so + '=' + sc
             : 'div ' + o + ' vs ' + c + ' / section ' + so + ' vs ' + sc,
  };
}

function checkCaps(content) {
  const stripped = stripStyle(content);
  const missing = [];

  // Mermaid 區塊：其後 120 字內須有 .cap
  const mer = /<pre class="mermaid">[\s\S]*?<\/pre>([\s\S]{0,140})/g;
  let m;
  let idx = 0;
  while ((m = mer.exec(stripped))) {
    idx += 1;
    if (!/<p class="cap"/.test(m[1])) missing.push('mermaid#' + idx);
  }

  // 圖表容器：逐個實例抓開標籤，往後 4000 字內找 .cap（粗略，僅當提示）
  // demo-* 是模擬器外殼（demo-bar / demo-body），不是圖表，排除。
  const box = /<div class="([a-z0-9_-]+)"[^>]*>/g;
  const tally = {};
  while ((m = box.exec(stripped))) {
    const cls = m[1];
    if (!DIAGRAM_SUFFIX.test(cls) || /^demo/.test(cls)) continue;
    if (!tally[cls]) tally[cls] = { total: 0, miss: 0 };
    tally[cls].total += 1;
    if (!/<p class="cap"/.test(stripped.slice(m.index, m.index + 4000))) tally[cls].miss += 1;
  }
  Object.keys(tally).forEach(function (cls) {
    const t = tally[cls];
    if (t.miss) missing.push(cls + ' ' + t.miss + '/' + t.total);
  });
  return { ok: missing.length === 0, missing: missing, note: missing.length ? '疑似缺 cap: ' + missing.join(', ') : 'ok' };
}

function checkMermaidInDemo(content) {
  const demos = content.match(/<div class="demo"[\s\S]*?<\/div>\s*<\/div>/g) || [];
  const bad = demos.filter(function (d) { return d.indexOf('class="mermaid"') !== -1; }).length;
  return { ok: bad === 0, note: bad ? bad + ' 個 .demo 內含 mermaid（禁止）' : 'ok' };
}

// 算與畫分離：compute* 純函式須存在，且函式體不得碰 DOM。
function checkPureCompute(js) {
  const re = /function\s+(compute[A-Za-z0-9_]*)\s*\(/g;
  const found = [];
  let m;
  while ((m = re.exec(js))) found.push({ name: m[1], at: m.index });
  if (!found.length) {
    return { ok: false, names: [], note: '找不到 compute* 純函式（須 compute/render 分離）' };
  }

  const dirty = [];
  for (const f of found) {
    const start = js.indexOf('{', f.at);
    let depth = 0;
    let end = start;
    for (let i = start; i < js.length; i += 1) {
      if (js[i] === '{') depth += 1;
      else if (js[i] === '}') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    const body = js.slice(start, end + 1);
    const bodyNoStr = body.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""'); /* 剝掉字串字面值：文案裡的 API 名稱不算碰 DOM，purity 由 L2 runtime 證明 */
    if (/\bdocument\b|getElementById|querySelector|innerHTML|textContent|classList|addEventListener/.test(bodyNoStr)) {
      dirty.push(f.name);
    }
  }
  const names = found.map(function (f) { return f.name; });
  return {
    ok: dirty.length === 0,
    names: names,
    note: dirty.length ? '純函式碰到 DOM: ' + dirty.join(', ') : 'ok（' + names.join(', ') + '）',
  };
}

/* ---------- 主流程 ---------- */

function audit(id) {
  const cPath = path.join(DRAFTS, id, 'content.html');
  const sPath = path.join(DRAFTS, id, 'script.html');
  const content = read(cPath);
  const raw = read(sPath);
  if (content == null) return { id: id, fatal: '讀不到 ' + cPath };
  if (raw == null) return { id: id, fatal: '讀不到 ' + sPath };
  const js = extractScriptJs(raw);

  return {
    id: id,
    checks: {
      '1 archetype 宣告': checkArchetype(content),
      '2 seg 組數': checkSeg(content),
      '3 三件組 chrome': checkChrome(content),
      '4 舊骨架指紋': checkSkeleton(js),
      '5 JS 語法': checkSyntax(js, id),
      '6 ID 綁定': checkIdBinding(content, js),
      '7 委派 data 屬性': checkDelegated(content, js),
      '8 標籤平衡': checkTagBalance(content),
      '9 圖表 cap': checkCaps(content),
      '10 mermaid 位置': checkMermaidInDemo(content),
      '11 compute 分離': checkPureCompute(js),
    },
  };
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function padStart(s, n) {
  s = String(s);
  return s.length >= n ? s : ' '.repeat(n - s.length) + s;
}

function main() {
  const args = process.argv.slice(2);
  const csv = args.indexOf('--csv') !== -1;
  let ids = args.filter(function (a) { return a.indexOf('--') !== 0; });
  if (args.indexOf('--all') !== -1 || !ids.length) {
    ids = fs.readdirSync(DRAFTS).filter(function (d) {
      return fs.existsSync(path.join(DRAFTS, d, 'content.html'));
    }).sort();
  }

  const rows = [];
  let failed = false;
  for (const id of ids) {
    const r = audit(id);
    if (r.fatal) { console.log('\n### ' + id + '\n  x ' + r.fatal); failed = true; continue; }
    const entries = Object.keys(r.checks).map(function (k) { return [k, r.checks[k]]; });
    const fails = entries.filter(function (e) { return !e[1].ok; });
    if (fails.length) failed = true;
    rows.push({
      id: id,
      fails: fails.length,
      arche: r.checks['1 archetype 宣告'].note,
      seg: r.checks['2 seg 組數'].n,
      chrome: r.checks['3 三件組 chrome'].n,
    });
    if (csv) continue;
    console.log('\n### ' + id + '   ' + (fails.length === 0 ? 'OK 全通過' : 'x ' + fails.length + ' 項未過'));
    for (const e of entries) {
      console.log('  ' + (e[1].ok ? 'v' : 'x') + ' ' + pad(e[0], 20) + ' ' + e[1].note);
    }
  }

  console.log('\n' + '='.repeat(100));
  console.log(pad('id', 44) + padStart('FAIL', 5) + padStart('SEG', 5) + padStart('CHR', 5) + '  archetype');
  console.log('-'.repeat(100));
  rows.sort(function (a, b) { return b.fails - a.fails; });
  for (const r of rows) {
    console.log(pad(r.id, 44) + padStart(r.fails, 5) + padStart(r.seg, 5) + padStart(r.chrome, 5) + '  ' + r.arche);
  }
  process.exitCode = failed ? 1 : 0;
}

main();
