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
  const STORAGE_KEY = 'sded.read.v1';
  const WIN_PREFIX = 'sded.read.v1:';

  // ---- 已讀狀態儲存（localStorage + file:// fallback） ----
  // 儲存格式（key、envelope、window.name 前綴）與 templates/base.html 的同名函式共用，改動須兩邊同步。
  function parseEnvelope(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      if (parsed.v === 1 && parsed.items && typeof parsed.items === 'object' && !Array.isArray(parsed.items)) {
        return { updatedAt: Number(parsed.updatedAt) || 0, items: parsed.items };
      }
      return { updatedAt: 1, items: parsed };
    } catch (e) {
      return null;
    }
  }

  function loadReadMap() {
    let fromLs = null;
    let fromWin = null;
    try { fromLs = parseEnvelope(window.localStorage.getItem(STORAGE_KEY)); } catch (e) {}
    if (window.location.protocol === 'file:') {
      try {
        if (typeof window.name === 'string' && window.name.indexOf(WIN_PREFIX) === 0) {
          fromWin = parseEnvelope(window.name.slice(WIN_PREFIX.length));
        }
      } catch (e) {}
    }
    let chosen = fromLs;
    if (fromWin && (!chosen || fromWin.updatedAt > chosen.updatedAt)) {
      chosen = fromWin;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, updatedAt: chosen.updatedAt, items: chosen.items }));
      } catch (e) {}
    } else if (chosen && window.location.protocol === 'file:') {
      try {
        window.name = WIN_PREFIX + JSON.stringify({ v: 1, updatedAt: chosen.updatedAt, items: chosen.items });
      } catch (e) {}
    }
    return chosen && chosen.items ? { ...chosen.items } : {};
  }

  function saveReadMap(items) {
    const env = JSON.stringify({ v: 1, updatedAt: Date.now(), items });
    try { window.localStorage.setItem(STORAGE_KEY, env); } catch (e) {}
    if (window.location.protocol === 'file:') {
      try { window.name = WIN_PREFIX + env; } catch (e) {}
    }
  }

  function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  let readMap = loadReadMap();

  function isRead(topicId) {
    return Boolean(topicId && readMap[topicId]);
  }

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
    readStat: document.getElementById('lm-read-stat'),
    readNum: document.getElementById('lm-read-num'),
    readProgress: document.getElementById('lm-read-progress'),
    cards: new Map(),
    mobileCats: new Map(),
    edges: [],
  };
  root.querySelectorAll('.lm-card[data-category]').forEach((card) => {
    el.cards.set(card.dataset.category, {
      card,
      button: card.querySelector('.lm-card-btn'),
      count: card.querySelector('.lm-card-count'),
      badge: card.querySelector('.lm-step-badge'),
    });
  });
  root.querySelectorAll('.lm-mobile-cat[data-mobile-cat]').forEach((details) => {
    el.mobileCats.set(details.dataset.mobileCat, {
      details,
      count: details.querySelector('.lm-mobile-count'),
    });
  });
  root.querySelectorAll('.lm-edge[data-source][data-target]').forEach((group) => {
    el.edges.push({ group, source: group.dataset.source, target: group.dataset.target, parent: group.parentNode });
  });

  const state = { selected: null };

  function categoryReadCount(category) {
    return (category.topicIds || []).filter((id) => {
      const topic = topicById.get(id);
      return topic && topic.completed && isRead(id);
    }).length;
  }

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

  /** 「從這篇開始／繼續」：優先挑選路徑上第 1 篇「已發布且尚未讀過」的文章；若全數已讀則回傳全讀完狀態與第 1 篇供複習。 */
  function startHere(st) {
    const ordered = chainInOrder(st);
    let firstPublished = null;
    let firstUnread = null;
    let publishedCount = 0;
    let readCount = 0;

    for (let i = 0; i < ordered.length; i += 1) {
      const category = categoryById.get(ordered[i]);
      const step = st.layers.get(category.id) + 1;
      for (let j = 0; j < category.topicIds.length; j += 1) {
        const id = category.topicIds[j];
        const topic = topicById.get(id);
        if (topic && topic.completed && topic.path) {
          publishedCount += 1;
          if (!firstPublished) firstPublished = { topic, category, step };
          if (isRead(id)) {
            readCount += 1;
          } else if (!firstUnread) {
            firstUnread = { topic, category, step };
          }
        }
      }
    }

    if (!firstPublished) return null;
    if (firstUnread) {
      return { ...firstUnread, allRead: false, readCount, publishedCount };
    }
    return { ...firstPublished, allRead: true, readCount, publishedCount };
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
    const read = topic.completed && isRead(topic.id);
    const cls = topic.completed ? `is-published${read ? ' is-read' : ''}` : 'is-pending';
    return h('i', {
      className: `lm-dot ${cls}`,
      dataset: { topicDot: topic.id },
      'aria-hidden': 'true',
    });
  }

  function readToggleBtn(topic) {
    const read = isRead(topic.id);
    return h('button', {
      type: 'button',
      className: 'lm-read-toggle',
      dataset: { toggleTopic: topic.id },
      'aria-pressed': read ? 'true' : 'false',
      'aria-label': `${read ? '取消已讀' : '標記為已讀'}：「${topic.title}」`,
      text: read ? '✓ 已讀' : '標記已讀',
    });
  }

  function topicItem(topic, rank) {
    const read = topic.completed && isRead(topic.id);
    const children = [h('span', { className: 'lm-rank', text: String(rank) }), dot(topic)];
    if (topic.completed && topic.path) {
      children.push(h('a', { href: topic.path, text: topic.title }));
      children.push(readToggleBtn(topic));
      return h('li', { className: read ? 'is-read' : null, dataset: { topicId: topic.id } }, children);
    }
    children.push(h('span', { text: topic.title }));
    children.push(h('em', { className: 'lm-pending-tag', text: PENDING_LABEL }));
    return h('li', { className: 'is-pending' }, children);
  }

  // ---- 面板 ----

  function renderStepCategory(st, categoryId) {
    const category = categoryById.get(categoryId);
    const isSelected = categoryId === st.selected;
    const readCount = categoryReadCount(category);
    const pct = category.total ? Math.round((category.published / category.total) * 100) : 0;
    const countText = readCount > 0
      ? `已讀 ${readCount} · ${category.published}/${category.total}`
      : `${category.published}/${category.total}`;
    const children = [
      h('button', {
        type: 'button',
        className: 'lm-step-cat-btn',
        'aria-pressed': isSelected ? 'true' : 'false',
        'aria-label': `${category.name}，已讀 ${readCount} 篇、已發布 ${category.published} / ${category.total} 篇${isSelected ? '（目前選取）' : '，點選改以此分類為中心'}`,
        onClick: () => select(categoryId, { announce: true }),
      }, [
        h('span', { className: 'lm-step-cat-name', text: category.name }),
        h('span', { className: 'lm-step-cat-count', text: countText }),
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
    if (start.allRead) {
      return h('div', { className: 'lm-start is-done', dataset: { domain: start.category.domain } }, [
        h('p', { className: 'lm-start-label', text: `✓ 這條路徑已發布的 ${start.publishedCount} 篇皆已讀完` }),
        h('a', { className: 'lm-start-link', href: start.topic.path, text: `複習首篇：${start.topic.title}` }),
        h('p', { className: 'lm-start-meta', text: `${start.category.name} · 第 ${start.step} 步` }),
      ]);
    }
    const labelText = start.readCount > 0 ? '從這篇繼續（跳過已讀）' : '從這篇開始';
    return h('div', { className: 'lm-start', dataset: { domain: start.category.domain } }, [
      h('div', { className: 'lm-start-top' }, [
        h('p', { className: 'lm-start-label', text: labelText }),
        readToggleBtn(start.topic),
      ]),
      h('a', { className: 'lm-start-link', href: start.topic.path, text: start.topic.title }),
      h('p', { className: 'lm-start-meta', text: `${start.category.name} · 第 ${start.step} 步` }),
    ]);
  }

  function renderPanel(st) {
    const selected = categoryById.get(st.selected);
    let done = 0;
    let total = 0;
    let readDone = 0;
    st.chain.forEach((id) => {
      const cat = categoryById.get(id);
      done += cat.published;
      total += cat.total;
      readDone += categoryReadCount(cat);
    });
    const summary = h('p', { className: 'lm-panel-summary' }, [
      '以 ',
      h('b', { text: selected.name }),
      ` 為中心：先備 ${st.ancestors.size} 個分類、延伸 ${st.descendants.size} 個分類，路徑上已讀 ${readDone} / 已發布 ${done} 篇（共 ${total} 篇）。`,
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

  // ---- 已讀狀態套用到地圖與清單 ----

  function applyReadState() {
    readMap = loadReadMap();
    const totalTopics = (payload.stats && payload.stats.total) || (payload.topics || []).length;
    let totalRead = 0;
    (payload.topics || []).forEach((t) => {
      if (t.completed && isRead(t.id)) totalRead += 1;
    });

    if (el.readStat) el.readStat.hidden = false;
    if (el.readNum) el.readNum.textContent = String(totalRead);
    if (el.readProgress) {
      const readPct = totalTopics ? Math.round((totalRead / totalTopics) * 1000) / 10 : 0;
      el.readProgress.style.width = `${readPct}%`;
      const publishedTotal = (payload.stats && payload.stats.published) || 0;
      el.readProgress.parentNode.setAttribute('aria-valuetext', `已發布 ${publishedTotal} / ${totalTopics} 篇，已讀 ${totalRead} 篇`);
    }

    root.querySelectorAll('[data-topic-dot]').forEach((dotEl) => {
      const id = dotEl.dataset.topicDot;
      const topic = topicById.get(id);
      if (topic && topic.completed) {
        dotEl.classList.toggle('is-read', isRead(id));
      }
    });

    root.querySelectorAll('li[data-topic-id]').forEach((li) => {
      const id = li.dataset.topicId;
      li.classList.toggle('is-read', isRead(id));
    });

    root.querySelectorAll('[data-toggle-topic]').forEach((btn) => {
      const id = btn.dataset.toggleTopic;
      const topic = topicById.get(id);
      const read = isRead(id);
      btn.setAttribute('aria-pressed', read ? 'true' : 'false');
      btn.textContent = read ? '✓ 已讀' : '標記已讀';
      if (topic) {
        btn.setAttribute('aria-label', `${read ? '取消已讀' : '標記為已讀'}：「${topic.title}」`);
      }
    });

    el.cards.forEach((entry, catId) => {
      const category = categoryById.get(catId);
      if (!category) return;
      const rCount = categoryReadCount(category);
      const allRead = category.published > 0 && rCount === category.published;
      entry.card.classList.toggle('is-all-read', allRead);
      entry.button.setAttribute('aria-label', `${category.name}，已讀 ${rCount} 篇、已發布 ${category.published} / ${category.total} 篇`);
      if (entry.count) {
        entry.count.textContent = rCount > 0
          ? (allRead ? `✓ ${category.published}/${category.total}` : `${rCount}·${category.published}/${category.total}`)
          : `${category.published}/${category.total}`;
      }
    });

    el.mobileCats.forEach((entry, catId) => {
      const category = categoryById.get(catId);
      if (!category || !entry.count) return;
      const rCount = categoryReadCount(category);
      entry.count.textContent = rCount > 0
        ? `已讀 ${rCount} · ${category.published}/${category.total}`
        : `${category.published}/${category.total}`;
    });

    if (state.selected !== null && categoryById.has(state.selected)) {
      renderPanel(selectionState(state.selected));
    }
  }

  /**
   * 面板重繪會移除剛按下的按鈕；依序找「同區塊同篇」→「任一同篇」→「從這篇開始」的按鈕或連結，
   * 讓鍵盤焦點留在面板內而不是掉回 body。
   */
  function restorePanelFocus(topicId, wasInStart) {
    const sameTopic = Array.from(el.panelSelected.querySelectorAll('[data-toggle-topic]'))
      .filter((btn) => btn.dataset.toggleTopic === topicId);
    const target = sameTopic.find((btn) => Boolean(btn.closest('.lm-start')) === wasInStart)
      || sameTopic[0]
      || el.panelSelected.querySelector('.lm-start .lm-read-toggle, .lm-start-link');
    if (target) target.focus();
  }

  function toggleTopicRead(topicId, sourceBtn) {
    const topic = topicById.get(topicId);
    if (!topic || !topic.completed) return;
    const next = loadReadMap();
    const nowRead = !next[topicId];
    if (nowRead) {
      next[topicId] = todayLocal();
    } else {
      delete next[topicId];
    }
    saveReadMap(next);
    const wasInStart = Boolean(sourceBtn && sourceBtn.closest('.lm-start'));
    applyReadState();
    if (sourceBtn && !sourceBtn.isConnected) restorePanelFocus(topicId, wasInStart);
    announce(`${topic.title}：${nowRead ? '已標記為已讀' : '已取消已讀'}。`);
  }

  // ---- 事件 ----

  el.cards.forEach((entry, id) => {
    entry.button.addEventListener('click', () => toggle(id));
  });
  if (el.clear) {
    el.clear.addEventListener('click', () => clearSelection({ announce: true, restoreFocus: true }));
  }
  root.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-toggle-topic]');
    if (!btn) return;
    event.preventDefault();
    event.stopPropagation();
    toggleTopicRead(btn.dataset.toggleTopic, btn);
  });
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || state.selected === null) return;
    event.preventDefault();
    clearSelection({ announce: true, restoreFocus: true });
  });
  window.addEventListener('pageshow', () => applyReadState());
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key === STORAGE_KEY) applyReadState();
  });

  applyReadState();
})();
