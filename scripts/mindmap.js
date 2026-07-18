#!/usr/bin/env node

/**
 * Mindmap Graph Query and Compiler Utility
 *
 * Helps the Agent query neighbors of completed topics, recommend next actions,
 * and compiles the nodes & edges into a beautifully stylized, clickable Mermaid diagram.
 *
 * Usage:
 *   node scripts/mindmap.js --action next [--last-topic <topic-id>]
 *   node scripts/mindmap.js --action generate-mermaid
 *   node scripts/mindmap.js --action generate-learning-map
 */

const fs = require('fs');
const path = require('path');

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

/**
 * Compile the Mindmap DAG + Completed topics into an interactive, beautifully styled Mermaid diagram.
 *
 * ⚠️ 保留作為獨立 CLI 工具（`--action generate-mermaid`）。自首頁改用 Cytoscape 學習地圖重構後，
 *    首頁改由 `buildLearningMapData` 供給，`buildBooksIndexHtml` 已「不再」呼叫本函式；此處僅供
 *    命令列查閱 Mermaid 語法之用。
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
 * Build a renderer-neutral Learning Map payload for the homepage Cytoscape view.
 * Hierarchy: Root → Category → Topic.
 * - categoryRelations: cross-category prerequisite/related, aggregated (related undirected-deduped).
 * - topicRelations: same-category topic↔topic edges (shown only after cluster selection in the UI).
 *
 * @param {Array} [completedList] in-memory completed ledger (same off-by-one contract as generateMermaid)
 */
function buildLearningMapData(completedList) {
  const mindmap = loadJSON(MINDMAP_PATH, { nodes: [], edges: [] });
  const completed = completedList !== undefined ? completedList : loadJSON(COMPLETED_PATH, []);
  const completedById = new Map(
    (Array.isArray(completed) ? completed : [])
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => [item.id, item])
  );

  const nodes = Array.isArray(mindmap.nodes) ? mindmap.nodes : [];
  const edges = Array.isArray(mindmap.edges) ? mindmap.edges : [];

  // mindmap 節點的 category 為必填（validate.js 會強制非空）。此 fallback 為 defense-in-depth：
  // 即使遇到未經 validate 的無 category 節點，也把它歸入 'General'（對齊 generate.js 的預設），
  // 而非讓它因找不到 category 而從學習地圖上「靜默消失」。合法資料下此函式輸出完全不受影響。
  const nodeCategory = (node) =>
    (node && typeof node.category === 'string' && node.category.trim()) ? node.category : 'General';

  const categoryNames = [...new Set(nodes.map((node) => nodeCategory(node)))]
    .sort((left, right) => left.localeCompare(right, 'zh-Hant'));

  const categories = categoryNames.map((name, index) => ({
    id: `category-${index}`,
    name,
    topicIds: [],
  }));
  const categoryIndexByName = new Map(categories.map((category, index) => [category.name, index]));

  const sortedTopics = [...nodes].sort((left, right) => {
    const categoryOrder = nodeCategory(left).localeCompare(nodeCategory(right), 'zh-Hant');
    if (categoryOrder !== 0) return categoryOrder;
    const titleOrder = String(left.title || '').localeCompare(String(right.title || ''), 'zh-Hant');
    return titleOrder !== 0 ? titleOrder : String(left.id).localeCompare(String(right.id));
  });

  const topics = sortedTopics.map((node) => {
    const meta = completedById.get(node.id);
    const isDone = Boolean(meta);
    const category = nodeCategory(node);
    const categoryIndex = categoryIndexByName.get(category);
    if (Number.isInteger(categoryIndex)) {
      categories[categoryIndex].topicIds.push(node.id);
    }

    let path = null;
    let completedAt = null;
    if (isDone) {
      completedAt = typeof meta.completed_at === 'string' ? meta.completed_at : null;
      if (typeof meta.path === 'string' && meta.path) {
        path = meta.path.replace(/^books\//, '');
      } else {
        path = `${node.id}/index.html`;
      }
    }

    return {
      id: node.id,
      title: node.title,
      category,
      completed: isDone,
      completed_at: completedAt,
      path,
    };
  });

  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const relationByKey = new Map();
  const topicRelationByKey = new Map();

  edges.forEach((edge) => {
    if (edge.type !== 'prerequisite' && edge.type !== 'related') return;
    const sourceTopic = topicById.get(edge.from);
    const targetTopic = topicById.get(edge.to);
    if (!sourceTopic || !targetTopic) return;

    let sourceIndex = categoryIndexByName.get(sourceTopic.category);
    let targetIndex = categoryIndexByName.get(targetTopic.category);
    if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) return;

    // Same-category: keep as topic-level relations for cluster-detail view.
    if (sourceIndex === targetIndex) {
      let fromId = edge.from;
      let toId = edge.to;
      if (edge.type === 'related' && fromId > toId) {
        const swap = fromId;
        fromId = toId;
        toId = swap;
      }
      const topicKey = `${fromId}|${toId}|${edge.type}`;
      if (!topicRelationByKey.has(topicKey)) {
        topicRelationByKey.set(topicKey, {
          source: fromId,
          target: toId,
          type: edge.type,
          category: categories[sourceIndex].id,
        });
      }
      return;
    }

    if (edge.type === 'related' && sourceIndex > targetIndex) {
      const swap = sourceIndex;
      sourceIndex = targetIndex;
      targetIndex = swap;
    }

    const key = `${sourceIndex}|${targetIndex}|${edge.type}`;
    const existing = relationByKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      relationByKey.set(key, {
        sourceCategory: categories[sourceIndex].id,
        targetCategory: categories[targetIndex].id,
        type: edge.type,
        count: 1,
      });
    }
  });

  const categoryRelations = [...relationByKey.values()].sort((left, right) =>
    left.sourceCategory.localeCompare(right.sourceCategory)
    || left.targetCategory.localeCompare(right.targetCategory)
    || left.type.localeCompare(right.type)
  );

  const topicRelations = [...topicRelationByKey.values()].sort((left, right) =>
    left.source.localeCompare(right.source)
    || left.target.localeCompare(right.target)
    || left.type.localeCompare(right.type)
  );

  return {
    root: { id: 'root-0', label: 'System Design\nEvery Day' },
    categories,
    topics,
    categoryRelations,
    topicRelations,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const action = args.action;

  if (!action) {
    console.error('Usage: node scripts/mindmap.js --action <next|generate-mermaid|generate-learning-map> [--last-topic <id>]');
    process.exit(1);
  }

  if (action === 'next') {
    recommendNext(args['last-topic']);
  } else if (action === 'generate-mermaid') {
    const code = generateMermaid();
    console.log(code);
  } else if (action === 'generate-learning-map') {
    console.log(JSON.stringify(buildLearningMapData(), null, 2));
  } else {
    console.error(`Unknown action: ${action}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
module.exports = { generateMermaid, buildLearningMapData };
