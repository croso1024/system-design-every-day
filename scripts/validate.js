#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TODO_PATH = path.join(ROOT, 'docs', 'todo.json');
const COMPLETED_PATH = path.join(ROOT, 'docs', 'completed.json');
const MINDMAP_PATH = path.join(ROOT, 'docs', 'mindmap.json');

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

  if (hasError) {
    console.error('\nValidation FAILED. Please fix the errors above.');
    process.exit(1);
  } else {
    console.log('\nValidation SUCCESS. All status tracking files are consistent and structurally sound!');
    process.exit(0);
  }
}

main();
