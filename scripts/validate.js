#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const {
  readCategoryRegistry,
  validateCategoryRegistry,
  buildCategoryIndex,
} = require('./lib/categories');

const ROOT = path.resolve(__dirname, '..');
const TODO_PATH = path.join(ROOT, 'docs', 'todo.json');
const COMPLETED_PATH = path.join(ROOT, 'docs', 'completed.json');
const MINDMAP_PATH = path.join(ROOT, 'docs', 'mindmap.json');
const BOOKS_INDEX_PATH = path.join(ROOT, 'books', 'index.html');
const HOME_MAP_CSS_PATH = path.join(ROOT, 'templates', 'home-learning-map.css');

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
    error('books/index.html 缺少可解析的 <script id="learning-map-data" type="application/json"> payload（首頁過時，請執行 node scripts/reindex-home.js 只重繪首頁，或 generate.js / rebuild-all.js）。');
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
 * books/index.html Learning Map payload（v2）結構與狀態一致性檢查。
 * - topics：逐筆對照 mindmap 節點與 completed.json（title / category / completed / path / completed_at）。
 * - R7：version / stats / domains / categories / categoryPrereqs / layout 必須深度等於以目前資料重算的結果
 *   （JSON.stringify 相等）；不符代表首頁過時，提示執行 reindex-home.js。
 */
function validateBooksIndexLearningMapConsistency(completed, mindmap) {
  if (!fs.existsSync(BOOKS_INDEX_PATH)) return;

  const html = fs.readFileSync(BOOKS_INDEX_PATH, 'utf8');
  const payload = extractLearningMapPayload(html);
  if (!payload) return; // 缺少 payload 已由 validateBooksIndexConsistency 報錯

  const { buildLearningMapData } = require('./mindmap');
  let expectedPayload;
  try {
    expectedPayload = buildLearningMapData(completed);
  } catch (e) {
    error(`無法以目前資料重算首頁 Learning Map payload：${e.message}`);
    return;
  }

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

  // R7：payload v2 的衍生區塊必須與重算結果逐位元相同（排版在產頁時算好，前端不重算）。
  if (payload.version !== 2) {
    error(`books/index.html Learning Map payload version 為 ${payload.version}，預期 2（首頁過時，請執行 node scripts/reindex-home.js）`);
    return;
  }
  ['stats', 'domains', 'categories', 'categoryPrereqs', 'layout'].forEach((key) => {
    if (JSON.stringify(payload[key]) !== JSON.stringify(expectedPayload[key])) {
      error(`books/index.html Learning Map payload 的 "${key}" 與目前 docs/ 資料重算結果不符（首頁過時，請執行 node scripts/reindex-home.js 只重繪首頁，或 generate.js / rebuild-all.js）。`);
    }
  });
}

/**
 * R8：templates/home-learning-map.css 對登記表的每個 domain 都有 [data-domain="<id>"] 規則。
 * 領域顏色只放在 CSS（登記表不存顏色），新增領域時必須同步補上，否則該領域的點點會退回預設灰色。
 */
function validateHomeMapCssDomains(registry) {
  if (!registry || !Array.isArray(registry.domains)) return;
  if (!fs.existsSync(HOME_MAP_CSS_PATH)) {
    error(`缺少首頁 Learning Map 樣式模板：${HOME_MAP_CSS_PATH}`);
    return;
  }
  const css = fs.readFileSync(HOME_MAP_CSS_PATH, 'utf8');
  registry.domains.forEach((domain) => {
    if (!domain || typeof domain.id !== 'string') return;
    if (!css.includes(`[data-domain="${domain.id}"]`)) {
      error(`templates/home-learning-map.css 缺少領域 "${domain.id}" 的 [data-domain="${domain.id}"] 顏色規則`);
    }
  });
}

/**
 * 有向圖環偵測 (DFS 三色法)，回傳所有相異的環路徑（每條以起點收尾，例如 [a, b, c, a]）。
 * 顏色：undefined=未訪、1=訪問中(在遞迴堆疊)、2=完成。
 * 同一個環可能從多個起點抵達，以「環上節點集合」為 key 去重，避免洗版。
 * 供主題層 prerequisite 環（validateMindmap）與分類層 prerequisite 環（R4）共用。
 *
 * @param {Set<string>} nodeIds
 * @param {Array<{from:string,to:string}>} edges 已過濾為合法端點的有向邊
 * @returns {string[][]}
 */
function findDirectedCycles(nodeIds, edges) {
  const adj = new Map();
  nodeIds.forEach(id => adj.set(id, []));
  edges
    .filter(e => nodeIds.has(e.from) && nodeIds.has(e.to))
    .forEach(e => { adj.get(e.from).push(e.to); });

  const color = new Map();
  const reported = new Set();
  const cycles = [];

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
          cycles.push(cyclePath);
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
  return cycles;
}

/**
 * 主題層 prerequisite 邊不可成環。
 * 只取 type==='prerequisite' 的邊建圖——related 邊方向是任意的，納入會大量誤報。
 */
function detectPrerequisiteCycles(nodeIds, edges) {
  const prerequisiteEdges = edges.filter(e => e.type === 'prerequisite');
  findDirectedCycles(nodeIds, prerequisiteEdges).forEach((cyclePath) => {
    error(`偵測到 prerequisite 循環依賴: ${cyclePath.join(' -> ')}`);
  });
}

/**
 * R1：docs/categories.json 格式正確。
 * @returns {object|null} 通過時回傳登記表；缺檔、解析失敗或格式錯誤時回傳 null（錯誤已記錄）。
 */
function validateCategoriesFile() {
  let registry;
  try {
    registry = readCategoryRegistry();
  } catch (e) {
    error(e.message);
    return null;
  }
  const errors = validateCategoryRegistry(registry);
  errors.forEach((message) => error(message));
  return errors.length ? null : registry;
}

/**
 * R4：分類層 prerequisite 圖不得有循環。
 * 首頁學習地圖以「分類的 prerequisite 最長路徑深度」分欄，分類層一旦成環就無法排版；
 * 主題層無環並不保證分類層無環（A 分類的 a1 → B 分類的 b1，B 的 b2 → A 的 a2 就成環）。
 * 報錯時印出環路徑，以及每一段分類邊背後造成循環的文章 edge，方便定位要調整哪條邊。
 *
 * @param {Map<string, object>} nodeById 合法節點（id → node）
 * @param {Array} edges mindmap edges
 */
function validateCategoryPrerequisiteCycles(nodeById, edges) {
  const categoryIds = new Set();
  const topicEdgesByCategoryEdge = new Map(); // "A|B" → [{ from, to }]
  const categoryEdges = [];

  edges.forEach((edge) => {
    if (!edge || edge.type !== 'prerequisite') return;
    const fromNode = nodeById.get(edge.from);
    const toNode = nodeById.get(edge.to);
    if (!fromNode || !toNode) return;
    const fromCategory = fromNode.category;
    const toCategory = toNode.category;
    if (typeof fromCategory !== 'string' || typeof toCategory !== 'string') return;
    if (fromCategory === toCategory) return;

    categoryIds.add(fromCategory);
    categoryIds.add(toCategory);
    const key = `${fromCategory}|${toCategory}`;
    if (!topicEdgesByCategoryEdge.has(key)) {
      topicEdgesByCategoryEdge.set(key, []);
      categoryEdges.push({ from: fromCategory, to: toCategory });
    }
    topicEdgesByCategoryEdge.get(key).push({ from: edge.from, to: edge.to });
  });

  findDirectedCycles(categoryIds, categoryEdges).forEach((cyclePath) => {
    const hops = [];
    for (let i = 0; i < cyclePath.length - 1; i += 1) {
      const key = `${cyclePath[i]}|${cyclePath[i + 1]}`;
      const topicEdges = (topicEdgesByCategoryEdge.get(key) || [])
        .map((topicEdge) => `${topicEdge.from} -> ${topicEdge.to}`)
        .join(', ');
      hops.push(`  "${cyclePath[i]}" -> "${cyclePath[i + 1]}"：${topicEdges}`);
    }
    error(
      `偵測到分類層 prerequisite 循環依賴（首頁學習地圖無法分欄）: ${cyclePath.map((c) => `"${c}"`).join(' -> ')}\n` +
      `  造成循環的文章 edge：\n${hops.join('\n')}`
    );
  });
}

/**
 * R5 / R6：completed.json 與 todo.json 每一筆的 category 必須等於 mindmap 節點的 category。
 * mindmap 是分類的單一真相來源（generate.js 的 category 由節點帶出）；兩邊不一致代表有人手改或流程繞過。
 * 節點不存在的情況已由 validateMindmap 報錯，此處略過以免重複。
 */
function validateCategoryAgreement(entries, fileName, nodeById) {
  if (!Array.isArray(entries) || !nodeById) return;
  entries.forEach((item, index) => {
    if (!item || typeof item.id !== 'string') return;
    const node = nodeById.get(item.id);
    if (!node) return;
    if (item.category !== node.category) {
      error(`${fileName}[${index}] "${item.id}" 的 category "${item.category}" 與 mindmap 節點的 "${node.category}" 不一致`);
    }
  });
}

/**
 * @returns {Map<string, object>|null} 合法節點的 id → node 索引（供 R4～R6 使用）；結構錯誤時回傳 null
 */
function validateMindmap(mindmap, todoIds, completedIds, registry) {
  if (typeof mindmap !== 'object' || mindmap === null || Array.isArray(mindmap)) {
    error('mindmap.json must be a JSON Object');
    return null;
  }

  const nodes = mindmap.nodes;
  const edges = mindmap.edges;

  if (!Array.isArray(nodes)) {
    error('mindmap.json must contain a "nodes" Array');
    return null;
  }

  if (!Array.isArray(edges)) {
    error('mindmap.json must contain an "edges" Array');
    return null;
  }

  const categoryIndex = registry ? buildCategoryIndex(registry) : null;
  const usedCategories = new Set();

  const nodeIds = new Set();
  const nodeById = new Map();
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
      nodeById.set(node.id, node);
    }

    if (typeof node.title !== 'string' || !node.title) {
      error(`${label} is missing a valid 'title' (string)`);
    }

    if (typeof node.category !== 'string' || !node.category) {
      error(`${label} is missing a valid 'category' (string)`);
    } else {
      usedCategories.add(node.category);
      // R2：每個節點的 category 都已登記（登記表本身有錯時略過，避免連鎖誤報）
      if (categoryIndex && !categoryIndex.categoryByName.has(node.category)) {
        error(`${label} "${node.id}" 的 category "${node.category}" 未登記於 docs/categories.json（新分類請走 add-topic.js --domain）`);
      }
    }
  });

  // R3：登記表中沒有任何節點使用的分類視為錯誤（避免登記表累積殭屍分類）
  if (categoryIndex) {
    categoryIndex.categories.forEach((category) => {
      if (!usedCategories.has(category.name)) {
        error(`docs/categories.json 的分類 "${category.name}" 沒有任何 mindmap 節點使用，請移除或修正`);
      }
    });
  }

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

  // R4：分類層 prerequisite 圖也不可成環（首頁學習地圖分欄的前提）。
  validateCategoryPrerequisiteCycles(nodeById, edges);

  return nodeById;
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

  const registry = validateCategoriesFile(); // R1
  const todoIds = validateTodo(todo);
  const completedIds = validateCompleted(completed);
  const nodeById = validateMindmap(mindmap, todoIds, completedIds, registry); // 含 R2～R4
  validateCategoryAgreement(completed, 'completed.json', nodeById); // R5
  validateCategoryAgreement(todo, 'todo.json', nodeById); // R6
  validateMutualExclusion(todoIds, completedIds);
  validateBooksIndexConsistency(completed, mindmap);
  validateBooksIndexLearningMapConsistency(completed, mindmap); // 含 R7
  validateHomeMapCssDomains(registry); // R8

  if (hasError) {
    console.error('\nValidation FAILED. Please fix the errors above.');
    process.exit(1);
  } else {
    console.log('\nValidation SUCCESS. All status tracking files are consistent and structurally sound!');
    process.exit(0);
  }
}

main();
