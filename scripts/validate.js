#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TODO_PATH = path.join(ROOT, 'docs', 'todo.json');
const COMPLETED_PATH = path.join(ROOT, 'docs', 'completed.json');
const MINDMAP_PATH = path.join(ROOT, 'docs', 'mindmap.json');
const BOOKS_INDEX_PATH = path.join(ROOT, 'books', 'index.html');

let hasError = false;

function error(message) {
  console.error(`[ERROR] ${message}`);
  hasError = true;
}

function loadJSON(filePath, fileName) {
  if (!fs.existsSync(filePath)) {
    error(`File not found: ${fileName} (${filePath})`);
    return null;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    error(`Failed to parse ${fileName} as valid JSON: ${e.message}`);
    return null;
  }
}

function validateTodo(todo) {
  if (!Array.isArray(todo)) {
    error('todo.json must be a JSON Array');
    return new Set();
  }

  const ids = new Set();
  todo.forEach((item, index) => {
    const label = `todo.json[${index}]`;
    if (typeof item !== 'object' || item === null) {
      error(`${label} must be an object`);
      return;
    }

    if (typeof item.id !== 'string' || !item.id) {
      error(`${label} is missing a valid 'id' (string)`);
    } else {
      if (ids.has(item.id)) {
        error(`Duplicate id found in todo.json: "${item.id}"`);
      }
      ids.add(item.id);
    }

    if (typeof item.title !== 'string' || !item.title) {
      error(`${label} is missing a valid 'title' (string)`);
    }

    if (typeof item.category !== 'string' || !item.category) {
      error(`${label} is missing a valid 'category' (string)`);
    }

    if (item.brief !== undefined) {
      if (typeof item.brief !== 'string' || !item.brief.trim()) {
        error(`${label} has invalid 'brief' (must be a non-empty string when present)`);
      }
    }
  });

  return ids;
}

function validateCompleted(completed) {
  if (!Array.isArray(completed)) {
    error('completed.json must be a JSON Array');
    return new Set();
  }

  const ids = new Set();
  completed.forEach((item, index) => {
    const label = `completed.json[${index}]`;
    if (typeof item !== 'object' || item === null) {
      error(`${label} must be an object`);
      return;
    }

    if (typeof item.id !== 'string' || !item.id) {
      error(`${label} is missing a valid 'id' (string)`);
    } else {
      if (ids.has(item.id)) {
        error(`Duplicate id found in completed.json: "${item.id}"`);
      }
      ids.add(item.id);
    }

    if (typeof item.title !== 'string' || !item.title) {
      error(`${label} is missing a valid 'title' (string)`);
    }

    if (typeof item.category !== 'string' || !item.category) {
      error(`${label} is missing a valid 'category' (string)`);
    }

    if (typeof item.completed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.completed_at)) {
      error(`${label} has invalid completed_at "${item.completed_at}" (must match YYYY-MM-DD)`);
    }

    if (typeof item.path !== 'string' || !item.path) {
      error(`${label} is missing a valid 'path' (string)`);
    } else {
      const fullPath = path.join(ROOT, item.path);
      if (!fs.existsSync(fullPath)) {
        error(`${label} points to a non-existent file path: "${item.path}" (resolved: ${fullPath})`);
      }
    }
  });

  return ids;
}

/**
 * completed / todo 互斥檢查：同一個 id 不可同時存在於兩個檔。
 * 錯誤訊息帶 fail-safe 提示，因為「剛 generate 完尚未 remove-todo」是已知的中間狀態。
 */
function validateMutualExclusion(todoIds, completedIds) {
  if (!todoIds || !completedIds) return;
  todoIds.forEach(id => {
    if (completedIds.has(id)) {
      error(
        `Topic "${id}" 同時存在於 todo.json 與 completed.json。` +
        `若你剛跑完 generate.js 尚未 remove-todo，這是預期的中間狀態——` +
        `請先執行 node scripts/remove-todo.js --topic ${id} 再驗證。`
      );
    }
  });
}

/**
 * books/index.html ↔ completed.json 一致性檢查。
 * 首頁卡片與 completed 條目 1:1 對應，故比對「卡片 href 集合」即可偵測首頁過時：
 * 例如 remove-completed.js --no-reindex 後尚未補重繪、或 generate/撤回中途寫檔失敗。
 * 只取卡片 href 作為訊號（不解析 Mermaid 節點狀態——後者過於脆弱且與卡片同源於 completed）。
 *
 * 注意：下方 cardRegex 與 lib/books.js 的 buildBooksIndexHtml 卡片模板「耦合」；
 *       若日後更動卡片 anchor 的 HTML 結構，必須同步更新此 regex，否則會誤報。
 */
function validateBooksIndexConsistency(completed) {
  // 期望的 href 集合：與 buildBooksIndexHtml 同邏輯——item.path 去掉開頭 books/。
  const expected = new Set(
    completed
      .filter((item) => item && typeof item.path === 'string')
      .map((item) => item.path.replace(/^books\//, ''))
  );

  if (!fs.existsSync(BOOKS_INDEX_PATH)) {
    if (expected.size === 0) return; // 尚未發佈任何主題且首頁未生成 → 合法
    error(`books/index.html 不存在，但 completed.json 有 ${expected.size} 筆主題。請執行 node scripts/generate.js 重新生成首頁。`);
    return;
  }

  const html = fs.readFileSync(BOOKS_INDEX_PATH, 'utf8');
  // 鎖定卡片 anchor（class 以 "block rounded-xl" 起頭），避免誤抓 preconnect 等其他連結。
  const actual = new Set();
  const cardRegex = /<a\s+href="([^"]+)"\s+class="block rounded-xl/g;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    actual.add(match[1]);
  }

  // completed 有、首頁缺 → 首頁漏渲染（過時）。
  expected.forEach((href) => {
    if (!actual.has(href)) {
      error(`books/index.html 缺少 completed.json 主題卡片 "${href}"（首頁過時，請重跑 generate.js 或補重繪首頁）。`);
    }
  });
  // 首頁有、completed 無 → 殘留已撤回主題（多半是 remove-completed.js --no-reindex 後未補重繪）。
  actual.forEach((href) => {
    if (!expected.has(href)) {
      error(`books/index.html 殘留卡片 "${href}"，但其不在 completed.json（若剛用 remove-completed.js --no-reindex，請補重繪首頁後再驗證）。`);
    }
  });
}

/**
 * prerequisite 邊環偵測 (DFS 三色法)。
 * 只取 type==='prerequisite' 的邊建圖——related 邊方向是任意的，納入會大量誤報。
 * 顏色：undefined=未訪、1=訪問中(在遞迴堆疊)、2=完成。
 * 同一個環可能從多個起點抵達，用 reported 以「環上節點集合」為 key 去重，避免洗版。
 */
function detectPrerequisiteCycles(nodeIds, edges) {
  const adj = new Map();
  nodeIds.forEach(id => adj.set(id, []));
  edges
    .filter(e => e.type === 'prerequisite' && nodeIds.has(e.from) && nodeIds.has(e.to))
    .forEach(e => { adj.get(e.from).push(e.to); });

  const color = new Map();
  const reported = new Set();

  function dfs(u, stack) {
    color.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u)) {
      if (color.get(v) === 1) {
        // 從 stack 中 v 第一次出現處切到末端，再補 v 收尾，即為環路徑。
        const cyclePath = stack.slice(stack.indexOf(v)).concat(v);
        const key = cyclePath.slice(0, -1).slice().sort().join('|');
        if (!reported.has(key)) {
          reported.add(key);
          error(`偵測到 prerequisite 循環依賴: ${cyclePath.join(' -> ')}`);
        }
      } else if (color.get(v) === undefined) {
        dfs(v, stack);
      }
    }
    stack.pop();
    color.set(u, 2);
  }

  nodeIds.forEach(id => {
    if (color.get(id) === undefined) dfs(id, []);
  });
}

function validateMindmap(mindmap, todoIds, completedIds) {
  if (typeof mindmap !== 'object' || mindmap === null || Array.isArray(mindmap)) {
    error('mindmap.json must be a JSON Object');
    return;
  }

  const nodes = mindmap.nodes;
  const edges = mindmap.edges;

  if (!Array.isArray(nodes)) {
    error('mindmap.json must contain a "nodes" Array');
    return;
  }

  if (!Array.isArray(edges)) {
    error('mindmap.json must contain an "edges" Array');
    return;
  }

  const nodeIds = new Set();
  nodes.forEach((node, index) => {
    const label = `mindmap.json nodes[${index}]`;
    if (typeof node !== 'object' || node === null) {
      error(`${label} must be an object`);
      return;
    }

    if (typeof node.id !== 'string' || !node.id) {
      error(`${label} is missing a valid 'id' (string)`);
    } else {
      if (nodeIds.has(node.id)) {
        error(`Duplicate node id found in mindmap.json nodes: "${node.id}"`);
      }
      nodeIds.add(node.id);
    }

    if (typeof node.title !== 'string' || !node.title) {
      error(`${label} is missing a valid 'title' (string)`);
    }

    if (typeof node.category !== 'string' || !node.category) {
      error(`${label} is missing a valid 'category' (string)`);
    }
  });

  edges.forEach((edge, index) => {
    const label = `mindmap.json edges[${index}]`;
    if (typeof edge !== 'object' || edge === null) {
      error(`${label} must be an object`);
      return;
    }

    if (typeof edge.from !== 'string' || !edge.from) {
      error(`${label} is missing a valid 'from' (string)`);
    } else if (!nodeIds.has(edge.from)) {
      error(`${label} has 'from' pointing to non-existent node: "${edge.from}"`);
    }

    if (typeof edge.to !== 'string' || !edge.to) {
      error(`${label} is missing a valid 'to' (string)`);
    } else if (!nodeIds.has(edge.to)) {
      error(`${label} has 'to' pointing to non-existent node: "${edge.to}"`);
    }

    if (typeof edge.type !== 'string' || !edge.type) {
      error(`${label} is missing a valid 'type' (string)`);
    }
  });

  if (todoIds) {
    todoIds.forEach(todoId => {
      if (!nodeIds.has(todoId)) {
        error(`Topic "${todoId}" in todo.json is missing in mindmap.json nodes`);
      }
    });
  }

  if (completedIds) {
    completedIds.forEach(completedId => {
      if (!nodeIds.has(completedId)) {
        error(`Topic "${completedId}" in completed.json is missing in mindmap.json nodes`);
      }
    });
  }

  // prerequisite 邊不可成環 (否則「解鎖」語意失效)。此為最後防線，獨立於 add-topic 的自環攔截。
  detectPrerequisiteCycles(nodeIds, edges);
}

function main() {
  console.log('Starting system-design-every-day documents validation...');

  const todo = loadJSON(TODO_PATH, 'todo.json');
  const completed = loadJSON(COMPLETED_PATH, 'completed.json');
  const mindmap = loadJSON(MINDMAP_PATH, 'mindmap.json');

  if (todo === null || completed === null || mindmap === null) {
    console.error('\nValidation FAILED due to JSON parse errors.');
    process.exit(1);
  }

  const todoIds = validateTodo(todo);
  const completedIds = validateCompleted(completed);
  validateMindmap(mindmap, todoIds, completedIds);
  validateMutualExclusion(todoIds, completedIds);
  validateBooksIndexConsistency(completed);

  if (hasError) {
    console.error('\nValidation FAILED. Please fix the errors above.');
    process.exit(1);
  } else {
    console.log('\nValidation SUCCESS. All status tracking files are consistent and structurally sound!');
    process.exit(0);
  }
}

main();
