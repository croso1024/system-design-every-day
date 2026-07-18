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
 * 從 books/index.html 抽出 embedded Learning Map JSON payload。
 *
 * ⚠️ 耦合提醒：下方 regex 綁定了 lib/books.js `buildBooksIndexHtml` 注入的
 *    `<script id="learning-map-data" type="application/json">` 之「確切屬性順序與間距」
 *    （id 在前、type 在後、單一空白）。若日後調整該 <script> 標籤的屬性順序 / 寫法，
 *    必須同步更新此 regex，否則會誤報「缺少可解析 payload」而非真正原因。
 * @returns {object|null}
 */
function extractLearningMapPayload(html) {
  const match = html.match(
    /<script\s+id="learning-map-data"\s+type="application\/json">([\s\S]*?)<\/script>/i
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch (e) {
    error(`books/index.html learning-map-data JSON 解析失敗：${e.message}`);
    return null;
  }
}

/**
 * books/index.html embedded payload ↔ completed.json 路徑一致性。
 * 首頁不再渲染靜態卡片網格；以 payload 內 completed topics 的 path 作為訊號，
 * 偵測首頁過時（例如 remove-completed.js --no-reindex 後尚未補重繪）。
 */
function validateBooksIndexConsistency(completed, mindmap) {
  const expected = new Set(
    completed
      .filter((item) => item && typeof item.path === 'string')
      .map((item) => item.path.replace(/^books\//, ''))
  );

  if (!fs.existsSync(BOOKS_INDEX_PATH)) {
    if (expected.size === 0) return;
    error(`books/index.html 不存在，但 completed.json 有 ${expected.size} 筆主題。請執行 node scripts/generate.js 重新生成首頁。`);
    return;
  }

  const html = fs.readFileSync(BOOKS_INDEX_PATH, 'utf8');
  const payload = extractLearningMapPayload(html);
  if (!payload) {
    error('books/index.html 缺少可解析的 <script id="learning-map-data" type="application/json"> payload（首頁過時或未改用 Cytoscape Learning Map，請執行 node scripts/reindex-home.js 只重繪首頁，或 generate.js / rebuild-all.js）。');
    return;
  }

  const nodeIds = new Set(
    (mindmap && Array.isArray(mindmap.nodes) ? mindmap.nodes : [])
      .filter((n) => n && typeof n.id === 'string')
      .map((n) => n.id)
  );

  const actual = new Set();
  const topics = Array.isArray(payload.topics) ? payload.topics : [];
  topics.forEach((topic) => {
    if (!topic || typeof topic.id !== 'string') return;
    if (topic.completed && typeof topic.path === 'string' && topic.path) {
      actual.add(topic.path.replace(/^books\//, ''));
    }
  });

  // 只比對「同時是 mindmap 節點」的 completed 條目（與 Learning Map 可見範圍一致）。
  const expectedOnMap = new Set(
    completed
      .filter((item) => item && typeof item.id === 'string' && nodeIds.has(item.id) && typeof item.path === 'string')
      .map((item) => item.path.replace(/^books\//, ''))
  );

  expectedOnMap.forEach((href) => {
    if (!actual.has(href)) {
      error(`books/index.html Learning Map payload 缺少 completed 路徑 "${href}"（首頁過時，請執行 node scripts/reindex-home.js 只重繪首頁，或 generate.js / rebuild-all.js）。`);
    }
  });
  actual.forEach((href) => {
    if (!expectedOnMap.has(href)) {
      error(`books/index.html Learning Map payload 殘留 completed 路徑 "${href}"，但其不在 completed.json 的 mindmap 節點集合（請執行 node scripts/reindex-home.js 重繪首頁）。`);
    }
  });
}

/**
 * books/index.html Learning Map payload 結構與狀態一致性檢查。
 * 取代舊的 Mermaid :::completed regex 安全網。
 */
function validateBooksIndexLearningMapConsistency(completed, mindmap) {
  if (!fs.existsSync(BOOKS_INDEX_PATH)) return;

  const html = fs.readFileSync(BOOKS_INDEX_PATH, 'utf8');
  const payload = extractLearningMapPayload(html);
  if (!payload) return; // 缺少 payload 已由 validateBooksIndexConsistency 報錯

  const { buildLearningMapData } = require('./mindmap');
  const expectedPayload = buildLearningMapData(completed);

  const mindmapNodes = Array.isArray(mindmap && mindmap.nodes) ? mindmap.nodes : [];
  const mindmapById = new Map(
    mindmapNodes
      .filter((n) => n && typeof n.id === 'string')
      .map((n) => [n.id, n])
  );
  const completedById = new Map(
    (Array.isArray(completed) ? completed : [])
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => [item.id, item])
  );

  const topics = Array.isArray(payload.topics) ? payload.topics : [];
  const seenIds = new Set();

  topics.forEach((topic, index) => {
    const label = `learning-map topics[${index}]`;
    if (!topic || typeof topic.id !== 'string') {
      error(`${label} 缺少有效 id`);
      return;
    }
    if (seenIds.has(topic.id)) {
      error(`${label} 重複出現 id "${topic.id}"（每個 mindmap node 必須恰好一次）`);
    }
    seenIds.add(topic.id);

    const mindNode = mindmapById.get(topic.id);
    if (!mindNode) {
      error(`${label} id "${topic.id}" 不在 mindmap.json nodes`);
      return;
    }
    if (topic.title !== mindNode.title) {
      error(`${label} title 不符：payload="${topic.title}" mindmap="${mindNode.title}"`);
    }
    if (topic.category !== mindNode.category) {
      error(`${label} category 不符：payload="${topic.category}" mindmap="${mindNode.category}"`);
    }

    const ledger = completedById.get(topic.id);
    const shouldComplete = Boolean(ledger);
    if (Boolean(topic.completed) !== shouldComplete) {
      error(`${label} completed 狀態不符 completed.json（payload=${topic.completed}, ledger=${shouldComplete}）`);
    }

    if (shouldComplete) {
      const expectedPath = (ledger.path || `${topic.id}/index.html`).replace(/^books\//, '');
      const actualPath = typeof topic.path === 'string' ? topic.path.replace(/^books\//, '') : null;
      if (actualPath !== expectedPath) {
        error(`${label} path 不符：payload="${actualPath}" expected="${expectedPath}"`);
      }
      // buildLearningMapData 對缺值 completed_at 會正規化為 null；此處兩側同樣 ?? null，
      // 避免「payload=null vs ledger=undefined」在合法但缺欄位的 ledger 上誤報。
      if ((topic.completed_at ?? null) !== (ledger.completed_at ?? null)) {
        error(`${label} completed_at 不符：payload="${topic.completed_at}" ledger="${ledger.completed_at}"`);
      }
    } else if (topic.path !== null && topic.path !== undefined) {
      error(`${label} 為 pending，但 path 不是 null（"${topic.path}"）`);
    }
  });

  mindmapById.forEach((_node, id) => {
    if (!seenIds.has(id)) {
      error(`mindmap.json 節點 "${id}" 未出現在 books/index.html Learning Map payload topics`);
    }
  });

  // Category 名稱集合一致
  const expectedCategoryNames = new Set(expectedPayload.categories.map((c) => c.name));
  const actualCategoryNames = new Set(
    (Array.isArray(payload.categories) ? payload.categories : []).map((c) => c && c.name)
  );
  expectedCategoryNames.forEach((name) => {
    if (!actualCategoryNames.has(name)) {
      error(`Learning Map payload 缺少 category "${name}"`);
    }
  });
  actualCategoryNames.forEach((name) => {
    if (name && !expectedCategoryNames.has(name)) {
      error(`Learning Map payload 出現多餘 category "${name}"`);
    }
  });

  // Category relations：比對 builder 重算的聚合結果
  function relationKey(rel) {
    return `${rel.sourceCategory}|${rel.targetCategory}|${rel.type}|${rel.count}`;
  }
  const expectedRelations = new Set(
    (expectedPayload.categoryRelations || []).map(relationKey)
  );
  const actualRelations = new Set(
    (Array.isArray(payload.categoryRelations) ? payload.categoryRelations : []).map((rel) => {
      if (!rel || typeof rel.sourceCategory !== 'string' || typeof rel.targetCategory !== 'string') {
        error('Learning Map payload categoryRelations 含無效項目');
        return '';
      }
      if (rel.type !== 'prerequisite' && rel.type !== 'related') {
        error(`Learning Map payload categoryRelations 含非聚合類型 "${rel.type}"`);
      }
      return relationKey(rel);
    })
  );

  expectedRelations.forEach((key) => {
    if (!actualRelations.has(key)) {
      error(`Learning Map payload 缺少聚合 relation：${key}`);
    }
  });
  actualRelations.forEach((key) => {
    if (key && !expectedRelations.has(key)) {
      error(`Learning Map payload 多餘聚合 relation：${key}`);
    }
  });

  // Same-category topic↔topic relations（選取分群後才顯示；payload 必須完整）
  function topicRelationKey(rel) {
    return `${rel.source}|${rel.target}|${rel.type}|${rel.category}`;
  }
  const expectedTopicRelations = new Set(
    (expectedPayload.topicRelations || []).map(topicRelationKey)
  );
  const actualTopicRelations = new Set(
    (Array.isArray(payload.topicRelations) ? payload.topicRelations : []).map((rel) => {
      if (!rel || typeof rel.source !== 'string' || typeof rel.target !== 'string' || typeof rel.category !== 'string') {
        error('Learning Map payload topicRelations 含無效項目');
        return '';
      }
      if (rel.type !== 'prerequisite' && rel.type !== 'related') {
        error(`Learning Map payload topicRelations 含非預期類型 "${rel.type}"`);
      }
      if (!mindmapById.has(rel.source) || !mindmapById.has(rel.target)) {
        error(`Learning Map payload topicRelations 指向未知 topic：${rel.source} -> ${rel.target}`);
      } else {
        const sourceNode = mindmapById.get(rel.source);
        const targetNode = mindmapById.get(rel.target);
        if (sourceNode.category !== targetNode.category) {
          error(`Learning Map payload topicRelations 不可含跨 Category 邊：${rel.source} -> ${rel.target}`);
        }
      }
      return topicRelationKey(rel);
    })
  );

  expectedTopicRelations.forEach((key) => {
    if (!actualTopicRelations.has(key)) {
      error(`Learning Map payload 缺少 topic relation：${key}`);
    }
  });
  actualTopicRelations.forEach((key) => {
    if (key && !expectedTopicRelations.has(key)) {
      error(`Learning Map payload 多餘 topic relation：${key}`);
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
  validateBooksIndexConsistency(completed, mindmap);
  validateBooksIndexLearningMapConsistency(completed, mindmap);

  if (hasError) {
    console.error('\nValidation FAILED. Please fix the errors above.');
    process.exit(1);
  } else {
    console.log('\nValidation SUCCESS. All status tracking files are consistent and structurally sound!');
    process.exit(0);
  }
}

main();
