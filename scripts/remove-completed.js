#!/usr/bin/env node

/**
 * remove-completed.js — 撤回一筆已發佈 (completed) 的主題
 *
 * completed.json 由 generate.js 自動寫入、禁止手改；撤回 (發錯主題 / 要重做 / 下架)
 * 一律透過本腳本，而非手動編輯，藉此補上合法回退路徑。
 *
 * 用法:
 *   node scripts/remove-completed.js --topic <topic-id> [--restore-todo] [--purge-page] [--no-reindex] [--dry-run]
 *
 * 旗標:
 *   --topic        要撤回的主題 id (必填)
 *   --restore-todo 把該主題加回 docs/todo.json (資料取自 mindmap node)；預設不加
 *   --purge-page   刪除 books/<id>/ 整個發佈頁 (不可逆)；預設保留 (留存頁不影響 validate)
 *   --no-reindex   不重繪 books/index.html；預設會重繪 (讓首頁學習地圖與 completed 同步)
 *   --dry-run      只印出將發生的變更，不實際落檔
 *
 * 本腳本不動 mindmap.json (刪 node 會牽動 edges、可能產生懸空邊，屬 topic-explorer 職責)。
 */

const fs = require('fs');
const path = require('path');
const { loadCompleted, saveCompleted, buildBooksIndexHtml, writeBooksIndex } = require('./lib/books');
const { writeJSONAtomic } = require('./lib/atomic');

const ROOT = path.resolve(__dirname, '..');
const TODO_PATH = path.join(ROOT, 'docs', 'todo.json');
const MINDMAP_PATH = path.join(ROOT, 'docs', 'mindmap.json');

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

function readJSONSafe(filePath, fileName, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.error(`Error: ${fileName} 解析失敗（檔案可能損壞）：${e.message}`);
    process.exit(1);
  }
  return fallback;
}

function main() {
  const args = parseArgs(process.argv);
  const topicId = args.topic;

  if (!topicId || topicId === true) {
    console.error('Usage: node scripts/remove-completed.js --topic <topic-id> [--restore-todo] [--purge-page] [--no-reindex] [--dry-run]');
    process.exit(1);
  }

  const dryRun = !!args['dry-run'];
  const restoreTodo = !!args['restore-todo'];
  const purgePage = !!args['purge-page'];
  const reindex = !args['no-reindex'];

  let completed;
  try {
    completed = loadCompleted();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }

  const entry = completed.find((item) => item.id === topicId);
  if (!entry) {
    console.log(`Topic "${topicId}" 不在 completed.json（可能已撤回或從未發佈）。未做任何變更。`);
    process.exit(0);
  }

  const nextCompleted = completed.filter((item) => item.id !== topicId);

  // --restore-todo 的前置檢查 (在任何落檔之前，fail-safe)
  let todoToWrite = null;
  if (restoreTodo) {
    const mindmap = readJSONSafe(MINDMAP_PATH, 'mindmap.json', { nodes: [], edges: [] });
    const node = (mindmap.nodes || []).find((n) => n.id === topicId);
    if (!node) {
      console.error(`無法 --restore-todo："${topicId}" 不是 mindmap.json 的 node，加回 todo.json 會違反參照完整性 (validate 會失敗)。`);
      process.exit(1);
    }
    const todo = readJSONSafe(TODO_PATH, 'todo.json', []);
    if (todo.some((t) => t.id === topicId)) {
      console.log(`提示："${topicId}" 已在 todo.json，略過 --restore-todo（避免重複 id）。`);
    } else {
      todoToWrite = todo.concat([{ id: node.id, title: node.title, category: node.category }]);
    }
  }

  const relPage = path.posix.join('books', topicId);
  const pageDir = path.join(ROOT, 'books', topicId);

  if (dryRun) {
    console.log(JSON.stringify({
      dry_run: true,
      remove_from_completed: entry,
      reindex,
      restore_todo: todoToWrite ? { id: topicId } : (restoreTodo ? 'skipped' : false),
      purge_page: purgePage ? relPage : false,
    }, null, 2));
    return;
  }

  // ---- 寫入交易：① completed.json ② todo.json(restore) ③ books/index.html ----
  // 三者「全有或全無」：任一步失敗即逆序回滾已成功的步驟，回到撤回前的一致狀態。
  // ④ purgePage（刪實體頁）不可逆且失敗無害（只留孤兒頁），故放交易外、最後執行、不參與回滾。
  // 對稱於 generate.js 的「completed ↔ books/index.html 互為一致時具回滾保護」設計。
  const origTodoBytes = todoToWrite && fs.existsSync(TODO_PATH)
    ? fs.readFileSync(TODO_PATH, 'utf8')
    : null; // 僅在本次會動 todo.json 時才需備份；null 代表「原本不存在」

  let committedCompleted = false;
  let committedTodo = false;
  try {
    saveCompleted(nextCompleted);
    committedCompleted = true;

    if (todoToWrite) {
      writeJSONAtomic(TODO_PATH, todoToWrite);
      committedTodo = true;
    }

    if (reindex) {
      writeBooksIndex(buildBooksIndexHtml(nextCompleted));
    }
  } catch (e) {
    // 逆序回滾：先還原 todo，再還原 completed，使三檔回到撤回前的快照。
    if (committedTodo) {
      if (origTodoBytes !== null) {
        fs.writeFileSync(TODO_PATH, origTodoBytes, 'utf8');
      } else if (fs.existsSync(TODO_PATH)) {
        fs.unlinkSync(TODO_PATH); // 原本不存在 → 還原為不存在
      }
    }
    if (committedCompleted) {
      saveCompleted(completed); // completed 為撤回前的完整陣列
    }
    console.error(`撤回過程寫檔失敗，已回滾 completed.json / todo.json 至撤回前：${e.message}`);
    process.exit(1);
  }

  // 交易成功後才輸出各步驟訊息（避免回滾後仍印出「已移除」造成誤導）。
  console.log(`已從 docs/completed.json 移除 "${topicId}"。`);
  if (committedTodo) {
    console.log(`已將 "${topicId}" 加回 docs/todo.json。`);
  }
  if (reindex) {
    console.log('已重繪 books/index.html（學習地圖 payload 已同步，該節點轉回 pending）。');
  }

  if (purgePage) {
    if (fs.existsSync(pageDir)) {
      fs.rmSync(pageDir, { recursive: true, force: true });
      console.log(`已刪除 ${relPage}/。`);
    } else {
      console.log(`頁面 ${relPage}/ 不存在，略過刪除。`);
    }
  }

  console.log('提示：撤回後請執行 `node scripts/validate.js` 確認狀態一致。');
}

main();
