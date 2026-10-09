#!/usr/bin/env node

/**
 * Mindmap Graph Query and Compiler Utility
 *
 * Helps the Agent query neighbors of completed topics, recommend next actions,
 * and compiles the nodes & edges into a beautifully stylized, clickable Mermaid diagram.
 *
 * Usage:
 *   node scripts/mindmap.js --action next [--last-topic <topic-id>]
 *   node scripts/mindmap.js --action list-categories
 *   node scripts/mindmap.js --action layout-report
 *   node scripts/mindmap.js --action generate-mermaid
 *   node scripts/mindmap.js --action generate-learning-map
 */

const fs = require('fs');
const path = require('path');
const {
  readCategoryRegistry,
  validateCategoryRegistry,
  buildCategoryIndex,
  compareCodePoint,
} = require('./lib/categories');
const { buildLearningMapLayout } = require('./lib/learning-map-layout');

const ROOT = path.resolve(__dirname, '..');
const MINDMAP_PATH = path.join(ROOT, 'docs', 'mindmap.json');
const COMPLETED_PATH = path.join(ROOT, 'docs', 'completed.json');
const TODO_PATH = path.join(ROOT, 'docs', 'todo.json');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith('--')) {
        args[key] = value;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function loadJSON(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

/**
 * Compute prerequisite readiness for a candidate node.
 * A prerequisite edge { from, to, type:'prerequisite' } means `from` must be learned before `to`.
 * Returns the list of still-missing prerequisite ids and whether all are satisfied.
 */
function computePrereqStatus(nodeId, edges, completedIds) {
  const missing = edges
    .filter(edge => edge.to === nodeId && edge.type === 'prerequisite')
    .map(edge => edge.from)
    .filter(fromId => !completedIds.has(fromId));
  return { satisfied: missing.length === 0, missing };
}

/**
 * Recommend the next topic(s) to write based on the last completed topic and DAG relationships.
 */
function recommendNext(lastTopicId) {
  const mindmap = loadJSON(MINDMAP_PATH, { nodes: [], edges: [] });
  const completed = loadJSON(COMPLETED_PATH, []);
  const todo = loadJSON(TODO_PATH, []);

  const completedIds = new Set(completed.map(item => item.id));
  const todoIds = new Set(todo.map(item => item.id));
  const todoById = new Map(todo.map(item => [item.id, item]));

  function withBrief(rec) {
    const todoItem = todoById.get(rec.id);
    if (todoItem && typeof todoItem.brief === 'string' && todoItem.brief.trim()) {
      return { ...rec, brief: todoItem.brief };
    }
    return rec;
  }

  // Determine actual last completed topic if not provided
  let lastId = lastTopicId;
  if (!lastId && completed.length > 0) {
    const sorted = [...completed].sort((a, b) => (b.completed_at || '').localeCompare(a.completed_at || ''));
    lastId = sorted[0].id;
  }

  const recommendations = [];

  if (lastId) {
    // Find outward edges from lastId
    const outgoing = mindmap.edges.filter(edge => edge.from === lastId);
    for (const edge of outgoing) {
      if (!completedIds.has(edge.to)) {
        const node = mindmap.nodes.find(n => n.id === edge.to);
        if (node) {
          recommendations.push({
            id: node.id,
            title: node.title,
            category: node.category,
            relation_type: edge.type,
            reason: `Connected as [${edge.type}] from your last written topic "${lastId}"`
          });
        }
      }
    }

    // Find inward edges (maybe lastId was a prerequisite for something else)
    const incoming = mindmap.edges.filter(edge => edge.to === lastId);
    for (const edge of incoming) {
      if (!completedIds.has(edge.from)) {
        const node = mindmap.nodes.find(n => n.id === edge.from);
        if (node) {
          recommendations.push({
            id: node.id,
            title: node.title,
            category: node.category,
            relation_type: `reverse-${edge.type}`,
            reason: `Prerequisite/Related link with last topic "${lastId}"`
          });
        }
      }
    }
  }

  // If no adjacent recommendations, find any pending topics from todo.json that are root nodes or standalone
  if (recommendations.length === 0) {
    const uncompletedTodo = todo.filter(item => !completedIds.has(item.id));
    for (const t of uncompletedTodo) {
      // Find if this has any incoming edges that are NOT completed.
      // If it has no uncompleted prerequisites, it's a safe starting point.
      const incompletePrereqs = mindmap.edges
        .filter(edge => edge.to === t.id && edge.type === 'prerequisite')
        .map(edge => edge.from)
        .filter(fromId => !completedIds.has(fromId));

      if (incompletePrereqs.length === 0) {
        recommendations.push({
          id: t.id,
          title: t.title,
          category: t.category,
          relation_type: 'independent-start',
          reason: 'Independent topic ready to start (all prerequisites are cleared or none exist)'
        });
      }
    }
  }

  // Dedupe by topic id (a node may be reachable via several edges), keeping the first reason.
  const seen = new Set();
  const deduped = recommendations.filter(rec => {
    if (seen.has(rec.id)) return false;
    seen.add(rec.id);
    return true;
  });

  // Annotate each candidate with prerequisite readiness, then rank "ready" ones first.
  // Order within the same readiness bucket is preserved, so selection stays non-deterministic
  // among equally-ready candidates while never hiding an unmet-prerequisite from the Agent.
  const annotated = deduped.map(rec => {
    const { satisfied, missing } = computePrereqStatus(rec.id, mindmap.edges, completedIds);
    return withBrief({ ...rec, prerequisites_satisfied: satisfied, missing_prereqs: missing });
  });
  annotated.sort((a, b) => Number(b.prerequisites_satisfied) - Number(a.prerequisites_satisfied));

  console.log(JSON.stringify({
    last_completed_topic: lastId || 'None',
    recommendations: annotated.slice(0, 5)
  }, null, 2));
}

/** 讀取並驗證分類登記表；缺檔或格式有誤時 throw（供 buildLearningMapData 等 library 路徑使用）。 */
function loadCategoryRegistryOrThrow() {
  const registry = readCategoryRegistry();
  const errors = validateCategoryRegistry(registry);
  if (errors.length) {
    throw new Error(`docs/categories.json 格式有誤：\n  - ${errors.join('\n  - ')}`);
  }
  return registry;
}

/** 讀取並驗證分類登記表；缺檔或格式有誤時 fail-loud（exit 1）。供 CLI action 使用。 */
function loadCategoryIndexOrExit() {
  try {
    return buildCategoryIndex(loadCategoryRegistryOrThrow());
  } catch (e) {
    console.error(`[mindmap] ERROR: ${e.message}`);
    process.exit(1);
  }
  return null;
}

/**
 * 從 mindmap 與登記表推導「分類層圖」：排版模組（learning-map-layout.js）的輸入，
 * 也是首頁 payload v2 的 domains / categories / categoryPrereqs 來源。
 *
 * - categories 依登記表順序（name 的 code point 序），每筆含 topicIds（此處依 id 的 code point 排序；
 *   payload 的閱讀順序由 payload builder 另行計算）。
 * - categoryPrereqs 只聚合「跨分類」的 prerequisite 邊，count 為文章 edge 數；依 source、target 排序。
 * - 節點 category 未登記時 throw：這是 validate R2 的範圍，排版不應靜默吞掉。
 *
 * @param {object} mindmap docs/mindmap.json 內容
 * @param {object} categoryIndex buildCategoryIndex() 的結果
 */
function buildCategoryGraph(mindmap, categoryIndex) {
  const nodes = Array.isArray(mindmap && mindmap.nodes) ? mindmap.nodes : [];
  const edges = Array.isArray(mindmap && mindmap.edges) ? mindmap.edges : [];

  const topicIdsByCategory = new Map(categoryIndex.categories.map((category) => [category.id, []]));
  const categoryIdByTopic = new Map();
  nodes.forEach((node) => {
    if (!node || typeof node.id !== 'string') return;
    const category = categoryIndex.categoryByName.get(node.category);
    if (!category) {
      throw new Error(`mindmap 節點 "${node.id}" 的 category "${node.category}" 未登記於 docs/categories.json`);
    }
    topicIdsByCategory.get(category.id).push(node.id);
    categoryIdByTopic.set(node.id, category.id);
  });

  const countByEdge = new Map();
  edges.forEach((edge) => {
    if (!edge || edge.type !== 'prerequisite') return;
    const source = categoryIdByTopic.get(edge.from);
    const target = categoryIdByTopic.get(edge.to);
    if (!source || !target || source === target) return;
    const key = `${source}|${target}`;
    countByEdge.set(key, (countByEdge.get(key) || 0) + 1);
  });

  const categoryPrereqs = [...countByEdge.entries()]
    .map(([key, count]) => {
      const [source, target] = key.split('|');
      return { source, target, count };
    })
    .sort((p, q) => compareCodePoint(p.source, q.source) || compareCodePoint(p.target, q.target));

  return {
    domains: categoryIndex.domains.map((domain) => ({ id: domain.id, name: domain.name })),
    categories: categoryIndex.categories.map((category) => ({
      id: category.id,
      name: category.name,
      domain: category.domain,
      topicIds: topicIdsByCategory.get(category.id).slice().sort(compareCodePoint),
    })),
    categoryPrereqs,
  };
}

/**
 * 以文字印出目前資料的排版結果（各欄分類與順序、獨立主題、edge 數、穿過卡片的 edge 數）。
 * 純唯讀，供人工核對分欄與排序是否合理；非 strict 模式，所以即使有 edge 穿過卡片也會印出計數而非中止。
 */
function layoutReport() {
  const categoryIndex = loadCategoryIndexOrExit();
  const mindmap = loadJSON(MINDMAP_PATH, { nodes: [], edges: [] });

  let graph;
  let result;
  try {
    graph = buildCategoryGraph(mindmap, categoryIndex);
    result = buildLearningMapLayout(graph, { strict: false });
  } catch (e) {
    console.error(`[mindmap] ERROR: ${e.message}`);
    process.exit(1);
  }

  const nameById = new Map(graph.categories.map((category) => [category.id, category.name]));
  const topicCountById = new Map(graph.categories.map((category) => [category.id, category.topicIds.length]));
  const { layout } = result;
  const lines = [];

  lines.push(`畫布：${layout.width} × ${layout.height}；卡片：${layout.card.w} × ${layout.card.h}（${layout.card.h === 62 ? '一列' : '兩列'}點點）`);
  lines.push(`欄數：${result.columnCount}`);
  layout.columns.forEach((column) => {
    const members = graph.categories
      .filter((category) => result.columnById.get(category.id) === column.index)
      .map((category) => ({ id: category.id, y: layout.boxes[category.id].y }))
      .sort((p, q) => p.y - q.y);
    const label = column.label ? `（${column.label}）` : '';
    lines.push(`第 ${column.index} 欄${label} x=${column.x}：`);
    members.forEach((member, i) => {
      const box = layout.boxes[member.id];
      lines.push(`  ${i + 1}. ${nameById.get(member.id)}  [y=${box.y}, pop=${box.pop}, ${topicCountById.get(member.id)} 篇]`);
    });
  });

  const isolated = graph.categories.filter((category) => result.columnById.get(category.id) === null);
  if (layout.isolated) {
    lines.push(`獨立主題（y=${layout.isolated.y}）：${isolated.map((category) => nameById.get(category.id)).join('、')}`);
  } else {
    lines.push('獨立主題：無');
  }

  lines.push(`分類層 prerequisite edge 數：${layout.edges.length}（文章 edge 合計 ${graph.categoryPrereqs.reduce((sum, edge) => sum + edge.count, 0)}）`);
  const multiColumn = layout.edges.filter((edge) => result.columnById.get(edge.target) - result.columnById.get(edge.source) > 1).length;
  lines.push(`跨越多欄的 edge 數：${multiColumn}`);
  lines.push(`穿過卡片的 edge 數 = ${result.crossings.count}`);
  result.crossings.offenders.forEach((offender) => {
    lines.push(`  ! ${nameById.get(offender.source)} -> ${nameById.get(offender.target)} 穿過 ${nameById.get(offender.card)}`);
  });

  console.log(lines.join('\n'));
}

/**
 * 列出分類登記表（docs/categories.json）與各分類在 mindmap 上的文章數。
 * 供 topic-explorer 在新增主題前查詢「既有分類名稱（逐字）」與「分類所屬領域」，
 * 避免為了查分類而直接讀大型 JSON。登記表格式有誤時 fail-loud（exit 1），不吞錯。
 *
 * 輸出：
 *   {
 *     "domains":    [ { "id", "name", "category_count" } ],                // 登記表順序
 *     "categories": [ { "id", "name", "domain", "published", "total" } ]   // 登記表順序（name 的 code point 序）
 *   }
 */
function listCategories() {
  const index = loadCategoryIndexOrExit();
  const mindmap = loadJSON(MINDMAP_PATH, { nodes: [], edges: [] });
  const completed = loadJSON(COMPLETED_PATH, []);
  const completedIds = new Set((Array.isArray(completed) ? completed : []).map((item) => item && item.id));
  const nodes = Array.isArray(mindmap.nodes) ? mindmap.nodes : [];

  const totalByCategory = new Map();
  const publishedByCategory = new Map();
  nodes.forEach((node) => {
    if (!node || typeof node.category !== 'string') return;
    totalByCategory.set(node.category, (totalByCategory.get(node.category) || 0) + 1);
    if (completedIds.has(node.id)) {
      publishedByCategory.set(node.category, (publishedByCategory.get(node.category) || 0) + 1);
    }
  });

  const categories = index.categories.map((category) => ({
    id: category.id,
    name: category.name,
    domain: category.domain,
    published: publishedByCategory.get(category.name) || 0,
    total: totalByCategory.get(category.name) || 0,
  }));
  const domains = index.domains.map((domain) => ({
    id: domain.id,
    name: domain.name,
    category_count: categories.filter((category) => category.domain === domain.id).length,
  }));

  console.log(JSON.stringify({ domains, categories }, null, 2));
}

/**
 * Compile the Mindmap DAG + Completed topics into an interactive, beautifully styled Mermaid diagram.
 *
 * ⚠️ 保留作為獨立 CLI 工具（`--action generate-mermaid`）。首頁知識地圖改由 `buildLearningMapData`
 *    的 payload v2 供給（產頁時排版、前端只做互動），`buildBooksIndexHtml` 已「不再」呼叫本函式；
 *    此處僅供命令列查閱 Mermaid 語法之用。
 *
 * @param {Array} [completedList] 已完成主題清單。呼叫端可傳入手上那份 in-memory 清單，讓節點狀態
 *   與呼叫端同源、與存檔時機解耦；省略時（如 CLI）才 fallback 讀磁碟。
 *   ── 沿用與 `buildLearningMapData` 相同的 off-by-one 契約：避免「尚未 saveCompleted」的呼叫端把
 *      最新主題節點讀成舊狀態（舊版無條件讀磁碟，而 generate.js 在 saveCompleted 之前就呼叫）。
 */
function generateMermaid(completedList) {
  const mindmap = loadJSON(MINDMAP_PATH, { nodes: [], edges: [] });
  const completed = completedList !== undefined ? completedList : loadJSON(COMPLETED_PATH, []);

  const completedIds = new Set(completed.map(item => item.id));

  let mermaidCode = 'flowchart TD\n';
  mermaidCode += '  %% Node Definitions\n';

  // Output nodes with custom markdown-like labels and classes
  mindmap.nodes.forEach(node => {
    const isCompleted = completedIds.has(node.id);
    const label = `${node.title}<br><small>(${node.category})</small>`;
    const styleClass = isCompleted ? ':::completed' : ':::pending';
    mermaidCode += `  ${node.id}["${label}"]${styleClass}\n`;
  });

  mermaidCode += '\n  %% Edge Definitions\n';
  mindmap.edges.forEach(edge => {
    const line = edge.type === 'prerequisite' ? '==>' : '-->';
    mermaidCode += `  ${edge.from} ${line} ${edge.to}\n`;
  });

  mermaidCode += '\n  %% Interactive Click Actions\n';
  mindmap.nodes.forEach(node => {
    const isCompleted = completedIds.has(node.id);
    if (isCompleted) {
      mermaidCode += `  click ${node.id} "${node.id}/index.html" "閱讀本篇指南"\n`;
    }
  });

  mermaidCode += '\n  %% Styling Custom Classes\n';
  mermaidCode += '  classDef completed fill:#eef4f1,stroke:#4d7d68,stroke-width:2px,color:#262a2f;\n';
  mermaidCode += '  classDef pending fill:#eef2f7,stroke:#3f6188,stroke-width:2px,color:#262a2f;\n';

  return mermaidCode;
}

/**
 * 同分類內文章的閱讀順序：以分類內的 prerequisite 邊做最長路徑分層（Kahn），
 * 同層依 id 的 code point 排序。跨分類的邊不納入（那是分類層走線的事）。
 * 分類內成環時 throw（validate 的主題層環偵測會先擋下；此處 fail-loud 以免靜默輸出錯誤順序）。
 *
 * @param {string[]} topicIds 同一分類的文章 id
 * @param {Array<{from:string,to:string,type:string}>} edges mindmap edges
 * @returns {string[]}
 */
function computeReadingOrder(topicIds, edges) {
  const ids = topicIds.slice().sort(compareCodePoint);
  const inCategory = new Set(ids);
  const successors = new Map(ids.map((id) => [id, []]));
  const indegree = new Map(ids.map((id) => [id, 0]));
  edges.forEach((edge) => {
    if (!edge || edge.type !== 'prerequisite') return;
    if (!inCategory.has(edge.from) || !inCategory.has(edge.to) || edge.from === edge.to) return;
    successors.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  });

  const layerById = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indegree.get(id) === 0);
  const order = [];
  while (queue.length) {
    queue.sort(compareCodePoint);
    const current = queue.shift();
    order.push(current);
    successors.get(current).forEach((next) => {
      if (layerById.get(next) < layerById.get(current) + 1) layerById.set(next, layerById.get(current) + 1);
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    });
  }
  if (order.length !== ids.length) {
    const stuck = ids.filter((id) => indegree.get(id) > 0).join(', ');
    throw new Error(`同分類文章的 prerequisite 有循環，無法決定閱讀順序：${stuck}（node scripts/validate.js 會列出環路徑）`);
  }
  return ids.sort((a, b) => (layerById.get(a) - layerById.get(b)) || compareCodePoint(a, b));
}

/**
 * 首頁知識地圖 payload v2（嵌入 books/index.html 的 <script id="learning-map-data">）。
 *
 * 排版在產頁時由 lib/learning-map-layout.js 算好，前端只做選取互動與面板內容：
 *   {
 *     version: 2,
 *     stats: { published, total },                       // 只算 mindmap 節點
 *     domains: [{ id, name }],                           // 登記表順序 = 圖例順序
 *     categories: [{ id, name, domain, column, topicIds, published, total }],
 *                                                        // column null = 獨立主題；topicIds 為閱讀順序
 *     topics: [{ id, title, category, completed, completed_at, path }],   // 依 id 的 code point 排序
 *     categoryPrereqs: [{ source, target, count }],      // 跨分類 prerequisite 聚合
 *     layout: { width, height, card, columns, boxes, isolated, edges }    // 見 learning-map-layout.js
 *   }
 *
 * 輸出完全可重現：排序只比 code point，不用 localeCompare（本機與 CI 的 ICU 可能不同）。
 * 登記表缺檔／格式錯、節點分類未登記、分類層成環、edge 穿卡時一律 throw：
 * generate.js 在寫任何檔案之前呼叫本函式，throw 即零副作用 exit 1。
 *
 * @param {Array} [completedList] in-memory completed ledger（與 generateMermaid 相同的 off-by-one 契約：
 *   呼叫端尚未 saveCompleted 時仍能把最新主題標成已發布；省略時才 fallback 讀磁碟）
 */
function buildLearningMapData(completedList) {
  const mindmap = loadJSON(MINDMAP_PATH, { nodes: [], edges: [] });
  const completed = completedList !== undefined ? completedList : loadJSON(COMPLETED_PATH, []);
  const completedById = new Map(
    (Array.isArray(completed) ? completed : [])
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => [item.id, item])
  );

  const nodes = (Array.isArray(mindmap.nodes) ? mindmap.nodes : []).filter((node) => node && typeof node.id === 'string');
  const edges = Array.isArray(mindmap.edges) ? mindmap.edges : [];

  const categoryIndex = buildCategoryIndex(loadCategoryRegistryOrThrow());
  const graph = buildCategoryGraph(mindmap, categoryIndex);
  const { columnById, layout } = buildLearningMapLayout(graph);

  const topics = nodes
    .slice()
    .sort((left, right) => compareCodePoint(left.id, right.id))
    .map((node) => {
      const meta = completedById.get(node.id);
      const isDone = Boolean(meta);
      let path = null;
      let completedAt = null;
      if (isDone) {
        completedAt = typeof meta.completed_at === 'string' ? meta.completed_at : null;
        path = (typeof meta.path === 'string' && meta.path)
          ? meta.path.replace(/^books\//, '')
          : `${node.id}/index.html`;
      }
      return {
        id: node.id,
        title: node.title,
        category: node.category,
        completed: isDone,
        completed_at: completedAt,
        path,
      };
    });

  const categories = graph.categories.map((category) => {
    const topicIds = computeReadingOrder(category.topicIds, edges);
    const column = columnById.get(category.id);
    return {
      id: category.id,
      name: category.name,
      domain: category.domain,
      column: Number.isInteger(column) ? column : null,
      topicIds,
      published: topicIds.filter((id) => completedById.has(id)).length,
      total: topicIds.length,
    };
  });

  return {
    version: 2,
    stats: {
      published: topics.filter((topic) => topic.completed).length,
      total: topics.length,
    },
    domains: graph.domains,
    categories,
    topics,
    categoryPrereqs: graph.categoryPrereqs,
    layout,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const action = args.action;

  if (!action) {
    console.error('Usage: node scripts/mindmap.js --action <next|list-categories|layout-report|generate-mermaid|generate-learning-map> [--last-topic <id>]');
    process.exit(1);
  }

  if (action === 'next') {
    recommendNext(args['last-topic']);
  } else if (action === 'list-categories') {
    listCategories();
  } else if (action === 'layout-report') {
    layoutReport();
  } else if (action === 'generate-mermaid') {
    const code = generateMermaid();
    console.log(code);
  } else if (action === 'generate-learning-map') {
    try {
      console.log(JSON.stringify(buildLearningMapData(), null, 2));
    } catch (e) {
      console.error(`[mindmap] ERROR: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.error(`Unknown action: ${action}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
module.exports = { generateMermaid, buildLearningMapData, buildCategoryGraph, computeReadingOrder };
