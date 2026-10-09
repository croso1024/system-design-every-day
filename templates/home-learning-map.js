/* Homepage Learning Map runtime — inlined by scripts/lib/books.js
 *
 * 地圖本體（卡片、走線、獨立主題、手機清單）在產頁時由 scripts/lib/home-map-render.js 輸出；
 * 這裡只做：選取狀態、先備／延伸 closure、路徑分層（chainLayers）、右側面板內容、
 * 「從這篇開始」、鍵盤操作（卡片是 <button>，Enter／Space 原生選取；Esc 清除）與 aria-live 播報。
 * 零依賴；payload 來自 <script id="learning-map-data">（v2）。
 */
(() => {
  'use strict';

  const dataEl = document.getElementById('learning-map-data');
  const root = document.getElementById('learning-map');
  if (!dataEl || !root) return;

  let payload = null;
  try {
    payload = JSON.parse(dataEl.textContent);
  } catch (e) {
    return;
  }
  if (!payload || payload.version !== 2 || !Array.isArray(payload.categories)) return;

  const PENDING_LABEL = '準備中';

  // ---- 資料索引 ----
  const categories = payload.categories;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const topicById = new Map((payload.topics || []).map((topic) => [topic.id, topic]));
  const predecessors = new Map(categories.map((category) => [category.id, []]));
  const successors = new Map(categories.map((category) => [category.id, []]));
  (payload.categoryPrereqs || []).forEach((edge) => {
    if (!categoryById.has(edge.source) || !categoryById.has(edge.target)) return;
    predecessors.get(edge.target).push(edge.source);
    successors.get(edge.source).push(edge.target);
  });

  function compareCodePoint(a, b) {
    const left = Array.from(String(a));
    const right = Array.from(String(b));
    const length = Math.min(left.length, right.length);
    for (let i = 0; i < length; i += 1) {
      const codeA = left[i].codePointAt(0);
      const codeB = right[i].codePointAt(0);
      if (codeA !== codeB) return codeA < codeB ? -1 : 1;
    }
    return left.length - right.length;
  }

  function compareByName(a, b) {
    return compareCodePoint(categoryById.get(a).name, categoryById.get(b).name) || compareCodePoint(a, b);
  }

  // ---- DOM ----
  const el = {
    clear: document.getElementById('lm-clear'),
    panelDefault: document.getElementById('lm-panel-default'),
    panelSelected: document.getElementById('lm-panel-selected'),
    live: document.getElementById('lm-live'),
    cards: new Map(),
    edges: [],
  };
  root.querySelectorAll('.lm-card[data-category]').forEach((card) => {
    el.cards.set(card.dataset.category, {
      card,
      button: card.querySelector('.lm-card-btn'),
      badge: card.querySelector('.lm-step-badge'),
    });
  });
  root.querySelectorAll('.lm-edge[data-source][data-target]').forEach((group) => {
    el.edges.push({ group, source: group.dataset.source, target: group.dataset.target, parent: group.parentNode });
  });

  const state = { selected: null };

  // ---- 選取狀態 ----

  /** 沿 prerequisite 邊的遞移閉包：forward=true 取延伸（後繼），false 取先備（前驅）。 */
  function closure(start, forward) {
    const seen = new Set();
    const stack = [start];
    const next = forward ? successors : predecessors;
    while (stack.length) {
      const current = stack.pop();
      next.get(current).forEach((id) => {
        if (!seen.has(id)) {
          seen.add(id);
          stack.push(id);
        }
      });
    }
    seen.delete(start);
    return seen;
  }

  /** 路徑內的最長路徑分層（只看兩端都在 chain 內的邊）；Kahn 拓撲一趟算完。 */
  function chainLayers(chain) {
    const layer = new Map();
    const indegree = new Map();
    chain.forEach((id) => {
      layer.set(id, 0);
      indegree.set(id, predecessors.get(id).filter((prev) => chain.has(prev)).length);
    });
    const queue = Array.from(chain).filter((id) => indegree.get(id) === 0).sort(compareCodePoint);
    while (queue.length) {
      const current = queue.shift();
      successors.get(current).forEach((next) => {
        if (!chain.has(next)) return;
        if (layer.get(next) < layer.get(current) + 1) layer.set(next, layer.get(current) + 1);
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) queue.push(next);
      });
    }
    return layer;
  }

  function selectionState(selected) {
    const ancestors = closure(selected, false);
    const descendants = closure(selected, true);
    const chain = new Set([selected, ...ancestors, ...descendants]);
    const up = new Set(ancestors);
    const down = new Set(descendants);
    up.add(selected);
    down.add(selected);
    return {
      selected,
      ancestors,
      descendants,
      chain,
      layers: chainLayers(chain),
      isActiveEdge: (edge) => (up.has(edge.source) && up.has(edge.target)) || (down.has(edge.source) && down.has(edge.target)),
    };
  }

  /** 路徑上的分類依步驟、再依名稱排序（面板與「從這篇開始」共用）。 */
  function chainInOrder(st) {
    return Array.from(st.chain).sort((a, b) => (st.layers.get(a) - st.layers.get(b)) || compareByName(a, b));
  }

  /** 「從這篇開始」：路徑上依步驟、再依閱讀順序，排第一篇的已發布文章。 */
  function startHere(st) {
    const ordered = chainInOrder(st);
    for (let i = 0; i < ordered.length; i += 1) {
      const category = categoryById.get(ordered[i]);
      const topicId = category.topicIds.find((id) => {
        const topic = topicById.get(id);
        return topic && topic.completed && topic.path;
      });
      if (topicId) return { topic: topicById.get(topicId), category, step: st.layers.get(category.id) + 1 };
    }
    return null;
  }

  // ---- DOM 小工具 ----

  function h(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((key) => {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'className') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key === 'dataset') Object.keys(value).forEach((k) => { node.dataset[k] = value[k]; });
        else if (key.startsWith('on')) node.addEventListener(key.slice(2).toLowerCase(), value);
        else node.setAttribute(key, value === true ? '' : String(value));
      });
    }
    (children || []).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  function dot(topic) {
    return h('i', { className: `lm-dot ${topic.completed ? 'is-published' : 'is-pending'}`, 'aria-hidden': 'true' });
  }

  function topicItem(topic, rank) {
    const children = [h('span', { className: 'lm-rank', text: String(rank) }), dot(topic)];
    if (topic.completed && topic.path) {
      children.push(h('a', { href: topic.path, text: topic.title }));
      return h('li', null, children);
    }
    children.push(h('span', { text: topic.title }));
    children.push(h('em', { className: 'lm-pending-tag', text: PENDING_LABEL }));
    return h('li', { className: 'is-pending' }, children);
  }

  // ---- 面板 ----

  function renderStepCategory(st, categoryId) {
    const category = categoryById.get(categoryId);
    const isSelected = categoryId === st.selected;
    const pct = category.total ? Math.round((category.published / category.total) * 100) : 0;
    const children = [
      h('button', {
        type: 'button',
        className: 'lm-step-cat-btn',
        'aria-pressed': isSelected ? 'true' : 'false',
        'aria-label': `${category.name}，已發布 ${category.published} / ${category.total} 篇${isSelected ? '（目前選取）' : '，點選改以此分類為中心'}`,
        onClick: () => select(categoryId, { announce: true }),
      }, [
        h('span', { className: 'lm-step-cat-name', text: category.name }),
        h('span', { className: 'lm-step-cat-count', text: `${category.published}/${category.total}` }),
      ]),
      h('div', { className: 'lm-bar', 'aria-hidden': 'true' }, [h('span', { style: `width: ${pct}%` })]),
    ];
    if (isSelected) {
      const items = category.topicIds
        .map((id) => topicById.get(id))
        .filter(Boolean)
        .map((topic, index) => topicItem(topic, index + 1));
      children.push(h('ol', { className: 'lm-reading', 'aria-label': `${category.name} 的建議閱讀順序` }, items));
    }
    return h('div', {
      className: `lm-step-cat${isSelected ? ' is-selected' : ''}`,
      dataset: { domain: category.domain },
    }, children);
  }

  function renderSteps(st) {
    const byLayer = new Map();
    st.chain.forEach((id) => {
      const layer = st.layers.get(id);
      if (!byLayer.has(layer)) byLayer.set(layer, []);
      byLayer.get(layer).push(id);
    });
    const layers = Array.from(byLayer.keys()).sort((a, b) => a - b);
    const selectedLayer = st.layers.get(st.selected);
    return h('ol', { className: 'lm-steps' }, layers.map((layer, index) => {
      const members = byLayer.get(layer).sort(compareByName);
      const isCurrent = members.indexOf(st.selected) >= 0;
      const tag = isCurrent ? '目前' : (layer < selectedLayer ? '先備' : '延伸');
      return h('li', { className: `lm-step${isCurrent ? ' is-current' : ''}` }, [
        h('div', { className: 'lm-step-rail', 'aria-hidden': 'true' }, [
          h('span', { className: 'lm-step-num', text: String(layer + 1) }),
          index < layers.length - 1 ? h('span', { className: 'lm-step-line' }) : null,
        ]),
        h('div', { className: 'lm-step-body' }, [
          h('span', { className: 'lm-step-tag', text: `第 ${layer + 1} 步 · ${tag}` }),
          ...members.map((id) => renderStepCategory(st, id)),
        ]),
      ]);
    }));
  }

  function renderStart(st) {
    const start = startHere(st);
    if (!start) {
      return h('div', { className: 'lm-start' }, [
        h('p', { className: 'lm-start-label', text: '從這篇開始' }),
        h('p', { className: 'lm-start-empty', text: '這條路徑上還沒有已發布的文章。' }),
      ]);
    }
    return h('div', { className: 'lm-start', dataset: { domain: start.category.domain } }, [
      h('p', { className: 'lm-start-label', text: '從這篇開始' }),
      h('a', { className: 'lm-start-link', href: start.topic.path, text: start.topic.title }),
      h('p', { className: 'lm-start-meta', text: `${start.category.name} · 第 ${start.step} 步` }),
    ]);
  }

  function renderPanel(st) {
    const selected = categoryById.get(st.selected);
    let done = 0;
    let total = 0;
    st.chain.forEach((id) => {
      done += categoryById.get(id).published;
      total += categoryById.get(id).total;
    });
    const summary = h('p', { className: 'lm-panel-summary' }, [
      '以 ',
      h('b', { text: selected.name }),
      ` 為中心：先備 ${st.ancestors.size} 個分類、延伸 ${st.descendants.size} 個分類，路徑上已發布 ${done} / ${total} 篇。`,
    ]);
    el.panelSelected.replaceChildren(summary, renderStart(st), renderSteps(st));
    el.panelSelected.hidden = false;
    el.panelDefault.hidden = true;
  }

  // ---- 套用到地圖 ----

  function applySelection(st) {
    root.classList.toggle('has-selection', Boolean(st));
    el.cards.forEach((entry, id) => {
      const onPath = Boolean(st) && st.chain.has(id);
      const isSelected = Boolean(st) && st.selected === id;
      entry.card.classList.toggle('is-selected', isSelected);
      entry.card.classList.toggle('is-on-path', onPath);
      entry.card.classList.toggle('is-dimmed', Boolean(st) && !onPath);
      entry.button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      entry.badge.textContent = onPath ? String(st.layers.get(id) + 1) : '';
    });
    el.edges.forEach((edge) => {
      const active = Boolean(st) && st.isActiveEdge(edge);
      edge.group.classList.toggle('is-active', active);
      if (active) edge.parent.appendChild(edge.group); // 選取路徑的走線畫在最上層
    });
    if (el.clear) el.clear.hidden = !st;
  }

  function announce(message) {
    if (!el.live) return;
    el.live.textContent = '';
    window.setTimeout(() => { el.live.textContent = message; }, 30);
  }

  function select(categoryId, options = {}) {
    if (!categoryById.has(categoryId)) return;
    state.selected = categoryId;
    const st = selectionState(categoryId);
    applySelection(st);
    renderPanel(st);
    if (options.announce) {
      const category = categoryById.get(categoryId);
      announce(`已選取 ${category.name}：先備 ${st.ancestors.size} 個分類、延伸 ${st.descendants.size} 個分類。按 Escape 清除選取。`);
    }
  }

  function clearSelection(options = {}) {
    const previous = state.selected;
    state.selected = null;
    applySelection(null);
    el.panelSelected.replaceChildren();
    el.panelSelected.hidden = true;
    el.panelDefault.hidden = false;
    if (options.announce) announce('已清除選取。');
    if (options.restoreFocus && previous && el.cards.has(previous)) {
      el.cards.get(previous).button.focus();
    }
  }

  function toggle(categoryId) {
    if (state.selected === categoryId) clearSelection({ announce: true });
    else select(categoryId, { announce: true });
  }

  // ---- 事件 ----

  el.cards.forEach((entry, id) => {
    entry.button.addEventListener('click', () => toggle(id));
  });
  if (el.clear) {
    el.clear.addEventListener('click', () => clearSelection({ announce: true, restoreFocus: true }));
  }
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || state.selected === null) return;
    event.preventDefault();
    clearSelection({ announce: true, restoreFocus: true });
  });
})();
