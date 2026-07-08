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
 * @param {Array} [completedList] 已完成主題清單。呼叫端（buildBooksIndexHtml）應傳入手上那份
 *   in-memory 清單，讓節點狀態與卡片同源、與存檔時機解耦。省略時（如 CLI）才 fallback 讀磁碟。
 *   ── 這是修正「發佈當下 mermaid 節點落後成 pending」off-by-one bug 的關鍵：舊版無條件讀磁碟，
 *      而 generate.js 在 saveCompleted 之前就呼叫，導致最新主題節點讀到尚未存入的舊狀態。
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

function main() {
  const args = parseArgs(process.argv);
  const action = args.action;

  if (!action) {
    console.error('Usage: node scripts/mindmap.js --action <next|generate-mermaid> [--last-topic <id>]');
    process.exit(1);
  }

  if (action === 'next') {
    recommendNext(args['last-topic']);
  } else if (action === 'generate-mermaid') {
    const code = generateMermaid();
    console.log(code);
  } else {
    console.error(`Unknown action: ${action}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
module.exports = { generateMermaid };
