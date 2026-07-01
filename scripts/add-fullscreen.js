#!/usr/bin/env node

/**
 * 一次性遷移腳本：為文件頁加入「全螢幕檢視」功能。
 *
 * 設計原則：
 *   1. 單一來源 (Single Source of Truth)：全螢幕的 CSS + 按鈕 HTML + JS
 *      全部集中在本檔的 SNIPPET 常數，注入到所有目標頁的內容「一字不差」。
 *   2. 同一注入位置：每個目標檔的 </body> 之前 (已驗證每檔恰好出現一次)。
 *   3. 冪等 (Idempotent)：區塊以 <!-- FULLSCREEN-FEATURE:START --> 標記包住，
 *      已注入過的檔會被跳過，可安全重跑。
 *   4. 零副作用：只對 HTML 做「純附加」，完全不碰 docs/completed.json、
 *      books/index.html 首頁、scripts/generate.js。
 *
 * 注入目標：
 *   - templates/base.html          → 未來 generate.js 產出的新頁自動帶著此功能。
 *   - books/<topic-id>/index.html  → 既有的所有主題頁 (books/index.html 首頁不含)。
 *
 * Usage:
 *   node scripts/add-fullscreen.js          # 實際注入
 *   node scripts/add-fullscreen.js --dry    # 只預覽會動哪些檔，不寫入
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MARKER_START = '<!-- FULLSCREEN-FEATURE:START -->';
const MARKER_END = '<!-- FULLSCREEN-FEATURE:END -->';

// ---- 單一來源：全螢幕功能的完整自包含區塊 (CSS + 按鈕 + JS) ----
const SNIPPET = `${MARKER_START}
<style>
  .fs-toggle {
    position: fixed;
    top: 18px;
    right: 18px;
    z-index: 1000;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--sans, system-ui, -apple-system, "Segoe UI", sans-serif);
    font-size: 12.5px;
    line-height: 1;
    color: var(--text-2, #6b7078);
    background: var(--bg, #ffffff);
    border: 1px solid var(--border-strong, #dedcd8);
    border-radius: 999px;
    padding: 7px 13px 7px 11px;
    cursor: pointer;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .06), 0 4px 12px rgba(0, 0, 0, .04);
    transition: background .15s, border-color .15s, color .15s;
  }

  .fs-toggle:hover {
    background: var(--bg-soft, #fafaf9);
    color: var(--text, #262a2f);
    border-color: var(--text-3, #9aa0a8);
  }

  .fs-toggle:focus-visible {
    outline: 2px solid var(--accent, #3f6188);
    outline-offset: 2px;
  }

  .fs-toggle[aria-pressed="true"] {
    background: var(--accent, #3f6188);
    color: #fff;
    border-color: var(--accent, #3f6188);
  }

  .fs-toggle .fs-ic {
    flex: 0 0 auto;
    display: block;
  }

  @media print {
    .fs-toggle { display: none !important; }
  }

  @media (max-width: 480px) {
    .fs-toggle { padding: 8px; }
    .fs-toggle .fs-label { display: none; }
  }
</style>
<button id="fs-toggle-btn" class="fs-toggle" type="button" aria-pressed="false"
        aria-label="切換全螢幕檢視 (快捷鍵 F)" title="全螢幕檢視 (F)">
  <svg class="fs-ic fs-ic-expand" viewBox="0 0 24 24" width="15" height="15" fill="none"
       stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
  </svg>
  <svg class="fs-ic fs-ic-compress" viewBox="0 0 24 24" width="15" height="15" fill="none"
       stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:none">
    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
  </svg>
  <span class="fs-label">全螢幕</span>
</button>
<script>
  "use strict";
  (function () {
    var btn = document.getElementById("fs-toggle-btn");
    if (!btn) return;
    var docEl = document.documentElement;
    var canFs = !!(docEl.requestFullscreen || docEl.webkitRequestFullscreen);
    // 不支援 Fullscreen API (如 iPhone Safari) → 隱藏按鈕，避免壞掉的 UI
    if (!canFs) { btn.style.display = "none"; return; }

    var expandIc = btn.querySelector(".fs-ic-expand");
    var compressIc = btn.querySelector(".fs-ic-compress");
    var label = btn.querySelector(".fs-label");

    function isFs() {
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }
    function enter() {
      if (docEl.requestFullscreen) docEl.requestFullscreen();
      else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
    }
    function exit() {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    function toggle() { isFs() ? exit() : enter(); }
    function sync() {
      var on = isFs();
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      if (label) label.textContent = on ? "離開全螢幕" : "全螢幕";
      if (expandIc) expandIc.style.display = on ? "none" : "block";
      if (compressIc) compressIc.style.display = on ? "block" : "none";
    }

    btn.addEventListener("click", toggle);
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    document.addEventListener("keydown", function (e) {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target;
      var tag = t && t.tagName ? t.tagName.toUpperCase() : "";
      if (tag === "INPUT" || tag === "TEXTAREA" || (t && t.isContentEditable)) return;
      e.preventDefault();
      toggle();
    });
    sync();
  })();
</script>
${MARKER_END}`;

function parseArgs(argv) {
  return { dry: argv.includes('--dry') };
}

/** 收集所有注入目標：base.html + 每個 books/<topic>/index.html (排除首頁)。 */
function collectTargets() {
  const targets = [path.join(ROOT, 'templates', 'base.html')];
  const booksDir = path.join(ROOT, 'books');
  if (fs.existsSync(booksDir)) {
    fs.readdirSync(booksDir).forEach((name) => {
      const topicPage = path.join(booksDir, name, 'index.html');
      if (fs.existsSync(topicPage)) {
        targets.push(topicPage);
      }
    });
  }
  return targets;
}

function main() {
  const { dry } = parseArgs(process.argv);
  const targets = collectTargets();

  let patched = 0;
  let skipped = 0;
  let failed = 0;

  targets.forEach((file) => {
    const rel = path.relative(ROOT, file);
    const html = fs.readFileSync(file, 'utf8');

    // 冪等守門：已注入過就跳過
    if (html.includes(MARKER_START)) {
      console.log(`  skip  ${rel} (已含全螢幕區塊)`);
      skipped += 1;
      return;
    }

    // 注入錨點：最後一個 </body> 之前
    const idx = html.lastIndexOf('</body>');
    if (idx === -1) {
      console.error(`  FAIL  ${rel} (找不到 </body> 錨點，未處理)`);
      failed += 1;
      return;
    }

    const nextHtml = html.slice(0, idx) + SNIPPET + '\n' + html.slice(idx);

    if (dry) {
      console.log(`  would-patch  ${rel}`);
    } else {
      fs.writeFileSync(file, nextHtml, 'utf8');
      console.log(`  patch ${rel}`);
    }
    patched += 1;
  });

  console.log('');
  console.log(`目標 ${targets.length} 檔｜${dry ? '將注入' : '已注入'} ${patched}｜跳過 ${skipped}｜失敗 ${failed}`);
  if (failed > 0) process.exit(1);
}

main();
