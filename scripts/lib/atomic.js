'use strict';

/**
 * atomic.js — 原子寫檔共用工具
 *
 * 透過「寫入同目錄的 temp 檔 → fs.renameSync 覆蓋目標」達成單檔原子寫入。
 * 同一檔案系統的 rename 是原子操作，因此讀者永遠只會看到「舊版完整檔」或
 * 「新版完整檔」，絕不會讀到寫到一半的半截 JSON / HTML。
 *
 * 注意：temp 檔「必須」與目標同目錄，否則跨檔案系統 (mount) 的 rename 會退化
 *      成 copy + unlink，失去原子性。這也是不可使用 /tmp 或 scratchpad 的原因。
 */

const fs = require('fs');
const path = require('path');

/** 產生與目標同目錄、不易碰撞的 temp 檔路徑。 */
function tempPathFor(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  return path.join(dir, `.${base}.tmp.${process.pid}.${Date.now()}`);
}

/**
 * 原子寫入字串內容。
 * @param {string} filePath 目標檔路徑
 * @param {string} contents 完整內容字串
 */
function writeFileAtomic(filePath, contents) {
  const tmp = tempPathFor(filePath);
  try {
    fs.writeFileSync(tmp, contents, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (e) {
    // 清掉可能殘留的 temp 檔，再把錯誤往上拋給呼叫端決定如何處理 (例如回滾)。
    if (fs.existsSync(tmp)) {
      try { fs.unlinkSync(tmp); } catch (_) { /* 殘檔清除失敗不應掩蓋原始錯誤 */ }
    }
    throw e;
  }
}

/**
 * 原子寫入 JSON（沿用專案慣例：2 空格縮排 + 結尾換行）。
 * @param {string} filePath 目標檔路徑
 * @param {*} data 可序列化的資料
 */
function writeJSONAtomic(filePath, data) {
  writeFileAtomic(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

module.exports = { writeFileAtomic, writeJSONAtomic };
