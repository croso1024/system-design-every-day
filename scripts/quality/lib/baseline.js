/**
 * baseline.js — 舊 demo 的封存名單（legacy baseline）
 *
 * 名單檔：scripts/quality/legacy-baseline.json，依腳本分兩份 id：
 *   { "demo-audit": [...], "compute-probe": [...] }
 *
 * 用途只有一個：讓早於 compute／render 約定的舊文在 `--all` 模式下不擋全站，
 * 以便把閘門放進 CI。語意如下（demo-audit.js 與 compute-probe.js 都遵守）：
 *   - 只在 `--all` 模式生效；單篇模式完全忽略名單。
 *   - 名單內的篇仍然會跑檢查，失敗時印成 SKIP(baseline)，不計入失敗。
 *   - 名單內的篇若已全過 → 視為 stale，exit 1（名單只能縮小）。
 *   - 名單檔不存在或該份為空 → 行為與沒有名單完全相同。
 *
 * 防止新篇被塞進名單的機械檢查（任一不符即 exit 1）：
 *   - 每個 id 都必須有 drafts/<id>/，且在 docs/completed.json 裡。
 *   - completed_at 不得晚於 LEGACY_CUTOFF。新篇的日期一定是發佈當天，
 *     而在 generate 之前它根本還不在 completed 裡，兩種情況都會被擋。
 *     要放寬只能改這個常數，那是「改規則」，diff 上一目了然。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const LEGACY_CUTOFF = '2026-07-31';
const BASELINE_FILE = 'legacy-baseline.json';

/**
 * @param {string} root        專案根目錄（尊重 SDED_ROOT）
 * @param {string} scriptKey   'demo-audit' | 'compute-probe'
 * @returns {{ ids: Set<string>, errors: string[], cutoff: string }}
 */
function loadBaseline(root, scriptKey) {
  const file = path.join(root, 'scripts', 'quality', BASELINE_FILE);
  const out = { ids: new Set(), errors: [], cutoff: LEGACY_CUTOFF };
  if (!fs.existsSync(file)) return out;

  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    out.errors.push(BASELINE_FILE + ' 不是合法 JSON：' + e.message);
    return out;
  }
  const list = json[scriptKey];
  if (list == null) return out;
  if (!Array.isArray(list) || list.some(function (x) { return typeof x !== 'string'; })) {
    out.errors.push(BASELINE_FILE + ' 的 "' + scriptKey + '" 必須是字串陣列');
    return out;
  }
  if (!list.length) return out;

  const completedById = readCompleted(root, out.errors);
  const seen = new Set();
  list.forEach(function (id) {
    if (seen.has(id)) { out.errors.push('名單重複：' + id); return; }
    seen.add(id);
    if (!fs.existsSync(path.join(root, 'drafts', id))) {
      out.errors.push('名單內的 ' + id + ' 沒有 drafts/' + id + '/');
      return;
    }
    const entry = completedById ? completedById[id] : null;
    if (!entry) {
      out.errors.push('名單內的 ' + id + ' 不在 docs/completed.json（名單只封存已發佈的舊文）');
      return;
    }
    if (typeof entry.completed_at !== 'string' || entry.completed_at > LEGACY_CUTOFF) {
      out.errors.push('名單內的 ' + id + ' 發佈於 ' + entry.completed_at +
        '，晚於封存截止日 ' + LEGACY_CUTOFF + '（新篇不得加入名單）');
      return;
    }
    out.ids.add(id);
  });
  return out;
}

function readCompleted(root, errors) {
  const file = path.join(root, 'docs', 'completed.json');
  if (!fs.existsSync(file)) {
    errors.push('名單非空但讀不到 docs/completed.json');
    return null;
  }
  let arr;
  try {
    arr = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push('docs/completed.json 不是合法 JSON：' + e.message);
    return null;
  }
  if (!Array.isArray(arr)) { errors.push('docs/completed.json 必須是陣列'); return null; }
  const byId = {};
  arr.forEach(function (t) { if (t && typeof t.id === 'string') byId[t.id] = t; });
  return byId;
}

module.exports = { loadBaseline, LEGACY_CUTOFF, BASELINE_FILE };
