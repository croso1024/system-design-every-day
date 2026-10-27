#!/usr/bin/env node
/**
 * compute-probe.js — Demo 品質 L2 功能斷言（無瀏覽器、零依賴）
 *
 * 目的：在禁止瀏覽器 QA 的前提下，機械證明「這個 demo 不是播放器」。
 *
 * 前提約定（script.html 五段結構，見 guidelines/style-guide.md「compute／render 分離與 @probe」）：
 *   IIFE 內依序排列 ——
 *     (1) 常數與參數表
 *     (2) compute* 純函式（不得碰 document / DOM）
 *     (3) DOM 參照
 *     (4) render
 *     (5) 事件綁定
 *   並在 compute 函式上方寫三行機器可讀註解（一檔多個 demo 時可寫多組）：
 *     // @probe fn       computeState
 *     // @probe baseline {"nodes":4,"batch":2,"budget":30}
 *     // @probe sweep    {"nodes":[1,16],"batch":[1,8],"budget":[0,120]}
 *
 * 本工具會：
 *   1  只抽出 (1)+(2)，在完全沒有 document / window 的 vm context 裡求值
 *      → 任何 DOM 呼叫會直接拋錯，purity 由 runtime 證明，不靠人眼。
 *   2  用 baseline 呼叫一次取得基準輸出。
 *   3  逐一把 sweep 的每個參數推到兩端，重算，比對輸出。
 *   4  判定：每個參數都必須至少改變一個輸出；且會變動的輸出總數 >= 3。
 *      對應 style-guide §0.2「至少三個輸出是算出來的」的可執行版本。
 *
 * 用法：
 *   node scripts/quality/compute-probe.js <topic-id> [...]
 *   node scripts/quality/compute-probe.js --all
 *   任一篇未過即 exit 1。
 *
 * `--all` 模式會讀 scripts/quality/legacy-baseline.json 的 "compute-probe" 名單（語意見 lib/baseline.js）：
 *   名單內的舊文仍會跑檢查，失敗印成 SKIP(baseline) 不擋全站；已全過的名單項視為 stale → exit 1。
 *   單篇模式不看名單。
 *
 * 回歸 fixture（改本工具後跑一次；good-sim 應 PASS、fake-player 應 FAIL、two-demos 驗多組 @probe）：
 *   SDED_ROOT=scripts/quality/fixtures node scripts/quality/compute-probe.js --all
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { extractScriptJs } = require('./lib/draft');
const { loadBaseline } = require('./lib/baseline');

const ROOT = process.env.SDED_ROOT || path.resolve(__dirname, '..', '..');
const DRAFTS = path.join(ROOT, 'drafts');

const MIN_RESPONSIVE_OUTPUTS = 3;

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch (e) { return null; }
}

function matchBrace(src, from) {
  const start = src.indexOf('{', from);
  if (start === -1) return -1;
  let depth = 0;
  let inStr = null;
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    const prev = src[i - 1];
    if (inStr) {
      if (ch === inStr && prev !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// 一個 script.html 可以有多個 demo，因此可以有多組 @probe。
// 每遇到一個 `@probe fn` 就開一個新群組，後續的 baseline / sweep 歸屬於它。
function parseProbeDirectives(js) {
  const groups = [];
  const errors = [];
  let cur = null;
  const re = /\/\/\s*@probe\s+(fn|baseline|sweep)\s+([^\n]+)/g;
  let m;
  while ((m = re.exec(js))) {
    const key = m[1];
    const val = m[2].trim();
    if (key === 'fn') {
      cur = { fn: val, baseline: null, sweep: null };
      groups.push(cur);
      continue;
    }
    if (!cur) {
      // 沒有先宣告 fn 就出現 baseline/sweep：開一個匿名群組，稍後用唯一的 compute 函式補上
      cur = { fn: null, baseline: null, sweep: null };
      groups.push(cur);
    }
    try {
      cur[key] = JSON.parse(val);
    } catch (e) {
      errors.push('@probe ' + key + ' 不是合法 JSON：' + val);
    }
  }
  return { groups: groups, errors: errors };
}

function extractComputePrefix(js) {
  const re = /function\s+(compute[A-Za-z0-9_]*)\s*\(/g;
  const found = [];
  let m;
  while ((m = re.exec(js))) found.push({ name: m[1], at: m.index });
  if (!found.length) return { error: '找不到 compute* 函式' };

  let lastEnd = -1;
  for (const f of found) {
    const end = matchBrace(js, f.at);
    if (end === -1) return { error: f.name + ' 的大括號配對失敗' };
    if (end > lastEnd) lastEnd = end;
  }

  // 去掉 IIFE 外殼開頭（(function () { "use strict";）
  let bodyStart = 0;
  const iife = js.match(/\(\s*function\s*\([^)]*\)\s*\{/);
  if (iife) bodyStart = iife.index + iife[0].length;

  return {
    names: found.map(function (f) { return f.name; }),
    src: js.slice(bodyStart, lastEnd + 1),
  };
}

// 把回傳物件攤平成 path -> 純量，用於比對
function flatten(obj, prefix, out) {
  out = out || {};
  prefix = prefix || '';
  if (obj === null || obj === undefined) { out[prefix || '(root)'] = String(obj); return out; }
  if (typeof obj !== 'object') { out[prefix || '(root)'] = obj; return out; }
  if (Array.isArray(obj)) {
    out[prefix + '.length'] = obj.length;
    obj.forEach(function (v, i) { flatten(v, prefix + '[' + i + ']', out); });
    return out;
  }
  Object.keys(obj).forEach(function (k) { flatten(obj[k], prefix ? prefix + '.' + k : k, out); });
  return out;
}

function diffKeys(a, b) {
  const keys = new Set(Object.keys(a).concat(Object.keys(b)));
  const changed = [];
  keys.forEach(function (k) {
    const va = JSON.stringify(a[k]);
    const vb = JSON.stringify(b[k]);
    if (va !== vb) changed.push(k);
  });
  return changed;
}

function probeOne(ex, group, names) {
  const entry = group.fn || names[names.length - 1];
  if (names.indexOf(entry) === -1) {
    return { fatal: '@probe fn 指定的 ' + entry + ' 不在 ' + names.join(', ') + ' 之中' };
  }
  if (!group.baseline) return { entry: entry, fatal: entry + ' 缺 `// @probe baseline {...}`' };
  if (!group.sweep) return { entry: entry, fatal: entry + ' 缺 `// @probe sweep {...}`' };

  // 完全不提供 document / window：任何 DOM 呼叫會 ReferenceError
  const sandbox = { Math: Math, JSON: JSON, Number: Number, String: String, Array: Array, Object: Object, isNaN: isNaN, parseInt: parseInt, parseFloat: parseFloat };
  let fn;
  try {
    const factory = new vm.Script('(function () {\n' + ex.src + '\nreturn ' + entry + ';\n})()');
    fn = factory.runInNewContext(sandbox, { timeout: 5000 });
  } catch (e) {
    return { entry: entry, fatal: '求值失敗（可能碰到 DOM 或依賴了 compute 之後才宣告的變數）：' + e.message };
  }
  if (typeof fn !== 'function') return { entry: entry, fatal: entry + ' 不是函式' };

  let base;
  try {
    base = flatten(fn(JSON.parse(JSON.stringify(group.baseline))));
  } catch (e) {
    return { entry: entry, fatal: 'baseline 呼叫失敗：' + e.message };
  }

  const results = [];
  const responsive = new Set();
  for (const key of Object.keys(group.sweep)) {
    const vals = group.sweep[key];
    const row = { key: key, tried: [], changed: [], ok: false };
    for (const v of (Array.isArray(vals) ? vals : [vals])) {
      const params = JSON.parse(JSON.stringify(group.baseline));
      params[key] = v;
      let got;
      try {
        got = flatten(fn(params));
      } catch (e) {
        row.tried.push(key + '=' + short(v) + ' → 拋錯: ' + e.message);
        continue;
      }
      const ch = diffKeys(base, got);
      row.tried.push(key + '=' + short(v) + ' → ' + ch.length + ' 個輸出變動');
      ch.forEach(function (k) { row.changed.push(k); responsive.add(k); });
    }
    row.ok = row.changed.length > 0;
    results.push(row);
  }

  const deadParams = results.filter(function (r) { return !r.ok; }).map(function (r) { return r.key; });
  return {
    entry: entry,
    ok: deadParams.length === 0 && responsive.size >= MIN_RESPONSIVE_OUTPUTS,
    results: results,
    responsive: Array.from(responsive),
    deadParams: deadParams,
  };
}

function short(v) {
  const s = JSON.stringify(v);
  return s && s.length > 48 ? s.slice(0, 45) + '…' : s;
}

function probe(id) {
  const sPath = path.join(DRAFTS, id, 'script.html');
  const raw = read(sPath);
  if (raw == null) return { id: id, fatal: '讀不到 ' + sPath };
  const js = extractScriptJs(raw);

  const ex = extractComputePrefix(js);
  if (ex.error) return { id: id, fatal: ex.error };

  const d = parseProbeDirectives(js);
  if (d.errors.length) return { id: id, fatal: d.errors.join('；') };
  if (!d.groups.length) return { id: id, fatal: '缺 `// @probe` 指令' };

  return { id: id, names: ex.names, groups: d.groups.map(function (g) { return probeOne(ex, g, ex.names); }) };
}

function main() {
  const args = process.argv.slice(2);
  let ids = args.filter(function (a) { return a.indexOf('--') !== 0; });
  const allMode = args.indexOf('--all') !== -1 || !ids.length;
  if (allMode) {
    ids = fs.readdirSync(DRAFTS).filter(function (d) {
      return fs.existsSync(path.join(DRAFTS, d, 'script.html'));
    }).sort();
  }

  // 封存名單只在 --all 生效；名單本身有問題就直接失敗，不跑任何篇
  const baseline = allMode ? loadBaseline(ROOT, 'compute-probe') : { ids: new Set(), errors: [] };
  if (baseline.errors.length) {
    baseline.errors.forEach(function (e) { console.log('x legacy-baseline: ' + e); });
    process.exitCode = 1;
    return;
  }

  // 名單內的篇：失敗 → SKIP 不計；通過 → STALE 計失敗
  function settle(id, ok, note) {
    if (!baseline.ids.has(id)) return { id: id, ok: ok, tag: ok ? 'PASS ' : 'FAIL ', note: note };
    if (ok) return { id: id, ok: false, tag: 'STALE', note: '已全過，請從 legacy-baseline.json 移除｜' + note };
    return { id: id, ok: true, tag: 'SKIP ', note: 'baseline，原本會敗：' + note };
  }

  const summary = [];
  for (const id of ids) {
    const r = probe(id);
    if (r.fatal) {
      const s = settle(id, false, r.fatal.slice(0, 60));
      console.log('\n### ' + id + '\n  ' + (s.ok ? '~ SKIP(baseline)' : 'x SKIP/FAIL') + ' — ' + r.fatal);
      summary.push(s);
      continue;
    }
    const allOk = r.groups.every(function (g) { return g.ok; });
    const s = settle(id, allOk, r.groups.map(function (g) {
      return (g.entry || '?') + (g.fatal ? ' FATAL' : ' ' + g.responsive.length + ' 輸出' + (g.deadParams.length ? '/死參數 ' + g.deadParams.join('+') : ''));
    }).join('｜'));
    const head = s.tag === 'STALE' ? 'OK 通過   x STALE：已全過，請從 legacy-baseline.json 移除'
      : s.tag === 'SKIP ' ? '~ SKIP(baseline)，原本會敗'
      : (allOk ? 'OK 通過' : 'x 未過');
    console.log('\n### ' + id + '   ' + head +
      '（' + r.groups.length + ' 組 @probe；檔內 compute 函式：' + r.names.join(', ') + '）');
    r.groups.forEach(function (g, i) {
      if (g.fatal) { console.log('  [' + (i + 1) + '] ' + (g.entry || '?') + '  x ' + g.fatal); return; }
      console.log('  [' + (i + 1) + '] ' + g.entry + '  ' + (g.ok ? 'OK' : 'x 未過'));
      for (const row of g.results) {
        console.log('      ' + (row.ok ? 'v' : 'x') + ' 參數 ' + row.key);
        row.tried.forEach(function (t) { console.log('          ' + t); });
      }
      console.log('      會反應的輸出 ' + g.responsive.length + ' 個（門檻 ' + MIN_RESPONSIVE_OUTPUTS + '）：' +
        g.responsive.slice(0, 10).join(', ') + (g.responsive.length > 10 ? ' …' : ''));
      if (g.deadParams.length) console.log('      x 死參數（改了什麼都不變）：' + g.deadParams.join(', '));
    });
    summary.push(s);
  }

  console.log('\n' + '='.repeat(96));
  for (const s of summary) {
    console.log(s.tag + ' ' + s.id + '  —  ' + s.note);
  }
  if (allMode) {
    const skipped = summary.filter(function (s) { return s.tag === 'SKIP '; }).length;
    const stale = summary.filter(function (s) { return s.tag === 'STALE'; }).map(function (s) { return s.id; });
    console.log('\nlegacy-baseline：SKIP ' + skipped + ' 篇' +
      (stale.length ? '；STALE ' + stale.length + ' 篇（' + stale.join(', ') + '）' : ''));
  }
  process.exitCode = summary.every(function (s) { return s.ok; }) ? 0 : 1;
}

main();
