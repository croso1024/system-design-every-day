#!/usr/bin/env node

/**
 * add-topic.js — 低風險的「新主題」寫入工具 (Topic Explorer Skill)
 *
 * 原子化地將一個新主題寫入 docs/mindmap.json (nodes + edges) 與 docs/todo.json，
 * 避免 Agent 直接全量讀寫大型 JSON 造成的 token 浪費與解析錯誤。
 * 寫入後請務必執行 `node scripts/validate.js` 驗證結構一致性。
 *
 * 用法:
 *   node .cursor/skills/topic-explorer/scripts/add-topic.js \
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

/** 由腳本位置向上尋找含 docs/mindmap.json 的專案根目錄，避免相對深度寫死。 */
function findProjectRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i += 1) {
    if (fs.existsSync(path.join(dir, 'docs', 'mindmap.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readJSON(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function splitList(value) {
  if (!value || value === true) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function fail(message) {
  console.error(`[add-topic] ERROR: ${message}`);
  process.exit(1);
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

  const root = findProjectRoot(__dirname);
  if (!root) fail('找不到專案根目錄 (向上找不到 docs/mindmap.json)。');

  const mindmapPath = path.join(root, 'docs', 'mindmap.json');
  const todoPath = path.join(root, 'docs', 'todo.json');
  const completedPath = path.join(root, 'docs', 'completed.json');

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
      project_root: root,
      add_node: newNode,
      add_edges: newEdges,
      add_to_todo: addTodo ? newNode : null,
    }, null, 2));
    return;
  }

  mindmap.nodes.push(newNode);
  mindmap.edges.push(...newEdges);
  writeJSON(mindmapPath, mindmap);

  if (addTodo) {
    todo.push(newNode);
    writeJSON(todoPath, todo);
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
