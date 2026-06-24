#!/usr/bin/env node

/**
 * add-topic.js — 低風險的「新主題」寫入工具 (前段選題/圖譜維護)
 *
 * 將一個新主題寫入 docs/mindmap.json (nodes + edges) 與 docs/todo.json，
 * 避免 Agent 直接全量讀寫大型 JSON 造成的 token 浪費與解析錯誤。
 *
 * 寫入安全性：每個檔以 temp+rename 做「單檔原子寫入」；對 mindmap + todo 這對「雙檔」
 * 採「先寫 mindmap、todo 寫入失敗則回滾 mindmap」，達成兩檔「全有或全無」。
 * 寫入後請務必執行 `node scripts/validate.js` 驗證結構一致性 (含懸空邊與 prerequisite 環)。
 *
 * 用法:
 *   node scripts/add-topic.js \
 *     --id <topic-id> --title "標題" --category "分類" \
 *     [--prereq id1,id2] [--related id3,id4] [--no-todo] [--dry-run]
 *
 * 旗標說明:
 *   --id        新主題的 kebab-case id (同時作為 drafts/<id>/ 與 books/<id>/ 資料夾名)
 *   --title     主題標題 (顯示用，可含中英文)
 *   --category  分類 (例: "Distributed Transactions"、"Caching")
 *   --prereq    逗號分隔的「先備主題」node id 清單 → 產生 edge { from: prereq, to: id, type: 'prerequisite' }
 *   --related   逗號分隔的「關聯主題」node id 清單 → 產生 edge { from: id, to: related, type: 'related' }
 *   --no-todo   只加進 mindmap，不加進 todo.json (預設會同時加入 todo)
 *   --dry-run   只印出將會發生的變更，不實際寫檔
 *
 * 注意: --prereq / --related 引用的 id 必須是「已存在的 node」或「本次正在新增的 id」，
 *       否則腳本會中止，以避免產生懸空邊 (dangling edge)。
 */

const fs = require('fs');
const path = require('path');
const { writeJSONAtomic } = require('./lib/atomic');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function fail(message) {
  console.error(`[add-topic] ERROR: ${message}`);
  process.exit(1);
}

function readJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    fail(`${path.basename(filePath)} 解析失敗（檔案可能損壞）：${e.message}`);
  }
  return fallback; // 不會執行到 (fail 會 exit)，純為靜態分析完整性
}

function splitList(value) {
  if (!value || value === true) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv);
  const { id, title } = args;
  const category = args.category || 'General';

  if (!id || !title) {
    fail('必填參數缺失。用法: --id <topic-id> --title "標題" [--category "分類"] [--prereq a,b] [--related c,d] [--no-todo] [--dry-run]');
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    fail(`id "${id}" 不是合法的 kebab-case (僅允許小寫英數與連字號)。`);
  }

  const mindmapPath = path.join(ROOT, 'docs', 'mindmap.json');
  const todoPath = path.join(ROOT, 'docs', 'todo.json');
  const completedPath = path.join(ROOT, 'docs', 'completed.json');

  const mindmap = readJSON(mindmapPath, { nodes: [], edges: [] });
  const todo = readJSON(todoPath, []);
  const completed = readJSON(completedPath, []);

  mindmap.nodes = mindmap.nodes || [];
  mindmap.edges = mindmap.edges || [];

  const nodeIds = new Set(mindmap.nodes.map((n) => n.id));
  const completedIds = new Set(completed.map((c) => c.id));
  const todoIds = new Set(todo.map((t) => t.id));

  if (nodeIds.has(id)) fail(`node id "${id}" 已存在於 mindmap.json，請改用不同 id 或先移除舊節點。`);

  const prereqs = splitList(args.prereq);
  const relateds = splitList(args.related);

  // 引用完整性檢查: prereq / related 必須是已存在節點或本次新增的 id
  const knownAfterInsert = new Set([...nodeIds, id]);
  for (const p of prereqs) {
    if (!knownAfterInsert.has(p)) fail(`--prereq 引用的節點 "${p}" 不存在於 mindmap。請先建立該節點或修正 id。`);
    if (p === id) fail('--prereq 不可指向自己 (會形成自環)。');
  }
  for (const r of relateds) {
    if (!knownAfterInsert.has(r)) fail(`--related 引用的節點 "${r}" 不存在於 mindmap。請先建立該節點或修正 id。`);
    if (r === id) fail('--related 不可指向自己。');
  }

  const newNode = { id, title, category };
  const newEdges = [
    ...prereqs.map((from) => ({ from, to: id, type: 'prerequisite' })),
    ...relateds.map((to) => ({ from: id, to, type: 'related' })),
  ];
  const addTodo = !args['no-todo'] && !todoIds.has(id) && !completedIds.has(id);

  if (args['dry-run']) {
    console.log(JSON.stringify({
      dry_run: true,
      project_root: ROOT,
      add_node: newNode,
      add_edges: newEdges,
      add_to_todo: addTodo ? newNode : null,
    }, null, 2));
    return;
  }

  // ---- 寫入 (雙檔原子 + 回滾) ----
  // 先記下 mindmap.json 的原始位元組，作為 todo 寫入失敗時的回滾依據。
  const mindmapBackup = fs.existsSync(mindmapPath) ? fs.readFileSync(mindmapPath, 'utf8') : null;

  mindmap.nodes.push(newNode);
  mindmap.edges.push(...newEdges);
  writeJSONAtomic(mindmapPath, mindmap);

  if (addTodo) {
    try {
      todo.push(newNode);
      writeJSONAtomic(todoPath, todo);
    } catch (e) {
      // todo 寫入失敗 → 還原 mindmap，確保兩檔「全有或全無」。
      if (mindmapBackup !== null) {
        fs.writeFileSync(mindmapPath, mindmapBackup, 'utf8');
      } else if (fs.existsSync(mindmapPath)) {
        fs.unlinkSync(mindmapPath); // 原本不存在 → 還原為不存在
      }
      fail(`寫入 todo.json 失敗，已回滾 mindmap.json：${e.message}`);
    }
  }

  console.log(JSON.stringify({
    ok: true,
    added_node: newNode,
    added_edges: newEdges,
    added_to_todo: addTodo,
    next_step: '請執行 `node scripts/validate.js` 驗證結構一致性。',
  }, null, 2));
}

main();
