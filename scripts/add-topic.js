#!/usr/bin/env node

/**
 * add-topic.js — 低風險的「新主題」寫入工具 (前段選題/圖譜維護)
 *
 * 將一個新主題寫入 docs/mindmap.json (nodes + edges) 與 docs/todo.json，
 * 避免 Agent 直接全量讀寫大型 JSON 造成的 token 浪費與解析錯誤。
 * 若 --category 是尚未登記的新分類，會一併寫進分類登記表 docs/categories.json（需帶 --domain）。
 *
 * 寫入安全性：每個檔以 temp+rename 做「單檔原子寫入」；對 categories → mindmap → todo 這組
 * 多檔寫入採「任一步失敗就回滾已寫入的檔」，達成「全有或全無」。
 * 寫入後請務必執行 `node scripts/validate.js` 驗證結構一致性 (含懸空邊與 prerequisite 環)，
 * 並執行 `node scripts/reindex-home.js` 重繪首頁學習地圖。
 *
 * 用法:
 *   node scripts/add-topic.js \
 *     --id <topic-id> --title "標題" --category "分類" [--domain <domain-id>] \
 *     [--prereq id1,id2] [--related id3,id4] [--brief "撰文重點"] [--no-todo] [--dry-run]
 *
 * 旗標說明:
 *   --id        新主題的 kebab-case id (同時作為 drafts/<id>/ 與 books/<id>/ 資料夾名)
 *   --title     主題標題 (顯示用，可含中英文)
 *   --category  必填。分類 (例: "Distributed Transactions"、"Caching")。
 *               已登記的分類：直接使用；可用 `node scripts/mindmap.js --action list-categories` 查詢。
 *               未登記的新分類：必須同時帶 --domain，成功時會寫進 docs/categories.json。
 *   --domain    分類所屬領域 id（須已存在於 docs/categories.json 的 domains）。
 *               分類已登記時可省略；有給就必須和登記值一致。
 *   --prereq    逗號分隔的「先備主題」node id 清單 → 產生 edge { from: prereq, to: id, type: 'prerequisite' }
 *   --related   逗號分隔的「關聯主題」node id 清單 → 產生 edge { from: id, to: related, type: 'related' }
 *   --brief     選填。加入 todo 時一併寫入的 per-topic 撰文指引（2-3 句即可）；僅內容取向，不涉及版面格式
 *   --no-todo   只加進 mindmap，不加進 todo.json (預設會同時加入 todo)
 *   --dry-run   只印出將會發生的變更，不實際寫檔
 *
 * 注意: --prereq / --related 引用的 id 必須是「已存在的 node」或「本次正在新增的 id」，
 *       否則腳本會中止，以避免產生懸空邊 (dangling edge)。
 */

const fs = require('fs');
const path = require('path');
const { writeJSONAtomic } = require('./lib/atomic');
const {
  CATEGORIES_PATH,
  readCategoryRegistry,
  validateCategoryRegistry,
  buildCategoryIndex,
  withCategory,
} = require('./lib/categories');

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

const USAGE = '--id <topic-id> --title "標題" --category "分類" [--domain <domain-id>] [--prereq a,b] [--related c,d] [--brief "撰文重點"] [--no-todo] [--dry-run]';

/**
 * 依 §決策 15／17 解析 --category / --domain 與登記表的關係。
 * @returns {{ registry: object, nextRegistry: object|null, domain: string }}
 *   nextRegistry 為 null 代表登記表不需變更；否則為插入新分類後的登記表副本。
 */
function resolveCategoryRegistration(category, domainArg) {
  let registry;
  try {
    registry = readCategoryRegistry();
  } catch (e) {
    fail(e.message);
  }
  const registryErrors = validateCategoryRegistry(registry);
  if (registryErrors.length) {
    fail(`docs/categories.json 格式有誤，請先修正：\n  - ${registryErrors.join('\n  - ')}`);
  }

  const index = buildCategoryIndex(registry);
  const domain = typeof domainArg === 'string' ? domainArg.trim() : '';
  const registered = index.categoryByName.get(category);

  if (registered) {
    if (domain && domain !== registered.domain) {
      fail(`分類 "${category}" 已登記於領域 "${registered.domain}"，與 --domain "${domain}" 不一致。要調整分類所屬領域請直接編輯 docs/categories.json。`);
    }
    return { registry, nextRegistry: null, domain: registered.domain };
  }

  const knownDomains = index.domains.map((d) => d.id).join(', ');
  if (!domain) {
    fail(`分類 "${category}" 尚未登記，新增分類必須帶 --domain <domain-id>（可選：${knownDomains}）。已登記的分類可用 node scripts/mindmap.js --action list-categories 查詢。`);
  }
  if (!index.domainById.has(domain)) {
    fail(`--domain "${domain}" 不存在於 docs/categories.json（可選：${knownDomains}）。新增領域請直接編輯該檔。`);
  }
  return { registry, nextRegistry: withCategory(registry, { name: category, domain }), domain };
}

function main() {
  const args = parseArgs(process.argv);
  const { id, title } = args;
  const category = typeof args.category === 'string' ? args.category.trim() : '';

  if (!id || !title || !category) {
    fail(`必填參數缺失（--id、--title、--category 皆必填）。用法: ${USAGE}`);
  }
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) {
    fail(`id "${id}" 不是合法的 kebab-case (僅允許小寫英數與連字號)。`);
  }

  const mindmapPath = path.join(ROOT, 'docs', 'mindmap.json');
  const todoPath = path.join(ROOT, 'docs', 'todo.json');
  const completedPath = path.join(ROOT, 'docs', 'completed.json');

  const { nextRegistry, domain } = resolveCategoryRegistration(category, args.domain);

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

  const brief = typeof args.brief === 'string' ? args.brief.trim() : '';
  if (args.brief !== undefined && args.brief !== true && !brief) {
    fail('--brief 若提供，必須是非空字串。');
  }

  const newNode = { id, title, category };
  const todoEntry = brief ? { ...newNode, brief } : { ...newNode };
  const newEdges = [
    ...prereqs.map((from) => ({ from, to: id, type: 'prerequisite' })),
    ...relateds.map((to) => ({ from: id, to, type: 'related' })),
  ];
  const addTodo = !args['no-todo'] && !todoIds.has(id) && !completedIds.has(id);

  const registryChange = nextRegistry ? { add_category: { name: category, domain } } : null;

  if (args['dry-run']) {
    console.log(JSON.stringify({
      dry_run: true,
      project_root: ROOT,
      category_domain: domain,
      registry_change: registryChange,
      add_node: newNode,
      add_edges: newEdges,
      add_to_todo: addTodo ? todoEntry : null,
    }, null, 2));
    return;
  }

  // ---- 寫入 (多檔原子 + 回滾) ----
  // 順序：categories.json（有變更時）→ mindmap.json → todo.json。
  // 每寫一檔前先記下原始位元組；任一步失敗就以相反順序還原已寫入的檔，確保「全有或全無」。
  const written = []; // [{ filePath, backup }]，backup 為 null 代表原本不存在

  function writeWithRollback(filePath, data, label) {
    const backup = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : null;
    try {
      writeJSONAtomic(filePath, data);
      written.push({ filePath, backup });
    } catch (e) {
      written.reverse().forEach(({ filePath: writtenPath, backup: writtenBackup }) => {
        if (writtenBackup !== null) {
          fs.writeFileSync(writtenPath, writtenBackup, 'utf8');
        } else if (fs.existsSync(writtenPath)) {
          fs.unlinkSync(writtenPath); // 原本不存在 → 還原為不存在
        }
      });
      const rolledBack = written.map(({ filePath: p }) => path.basename(p)).join(', ') || '（無）';
      fail(`寫入 ${label} 失敗，已回滾 ${rolledBack}：${e.message}`);
    }
  }

  if (nextRegistry) {
    writeWithRollback(CATEGORIES_PATH, nextRegistry, 'categories.json');
  }

  mindmap.nodes.push(newNode);
  mindmap.edges.push(...newEdges);
  writeWithRollback(mindmapPath, mindmap, 'mindmap.json');

  if (addTodo) {
    todo.push(todoEntry);
    writeWithRollback(todoPath, todo, 'todo.json');
  }

  console.log(JSON.stringify({
    ok: true,
    category_domain: domain,
    registry_change: registryChange,
    added_node: newNode,
    added_edges: newEdges,
    added_to_todo: addTodo,
    next_step: '請執行 `node scripts/validate.js` 驗證結構一致性，再執行 `node scripts/reindex-home.js` 重繪首頁。',
  }, null, 2));
}

main();
