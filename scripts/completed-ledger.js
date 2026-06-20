#!/usr/bin/env node

/**
 * Completed Ledger Utility
 *
 * Provides a lightweight interface for querying completion logs without loading 
 * the entire file into the Agent's context.
 *
 * Usage:
 *   node scripts/completed-ledger.js --action get-recent [--limit 5]
 *   node scripts/completed-ledger.js --action status
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
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

function loadJSON(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function getRecent(limit = 5) {
  const completed = loadJSON(COMPLETED_PATH, []);
  
  // Sort by completed_at descending, fallback to index
  const sorted = [...completed].sort((a, b) => {
    const dateA = a.completed_at || '';
    const dateB = b.completed_at || '';
    return dateB.localeCompare(dateA);
  });

  const slice = sorted.slice(0, parseInt(limit, 10));
  
  // Output a compact format to minimize token usage
  console.log(JSON.stringify({
    recent_completed_count: slice.length,
    recent_topics: slice.map(item => ({
      id: item.id,
      title: item.title,
      category: item.category,
      completed_at: item.completed_at
    }))
  }, null, 2));
}

function getStatus() {
  const completed = loadJSON(COMPLETED_PATH, []);
  const todo = loadJSON(TODO_PATH, []);
  
  const completedIds = new Set(completed.map(item => item.id));
  const pending = todo.filter(item => !completedIds.has(item.id));

  console.log(JSON.stringify({
    total_pool_count: todo.length + completedIds.size - pending.length, // avoid duplicates if any
    completed_count: completed.length,
    pending_count: pending.length,
    completion_rate: `${((completed.length / (completed.length + pending.length || 1)) * 100).toFixed(1)}%`
  }, null, 2));
}

function main() {
  const args = parseArgs(process.argv);
  const action = args.action;

  if (!action) {
    console.error('Usage: node scripts/completed-ledger.js --action <get-recent|status> [--limit <number>]');
    process.exit(1);
  }

  if (action === 'get-recent') {
    getRecent(args.limit || 5);
  } else if (action === 'status') {
    getStatus();
  } else {
    console.error(`Unknown action: ${action}`);
    process.exit(1);
  }
}

main();
