#!/usr/bin/env node
/**
 * archetype-window.js — 檢查「不得與最近 3 篇撞形」這條規則
 *
 * 規則的判讀單位是「發佈序上連續 4 篇」：任一 4 連續視窗內不得有兩篇同 archetype。
 * 撞形只看**主** archetype（宣告中的第一個代號；次 demo 不計入）。
 *
 * archetype 的唯一來源是各篇 drafts/<id>/content.html 開頭的 demo-archetype 宣告，
 * 發佈序來自 completed-ledger.js，本工具不維護任何額外的對照表。
 *
 * 用法：
 *   node scripts/quality/archetype-window.js                    # 全站報告；有任何違規即 exit 1
 *   node scripts/quality/archetype-window.js --topic <id>       # 閘門：只判定含 <id> 的視窗
 *                                                               #   <id> 尚未發佈 → 視為下一篇接在最新之後
 *   node scripts/quality/archetype-window.js --plan plan.json   # 以 plan 覆蓋宣告，試算重新分配
 *
 * plan.json 格式：{ "<topic-id>": "A" | "B" | ... | "?" }
 *   "?" = 尚未判讀，視為 wildcard（不會觸發違規，但會被標為未知風險）
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readPrimaryArchetypes } = require('./lib/draft');

const ROOT = process.env.SDED_ROOT || path.resolve(__dirname, '..', '..');
const DRAFTS = path.join(ROOT, 'drafts');
const WINDOW = 4;

function publicationOrder() {
  const out = execFileSync(process.execPath,
    [path.join(ROOT, 'scripts', 'completed-ledger.js'), '--action', 'get-recent', '--limit', '100000'],
    { cwd: ROOT, encoding: 'utf8' });
  const j = JSON.parse(out);
  // CLI 回傳由新到舊；轉成由舊到新（發佈序 1 = 最早）
  return j.recent_topics.slice().reverse().map(function (t) {
    return { id: t.id, at: t.completed_at };
  });
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  if (i === -1) return null;
  const v = args[i + 1];
  if (!v || v.indexOf('--') === 0) {
    console.error('錯誤：' + flag + ' 需要一個值');
    process.exit(1);
  }
  return v;
}

function findViolations(seq) {
  const violations = [];
  for (let i = 0; i + WINDOW <= seq.length; i += 1) {
    const win = seq.slice(i, i + WINDOW);
    const byCode = {};
    win.forEach(function (w) {
      if (w.unknown) return;
      if (!byCode[w.code]) byCode[w.code] = [];
      byCode[w.code].push(w);
    });
    Object.keys(byCode).forEach(function (code) {
      if (byCode[code].length < 2) return;
      const key = code + ':' + byCode[code].map(function (w) { return w.pos; }).join(',');
      if (violations.some(function (v) { return v.key === key; })) return;
      violations.push({
        key: key,
        code: code,
        ids: byCode[code].map(function (w) { return w.id; }),
        members: byCode[code].map(function (w) { return w.pos + ' ' + w.id; }),
        window: win[0].pos + '–' + win[win.length - 1].pos,
      });
    });
  }
  return violations;
}

// 未知風險：視窗內同時有已定與未知
function findRiskWindows(seq) {
  const riskWindows = [];
  for (let i = 0; i + WINDOW <= seq.length; i += 1) {
    const win = seq.slice(i, i + WINDOW);
    const unknowns = win.filter(function (w) { return w.unknown; });
    const knowns = win.filter(function (w) { return !w.unknown; });
    if (unknowns.length && knowns.length) {
      riskWindows.push({
        window: win[0].pos + '–' + win[win.length - 1].pos,
        unknown: unknowns.map(function (w) { return w.id; }),
        known: knowns.map(function (w) { return w.code + ' ' + w.id; }),
      });
    }
  }
  return riskWindows;
}

function main() {
  const args = process.argv.slice(2);
  const planPath = argValue(args, '--plan');
  const topic = argValue(args, '--topic');
  const plan = planPath ? JSON.parse(fs.readFileSync(planPath, 'utf8')) : {};
  const declared = readPrimaryArchetypes(DRAFTS);

  const order = publicationOrder();
  const published = order.some(function (t) { return t.id === topic; });
  if (topic && !published) {
    if (!(topic in declared)) {
      console.error('錯誤：找不到 drafts/' + topic + '/content.html，也不在已發佈清單中');
      process.exit(1);
    }
    order.push({ id: topic, at: '(下一篇)' });
  }

  const seq = order.map(function (t, i) {
    const planned = plan[t.id];
    const current = declared[t.id];
    const code = planned || current || '?';
    return {
      pos: i + 1,
      id: t.id,
      at: t.at,
      code: code,
      changed: !!(planned && current && planned !== current),
      unknown: code === '?',
    };
  });

  const violations = findViolations(seq);
  const riskWindows = findRiskWindows(seq);

  console.log('# 發佈序 × 主 archetype（* = plan 變更，? = 無宣告或尚未判讀）\n');
  seq.slice().reverse().forEach(function (w) {
    console.log(String(w.pos).padStart(3) + '  ' + w.at + '  ' + w.code +
      (w.changed ? '*' : ' ') + '  ' + w.id + (w.id === topic ? '   <-- --topic' : ''));
  });

  const dist = {};
  seq.forEach(function (w) { dist[w.code] = (dist[w.code] || 0) + 1; });
  console.log('\n# 分佈');
  Object.keys(dist).sort().forEach(function (k) { console.log('  ' + k + ' × ' + dist[k]); });

  // 下一篇（接在已發佈序列最新之後）不可用的主 archetype
  const publishedSeq = seq.filter(function (w) { return !(topic && !published && w.id === topic); });
  const lastThree = publishedSeq.slice(-(WINDOW - 1));
  const blocked = lastThree.filter(function (w) { return !w.unknown; }).map(function (w) { return w.code; });
  console.log('\n# 下一篇不可用的主 archetype（最近 ' + (WINDOW - 1) + ' 篇）');
  console.log('  ' + (blocked.length ? Array.from(new Set(blocked)).sort().join(' ') : '無') + '   ← ' +
    lastThree.map(function (w) { return w.code + ' ' + w.id; }).join(', '));

  console.log('\n# 撞形違規（4 連續視窗內同形）');
  if (!violations.length) console.log('  無');
  violations.forEach(function (v) {
    console.log('  x 視窗 ' + v.window + ' 內 ' + v.code + ' 重複：' + v.members.join('  |  '));
  });

  console.log('\n# 未知風險視窗數：' + riskWindows.length + '（含無宣告的鄰居，補上宣告後須重跑）');
  riskWindows.slice(0, 12).forEach(function (r) {
    console.log('  ~ 視窗 ' + r.window + ' 已定[' + r.known.join(', ') + '] 未知[' + r.unknown.join(', ') + ']');
  });
  if (riskWindows.length > 12) console.log('  …（其餘 ' + (riskWindows.length - 12) + ' 個省略）');

  if (!topic) {
    process.exitCode = violations.length ? 1 : 0;
    return;
  }

  // 閘門模式：只看牽涉 --topic 的違規；--topic 本身沒有宣告也算不通過
  const self = seq.find(function (w) { return w.id === topic; });
  const mine = violations.filter(function (v) { return v.ids.indexOf(topic) !== -1; });
  console.log('\n# --topic ' + topic + '（主 archetype ' + self.code + '）');
  if (self.unknown) {
    console.log('  x 沒有可判讀的 demo-archetype 宣告');
  } else if (mine.length) {
    mine.forEach(function (v) { console.log('  x 與 ' + v.members.join('、') + ' 撞形（視窗 ' + v.window + '）'); });
  } else {
    console.log('  v 不與相鄰 ' + (WINDOW - 1) + ' 篇撞形');
  }
  process.exitCode = (self.unknown || mine.length) ? 1 : 0;
}

main();
