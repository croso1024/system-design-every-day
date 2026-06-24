#!/usr/bin/env node

/**
 * Remove Todo Utility
 *
 * Removes a completed topic from docs/todo.json.
 *
 * Usage:
 *   node scripts/remove-todo.js --topic <topic-id>
 */

const fs = require('fs');
const path = require('path');
const { writeJSONAtomic } = require('./lib/atomic');

const ROOT = path.resolve(__dirname, '..');
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

function main() {
  const args = parseArgs(process.argv);
  const topicId = args.topic;

  if (!topicId) {
    console.error('Usage: node scripts/remove-todo.js --topic <topic-id>');
    process.exit(1);
  }

  if (!fs.existsSync(TODO_PATH)) {
    console.error(`Error: todo.json not found at ${TODO_PATH}`);
    process.exit(1);
  }

  let todoList = [];
  try {
    todoList = JSON.parse(fs.readFileSync(TODO_PATH, 'utf8'));
  } catch (e) {
    console.error(`Error parsing todo.json: ${e.message}`);
    process.exit(1);
  }

  if (!Array.isArray(todoList)) {
    console.error('Error: todo.json must be a JSON Array');
    process.exit(1);
  }

  const originalLength = todoList.length;
  todoList = todoList.filter(item => item.id !== topicId);

  if (todoList.length === originalLength) {
    console.log(`Topic "${topicId}" was not found in todo.json (already removed or never existed).`);
  } else {
    try {
      writeJSONAtomic(TODO_PATH, todoList);
      console.log(`Successfully removed "${topicId}" from todo.json.`);
    } catch (e) {
      console.error(`Error writing to todo.json: ${e.message}`);
      process.exit(1);
    }
  }
}

main();
