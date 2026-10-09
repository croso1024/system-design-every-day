'use strict';

/**
 * home-map-render.js — 首頁知識地圖的伺服器端輸出（由 lib/books.js 嵌入 books/index.html）。
 *
 * 輸入是 mindmap.js `buildLearningMapData()` 的 payload v2（排版已算好），這裡只負責把它變成 HTML：
 *   - 標題列與整體進度
 *   - 圖例（領域色、已發布／準備中）與「清除選取」按鈕
 *   - 地圖畫布：欄標題、走線 SVG、分類卡片（真正的 <button>）、hover 浮出的文章清單、獨立主題區塊
 *   - 右側面板的預設內容（提示文字 + 最近發布）
 *   - 手機版（< 768px）的伺服器端分組清單（依步驟分組，每個分類一個 <details>）
 *
 * 前端 templates/home-learning-map.js 只做選取互動與面板內容；本檔產生的 id／class 是兩者的契約。
 * 領域顏色不在這裡：CSS 以 `[data-domain="<id>"]` 定義（validate R8 檢查每個 domain 都有規則）。
 */

const { compareCodePoint } = require('./categories');

const POP_WIDTH = 360;        // hover 浮出清單寬度（CSS 讀 --lm-pop-w）
const RECENT_LIMIT = 5;       // 面板未選取時列出的「最近發布」篇數
const PENDING_LABEL = '準備中';
const PUBLISHED_LABEL = '已發布';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pad2(number) {
  return number < 10 ? `0${number}` : String(number);
}

function percent(published, total) {
  if (!total) return 0;
  return Math.round((published / total) * 1000) / 10;
}

/** 建立查詢索引；payload 是信任的衍生資料，但仍做最小防禦。 */
function buildModel(payload) {
  if (!payload || payload.version !== 2 || !payload.layout) {
    throw new Error('home-map-render: 需要 payload v2（含 layout）');
  }
  const topicById = new Map((payload.topics || []).map((topic) => [topic.id, topic]));
  const domainById = new Map((payload.domains || []).map((domain) => [domain.id, domain]));
  const categories = payload.categories || [];
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  return { payload, topicById, domainById, categories, categoryById, layout: payload.layout };
}

// ---- 共用片段 ----------------------------------------------------------------

/** 文章一列：已發布 = 連結；準備中 = 純文字 + 標籤。`tabindex` 供 hover 清單用（鍵盤使用者改走面板）。 */
function renderTopicItem(topic, rank, options = {}) {
  const title = escapeHtml(topic.title || topic.id);
  const rankHtml = rank ? `<span class="lm-rank">${rank}</span>` : '';
  const dot = `<i class="lm-dot ${topic.completed ? 'is-published' : 'is-pending'}" aria-hidden="true"></i>`;
  const tabindex = options.unfocusable ? ' tabindex="-1"' : '';
  if (topic.completed && topic.path) {
    return `<li>${rankHtml}${dot}<a href="${escapeHtml(topic.path)}"${tabindex}>${title}</a></li>`;
  }
  return `<li class="is-pending">${rankHtml}${dot}<span>${title}</span><em class="lm-pending-tag">${PENDING_LABEL}</em></li>`;
}

function categoryTopics(model, category) {
  return (category.topicIds || []).map((id) => model.topicById.get(id)).filter(Boolean);
}

// ---- 標題列 ----------------------------------------------------------------------

function renderHeader(model) {
  const { published, total } = model.payload.stats || { published: 0, total: 0 };
  const pct = percent(published, total);
  return `<div class="lm-head">
        <div class="lm-head-text">
          <p class="lm-kicker">Learning Map</p>
          <h2 id="learning-map-heading" class="lm-title">系統設計知識地圖</h2>
          <p class="lm-desc">每張卡片是一個分類，點點是分類內的文章；箭頭是分類之間的先備關係。點選卡片，面板會列出它的學習路徑與閱讀順序；滑鼠移到卡片上可直接看到文章標題。</p>
        </div>
        <div class="lm-stats">
          <p class="lm-stats-line"><span class="lm-stats-label">${PUBLISHED_LABEL}</span><span class="lm-stats-num">${published}</span><span class="lm-stats-total">/ ${total}</span></p>
          <div class="lm-progress" role="progressbar" aria-label="整體發布進度" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${published}"><span style="width: ${pct}%"></span></div>
        </div>
      </div>`;
}

// ---- 圖例與工具列 ------------------------------------------------------------------

function renderToolbar(model) {
  const domainItems = (model.payload.domains || [])
    .map((domain) => `<li data-domain="${escapeHtml(domain.id)}"><i class="lm-legend-swatch" aria-hidden="true"></i>${escapeHtml(domain.name)}</li>`)
    .join('');
  return `<div class="lm-toolbar">
          <ul class="lm-legend" aria-label="圖例">
            ${domainItems}
            <li class="lm-legend-sep" aria-hidden="true"></li>
            <li><i class="lm-dot is-published" aria-hidden="true"></i>${PUBLISHED_LABEL}</li>
            <li><i class="lm-dot is-pending" aria-hidden="true"></i>${PENDING_LABEL}</li>
          </ul>
          <button type="button" id="lm-clear" class="lm-clear" hidden>清除選取</button>
        </div>`;
}

// ---- 地圖畫布 ----------------------------------------------------------------------

function renderColumnLabels(layout) {
  return (layout.columns || [])
    .map((column) => {
      const name = column.label ? `<span class="lm-col-name">${escapeHtml(column.label)}</span>` : '';
      return `<div class="lm-col-label" style="left: ${column.x}px" aria-hidden="true"><span class="lm-col-num">${pad2(column.index + 1)}</span><span class="lm-col-rule"></span>${name}</div>`;
    })
    .join('\n            ');
}

function renderEdges(layout) {
  const edges = (layout.edges || [])
    .map((edge) => `<g class="lm-edge" data-source="${escapeHtml(edge.source)}" data-target="${escapeHtml(edge.target)}"><path class="lm-edge-line" d="${escapeHtml(edge.d)}"></path><path class="lm-edge-head" d="${escapeHtml(edge.head)}"></path></g>`)
    .join('\n              ');
  return `<svg class="lm-edges" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}" aria-hidden="true" focusable="false">
              ${edges}
            </svg>`;
}

function renderCard(model, category) {
  const box = model.layout.boxes[category.id];
  if (!box) throw new Error(`home-map-render: layout.boxes 缺少分類 "${category.id}"`);
  const topics = categoryTopics(model, category);
  const name = escapeHtml(category.name);
  const dots = topics
    .map((topic) => `<i class="lm-dot ${topic.completed ? 'is-published' : 'is-pending'}" title="${escapeHtml(topic.title)}"></i>`)
    .join('');
  const popItems = topics.map((topic, index) => renderTopicItem(topic, index + 1, { unfocusable: true })).join('');
  const popSide = box.pop === 'above' ? 'lm-pop-above' : 'lm-pop-below';
  const popAlign = box.x + POP_WIDTH > model.layout.width ? ' lm-pop-right' : '';
  const column = category.column === null ? 'isolated' : String(category.column);
  const label = `${category.name}，${PUBLISHED_LABEL} ${category.published} / ${category.total} 篇`;
  return `<div class="lm-card" data-category="${escapeHtml(category.id)}" data-domain="${escapeHtml(category.domain)}" data-column="${column}" style="left: ${box.x}px; top: ${box.y}px">
              <button type="button" class="lm-card-btn" aria-pressed="false" aria-label="${escapeHtml(label)}">
                <span class="lm-card-row"><span class="lm-card-name">${name}</span><span class="lm-card-count">${category.published}/${category.total}</span></span>
                <span class="lm-dots" aria-hidden="true">${dots}</span>
              </button>
              <span class="lm-step-badge" aria-hidden="true"></span>
              <ol class="lm-pop ${popSide}${popAlign}" aria-label="${name} 的文章（依閱讀順序）">${popItems}</ol>
            </div>`;
}

function renderCanvas(model) {
  const { layout } = model;
  const cards = model.categories.map((category) => renderCard(model, category)).join('\n            ');
  const isolated = layout.isolated
    ? `<div class="lm-isolated-label" style="top: ${layout.isolated.y}px" aria-hidden="true"><span class="lm-col-num">${escapeHtml(layout.isolated.label)}</span><span class="lm-col-rule"></span></div>`
    : '';
  const style = [
    `width: ${layout.width}px`,
    `height: ${layout.height}px`,
    `--lm-card-w: ${layout.card.w}px`,
    `--lm-card-h: ${layout.card.h}px`,
    `--lm-pop-w: ${POP_WIDTH}px`,
  ].join('; ');
  return `<div class="lm-scroll">
          <div id="lm-canvas" class="lm-canvas" style="${style}" role="group" aria-label="分類地圖">
            ${renderColumnLabels(layout)}
            ${renderEdges(layout)}
            ${isolated}
            ${cards}
          </div>
        </div>`;
}

// ---- 右側面板（預設內容） --------------------------------------------------------------

function recentTopics(model) {
  return (model.payload.topics || [])
    .filter((topic) => topic.completed && topic.path)
    .slice()
    .sort((a, b) => compareCodePoint(b.completed_at || '', a.completed_at || '') || compareCodePoint(a.id, b.id))
    .slice(0, RECENT_LIMIT);
}

function renderPanel(model) {
  const recent = recentTopics(model);
  const recentHtml = recent.length
    ? `<ol class="lm-recent">${recent.map((topic) => `<li><a href="${escapeHtml(topic.path)}">${escapeHtml(topic.title)}</a><span class="lm-recent-meta">${escapeHtml(topic.category)} · ${escapeHtml(topic.completed_at || 'N/A')}</span></li>`).join('')}</ol>`
    : '<p class="lm-hint">尚無已發布文章。</p>';
  return `<aside id="lm-panel" class="lm-panel" aria-labelledby="lm-panel-title">
          <p class="lm-kicker">Learning Path</p>
          <h3 id="lm-panel-title" class="lm-panel-title">建議學習路徑</h3>
          <div id="lm-panel-default">
            <p class="lm-hint">在地圖上點選任一分類，這裡會列出它的先備與延伸分類、各分類進度，以及分類內文章的建議閱讀順序。</p>
            <h4 class="lm-panel-sub">最近發布</h4>
            ${recentHtml}
          </div>
          <div id="lm-panel-selected" hidden></div>
        </aside>`;
}

// ---- 手機版分組清單 ------------------------------------------------------------------

function renderMobileList(model) {
  const { layout } = model;
  const groups = (layout.columns || []).map((column) => {
    const members = model.categories
      .filter((category) => category.column === column.index)
      .sort((a, b) => (layout.boxes[a.id].y - layout.boxes[b.id].y) || compareCodePoint(a.id, b.id));
    const title = column.label ? `第 ${column.index + 1} 步 · ${column.label}` : `第 ${column.index + 1} 步`;
    return { title, members };
  });
  const isolated = model.categories
    .filter((category) => category.column === null)
    .sort((a, b) => (layout.boxes[a.id].x - layout.boxes[b.id].x) || (layout.boxes[a.id].y - layout.boxes[b.id].y));
  if (isolated.length) groups.push({ title: layout.isolated ? layout.isolated.label : '獨立主題', members: isolated });

  const sections = groups
    .filter((group) => group.members.length)
    .map((group) => {
      const details = group.members.map((category) => {
        const items = categoryTopics(model, category).map((topic, index) => renderTopicItem(topic, index + 1)).join('');
        return `<details class="lm-mobile-cat" data-domain="${escapeHtml(category.domain)}">
              <summary><i class="lm-legend-swatch" aria-hidden="true"></i><span class="lm-mobile-name">${escapeHtml(category.name)}</span><span class="lm-mobile-count">${category.published}/${category.total}</span></summary>
              <ol class="lm-topic-list">${items}</ol>
            </details>`;
      }).join('\n            ');
      return `<section class="lm-mobile-step">
            <h3 class="lm-mobile-title">${escapeHtml(group.title)}</h3>
            ${details}
          </section>`;
    })
    .join('\n          ');

  return `<div id="lm-mobile" class="lm-mobile" aria-label="知識地圖（清單版）">
          ${sections}
        </div>`;
}

// ---- 組裝 -------------------------------------------------------------------------

/**
 * 回傳整個 <section class="learning-map"> 的 HTML（含標題列、工具列、畫布、面板、手機清單、aria-live）。
 * @param {object} payload buildLearningMapData() 的 payload v2
 */
function renderLearningMapSection(payload) {
  const model = buildModel(payload);
  return `<section id="learning-map" class="learning-map" aria-labelledby="learning-map-heading">
      ${renderHeader(model)}
      <div class="lm-frame">
        ${renderToolbar(model)}
        <div class="lm-body">
        ${renderCanvas(model)}
        ${renderPanel(model)}
        </div>
        ${renderMobileList(model)}
      </div>
      <p id="lm-live" class="lm-visually-hidden" aria-live="polite"></p>
    </section>`;
}

module.exports = {
  POP_WIDTH,
  RECENT_LIMIT,
  renderLearningMapSection,
  renderHeader,
  renderToolbar,
  renderCanvas,
  renderPanel,
  renderMobileList,
};
