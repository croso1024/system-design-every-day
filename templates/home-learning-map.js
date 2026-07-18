/* Homepage Learning Map runtime — inlined by scripts/lib/books.js */
(() => {
  const ROOT_ID = 'root-0';
  const TAU = Math.PI * 2;
  const EXTREME_ZOOM_RATIO = 0.45;
  const EXTREME_ZOOM_FLOOR = 0.22;
  const LAYOUT = {
    categoryRx: 400,
    categoryRy: 300,
    topicOutwardDepth: 150,
    topicTangentSpacing: 125,
    topicLayerSpacing: 120
  };
  const CLUSTER_PALETTE = [
    { fill: '#eef3f7', stroke: '#7890a5' },
    { fill: '#eef4f0', stroke: '#789486' },
    { fill: '#f5f1ea', stroke: '#9b8d75' },
    { fill: '#f3eff5', stroke: '#91829a' },
    { fill: '#f5eeee', stroke: '#9d8280' },
    { fill: '#eef4f4', stroke: '#739294' },
    { fill: '#f4f3ec', stroke: '#969276' },
    { fill: '#eff1f5', stroke: '#7f899b' }
  ];
  const DEFAULT_COLORS = {
    category: { fill: '#edf2f6', stroke: '#71899e' },
    completed: { fill: '#eef4f0', stroke: '#789486' },
    pending: { fill: '#eef3f7', stroke: '#7890a5' }
  };

  const state = {
    payload: null,
    categories: [],
    topicById: new Map(),
    originalPositions: new Map(),
    selectedCategoryIndex: null,
    selectedTopicId: null,
    clusterColors: false,
    keyboardCursor: -1,
    fitZoom: null,
    cy: null,
    resizeTimer: null
  };

  const el = {
    status: document.getElementById('lm-status'),
    mapContent: document.getElementById('lm-map-content'),
    colorToggle: document.getElementById('lm-color-toggle'),
    zoomIn: document.getElementById('lm-zoom-in'),
    zoomOut: document.getElementById('lm-zoom-out'),
    fit: document.getElementById('lm-fit-map'),
    reset: document.getElementById('lm-reset-map'),
    documentsTitle: document.getElementById('lm-documents-title'),
    documentsSummary: document.getElementById('lm-documents-summary'),
    documentsBody: document.getElementById('lm-documents-body'),
    fallback: document.getElementById('lm-fallback'),
    dataScript: document.getElementById('learning-map-data')
  };

  function setStatus(message, isError) {
    if (!el.status) return;
    el.status.textContent = message;
    el.status.classList.toggle('error', Boolean(isError));
  }

  function categoryAt(index) {
    return Number.isInteger(index) ? state.categories[index] : null;
  }

  function labelSideForOffset(dx, dy) {
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'bottom' : 'top';
  }

  function buildModel(payload) {
    state.categories = (payload.categories || []).map((category, index) => ({
      id: category.id,
      index,
      name: category.name,
      topicIds: Array.isArray(category.topicIds) ? category.topicIds.slice() : [],
      topics: [],
      adjacentIndexes: new Set()
    }));

    const categoryIndexById = new Map(state.categories.map((category) => [category.id, category.index]));
    const categoryIndexByName = new Map(state.categories.map((category) => [category.name, category.index]));

    state.topicById = new Map();
    (payload.topics || []).forEach((topic) => {
      const categoryIndex = categoryIndexByName.get(topic.category);
      const modeled = {
        id: topic.id,
        title: topic.title,
        categoryIndex,
        completed: Boolean(topic.completed),
        completed_at: topic.completed_at || null,
        path: topic.path || null
      };
      state.topicById.set(topic.id, modeled);
      if (Number.isInteger(categoryIndex)) {
        state.categories[categoryIndex].topics.push(modeled);
      }
    });

    state.categories.forEach((category) => {
      category.topics.sort((left, right) =>
        left.title.localeCompare(right.title, 'zh-Hant')
        || left.id.localeCompare(right.id)
      );
    });

    (payload.categoryRelations || []).forEach((relation) => {
      const sourceIndex = categoryIndexById.get(relation.sourceCategory);
      const targetIndex = categoryIndexById.get(relation.targetCategory);
      if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) return;
      state.categories[sourceIndex].adjacentIndexes.add(targetIndex);
      state.categories[targetIndex].adjacentIndexes.add(sourceIndex);
    });
  }

  function compareTopicsStable(left, right) {
    const titleOrder = left.title.localeCompare(right.title, 'zh-Hant');
    if (titleOrder !== 0) return titleOrder;
    return String(left.id).localeCompare(String(right.id));
  }

  /**
   * Longest-path layering on same-category prerequisite DAG.
   * Roots stay near the hub; dependents fan outward by layer.
   */
  function computeTopicLayers(topics, prereqEdges) {
    const topicById = new Map(topics.map((topic) => [topic.id, topic]));
    const indegree = new Map(topics.map((topic) => [topic.id, 0]));
    const children = new Map(topics.map((topic) => [topic.id, []]));
    const layerById = new Map(topics.map((topic) => [topic.id, 0]));

    prereqEdges.forEach((edge) => {
      if (!topicById.has(edge.from) || !topicById.has(edge.to) || edge.from === edge.to) return;
      children.get(edge.from).push(edge.to);
      indegree.set(edge.to, indegree.get(edge.to) + 1);
    });

    const remaining = new Map(indegree);
    const ready = topics
      .filter((topic) => remaining.get(topic.id) === 0)
      .sort(compareTopicsStable)
      .map((topic) => topic.id);

    while (ready.length) {
      const nodeId = ready.shift();
      (children.get(nodeId) || []).forEach((childId) => {
        layerById.set(childId, Math.max(layerById.get(childId) || 0, (layerById.get(nodeId) || 0) + 1));
        remaining.set(childId, remaining.get(childId) - 1);
        if (remaining.get(childId) === 0) {
          ready.push(childId);
          ready.sort((leftId, rightId) =>
            compareTopicsStable(topicById.get(leftId), topicById.get(rightId))
          );
        }
      });
    }

    topics.forEach((topic) => {
      if (!layerById.has(topic.id)) layerById.set(topic.id, 0);
    });

    const layers = new Map();
    topics.forEach((topic) => {
      const layerIndex = layerById.get(topic.id) || 0;
      if (!layers.has(layerIndex)) layers.set(layerIndex, []);
      layers.get(layerIndex).push(topic);
    });
    [...layers.values()].forEach((list) => list.sort(compareTopicsStable));
    return layers;
  }

  function categoryPrereqEdges(category) {
    return (state.payload && Array.isArray(state.payload.topicRelations) ? state.payload.topicRelations : [])
      .filter((relation) =>
        relation
        && relation.type === 'prerequisite'
        && relation.category === category.id
      )
      .map((relation) => ({ from: relation.source, to: relation.target }));
  }

  function calculatePositions() {
    const positions = new Map([[ROOT_ID, { x: 0, y: 0 }]]);
    const categoryCount = state.categories.length;
    if (!categoryCount) return positions;

    const {
      categoryRx,
      categoryRy,
      topicOutwardDepth,
      topicTangentSpacing,
      topicLayerSpacing
    } = LAYOUT;
    const fullSector = TAU / categoryCount;

    state.categories.forEach((category, categoryIndex) => {
      const centerAngle = -Math.PI / 2 + categoryIndex * fullSector;
      const hubX = Math.cos(centerAngle) * categoryRx;
      const hubY = Math.sin(centerAngle) * categoryRy;
      positions.set(category.id, { x: hubX, y: hubY });

      const layers = computeTopicLayers(category.topics, categoryPrereqEdges(category));
      [...layers.keys()].sort((left, right) => left - right).forEach((layerIndex) => {
        const topicsOnLayer = layers.get(layerIndex) || [];
        const depth = topicOutwardDepth + layerIndex * topicLayerSpacing;
        const halfSpan = topicsOnLayer.length > 1
          ? ((topicsOnLayer.length - 1) * topicTangentSpacing) / (2 * depth)
          : 0;

        topicsOnLayer.forEach((topic, slot) => {
          const ratio = topicsOnLayer.length === 1 ? 0.5 : slot / (topicsOnLayer.length - 1);
          const localAngle = centerAngle - halfSpan + halfSpan * 2 * ratio;
          positions.set(topic.id, {
            x: hubX + Math.cos(localAngle) * depth,
            y: hubY + Math.sin(localAngle) * depth
          });
        });
      });
    });
    return positions;
  }

  function nodeColors(categoryIndex, completed, kind) {
    if (state.clusterColors) return CLUSTER_PALETTE[categoryIndex % CLUSTER_PALETTE.length];
    if (kind === 'category') return DEFAULT_COLORS.category;
    return completed ? DEFAULT_COLORS.completed : DEFAULT_COLORS.pending;
  }

  function createElements() {
    state.originalPositions = calculatePositions();
    const root = (state.payload && state.payload.root) || { id: ROOT_ID, label: 'System Design\nEvery Day' };
    const elements = [{
      group: 'nodes',
      data: { id: root.id || ROOT_ID, kind: 'root', label: root.label || 'System Design\nEvery Day' },
      position: state.originalPositions.get(ROOT_ID),
      classes: 'root'
    }];

    state.categories.forEach((category) => {
      const colors = nodeColors(category.index, false, 'category');
      elements.push({
        group: 'nodes',
        data: {
          id: category.id,
          kind: 'category',
          categoryIndex: category.index,
          label: `${category.name}\n${category.topics.length} topics`,
          fill: colors.fill,
          stroke: colors.stroke
        },
        position: state.originalPositions.get(category.id),
        classes: 'category'
      });
      elements.push({
        group: 'edges',
        data: {
          id: `hierarchy-root-${category.index}`,
          source: ROOT_ID,
          target: category.id,
          categoryIndex: category.index
        },
        classes: 'hierarchy root-category'
      });

      category.topics.forEach((topic, topicIndex) => {
        const topicColors = nodeColors(category.index, topic.completed, 'topic');
        const topicPosition = state.originalPositions.get(topic.id);
        const hubPosition = state.originalPositions.get(category.id);
        const dx = topicPosition && hubPosition ? topicPosition.x - hubPosition.x : 0;
        const dy = topicPosition && hubPosition ? topicPosition.y - hubPosition.y : 0;
        const labelSide = labelSideForOffset(dx, dy);
        elements.push({
          group: 'nodes',
          data: {
            id: topic.id,
            kind: 'topic',
            categoryIndex: category.index,
            label: topic.title,
            fill: topicColors.fill,
            stroke: topicColors.stroke
          },
          position: topicPosition,
          classes: `topic label-${labelSide} ${topic.completed ? 'completed' : 'pending'}`
        });
        elements.push({
          group: 'edges',
          data: {
            id: `hierarchy-topic-${category.index}-${topicIndex}`,
            source: category.id,
            target: topic.id,
            categoryIndex: category.index
          },
          classes: 'hierarchy category-topic'
        });
      });
    });

    const categoryIndexById = new Map(state.categories.map((category) => [category.id, category.index]));

    (state.payload.categoryRelations || []).forEach((relation, relationIndex) => {
      elements.push({
        group: 'edges',
        data: {
          id: `relation-${relationIndex}`,
          source: relation.sourceCategory,
          target: relation.targetCategory,
          sourceCategoryIndex: categoryIndexById.get(relation.sourceCategory) ?? -1,
          targetCategoryIndex: categoryIndexById.get(relation.targetCategory) ?? -1,
          count: relation.count,
          relationType: relation.type
        },
        classes: `category-relation ${relation.type}`
      });
    });

    (state.payload.topicRelations || []).forEach((relation, relationIndex) => {
      const categoryIndex = categoryIndexById.get(relation.category);
      if (!Number.isInteger(categoryIndex)) return;
      if (!state.topicById.has(relation.source) || !state.topicById.has(relation.target)) return;
      elements.push({
        group: 'edges',
        data: {
          id: `topic-relation-${relationIndex}`,
          source: relation.source,
          target: relation.target,
          categoryIndex,
          relationType: relation.type
        },
        classes: `topic-relation ${relation.type}`
      });
    });

    return elements;
  }

  function graphStyles() {
    return [
      {
        selector: 'node',
        style: {
          'font-family': '"Noto Sans TC", system-ui, sans-serif',
          'color': '#262a2f',
          'text-wrap': 'wrap',
          'text-valign': 'center',
          'text-halign': 'center',
          'overlay-opacity': 0
        }
      },
      {
        selector: 'node.root',
        style: {
          'shape': 'ellipse',
          'width': 168,
          'height': 70,
          'background-color': '#f2f4f5',
          'border-width': 1.2,
          'border-color': '#8797a4',
          'label': 'data(label)',
          'font-size': 16,
          'font-weight': 700,
          'text-max-width': 148
        }
      },
      {
        selector: 'node.category',
        style: {
          'shape': 'round-rectangle',
          'width': 152,
          'height': 44,
          'background-color': 'data(fill)',
          'background-opacity': 0.88,
          'border-width': 1.1,
          'border-color': 'data(stroke)',
          'label': 'data(label)',
          'font-size': 11,
          'font-weight': 700,
          'text-max-width': 132,
          'padding': 4
        }
      },
      {
        selector: 'node.topic',
        style: {
          'shape': 'ellipse',
          'width': 20,
          'height': 20,
          'background-color': 'data(fill)',
          'border-width': 1.8,
          'border-color': 'data(stroke)',
          'label': 'data(label)',
          'font-size': 11,
          'font-weight': 500,
          'color': '#92979e',
          'text-opacity': 0.6,
          'text-max-width': 128,
          'text-valign': 'center',
          'text-background-color': '#ffffff',
          'text-background-opacity': 0,
          'text-background-padding': 3,
          'text-background-shape': 'roundrectangle',
          'text-border-width': 0,
          'min-zoomed-font-size': 0
        }
      },
      {
        selector: 'node.topic.label-right',
        style: { 'text-halign': 'right', 'text-margin-x': 12 }
      },
      {
        selector: 'node.topic.label-left',
        style: { 'text-halign': 'left', 'text-margin-x': -12 }
      },
      {
        selector: 'node.topic.label-top',
        style: { 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -10 }
      },
      {
        selector: 'node.topic.label-bottom',
        style: { 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 10 }
      },
      {
        selector: 'node.topic.pending',
        style: {
          'width': 17,
          'height': 17,
          'background-opacity': 0.4,
          'border-style': 'dashed'
        }
      },
      {
        selector: 'edge.hierarchy',
        style: {
          'width': 0.8,
          'line-color': '#dfe4e7',
          'target-arrow-shape': 'none',
          'curve-style': 'bezier',
          'opacity': 0.42
        }
      },
      {
        selector: 'edge.root-category',
        style: { 'width': 1, 'line-color': '#d5dde2', 'opacity': 0.54 }
      },
      {
        selector: 'edge.category-relation',
        style: {
          'width': 1.15,
          'curve-style': 'unbundled-bezier',
          'control-point-distances': 70,
          'control-point-weights': 0.5,
          'opacity': 0.22
        }
      },
      {
        selector: 'edge.prerequisite',
        style: {
          'line-color': '#7f909d',
          'target-arrow-color': '#7f909d',
          'target-arrow-shape': 'triangle',
          'arrow-scale': 0.75,
          'line-style': 'solid'
        }
      },
      {
        selector: 'edge.related',
        style: {
          'line-color': '#a7adb2',
          'target-arrow-shape': 'none',
          'line-style': 'dashed'
        }
      },
      {
        selector: 'edge.topic-relation',
        style: {
          'width': 1.35,
          'curve-style': 'bezier',
          'opacity': 0,
          'events': 'no',
          'z-index': 1
        }
      },
      {
        selector: 'edge.topic-relation.cluster-active',
        style: {
          'opacity': 0.9,
          'events': 'yes',
          'width': 1.7
        }
      },
      {
        selector: 'node.cluster-muted',
        style: { 'opacity': 0.3, 'text-opacity': 0.28 }
      },
      {
        selector: 'node.cluster-neighbor',
        style: { 'opacity': 0.72, 'text-opacity': 0.7 }
      },
      {
        selector: 'node.cluster-active',
        style: { 'opacity': 1, 'text-opacity': 1 }
      },
      {
        selector: 'node.topic.cluster-active',
        style: { 'color': '#262a2f', 'text-opacity': 1, 'font-weight': 600 }
      },
      {
        selector: 'node.category.cluster-active',
        style: {
          'border-width': 2,
          'underlay-color': 'data(fill)',
          'underlay-opacity': 0.2,
          'underlay-padding': 10
        }
      },
      {
        selector: 'node.topic-selected',
        style: {
          'width': 24,
          'height': 24,
          'border-width': 3,
          'border-color': '#394b5a',
          'color': '#262a2f',
          'text-opacity': 1,
          'text-background-opacity': 0.96,
          'text-border-width': 1,
          'text-border-color': '#d9dddf',
          'underlay-color': 'data(fill)',
          'underlay-opacity': 0.24,
          'underlay-padding': 8
        }
      },
      {
        selector: 'node.topic.node-hover',
        style: {
          'color': '#262a2f',
          'text-opacity': 1,
          'text-background-opacity': 0.96,
          'text-border-width': 1,
          'text-border-color': '#e2e1de'
        }
      },
      {
        selector: 'node.topic.semantic-extreme',
        style: { 'text-opacity': 0.22, 'font-weight': 400 }
      },
      {
        selector: 'node.topic.semantic-extreme.cluster-active',
        style: { 'text-opacity': 0.85, 'font-weight': 600 }
      },
      {
        selector: 'node.topic.semantic-extreme.node-hover',
        style: { 'text-opacity': 1, 'text-background-opacity': 0.96 }
      },
      {
        selector: 'node.topic.semantic-extreme.topic-selected',
        style: { 'text-opacity': 1, 'text-background-opacity': 0.96 }
      },
      {
        selector: 'node.keyboard-target',
        style: {
          'underlay-color': '#6f8ba3',
          'underlay-opacity': 0.2,
          'underlay-padding': 9
        }
      },
      {
        selector: 'edge.cluster-muted',
        style: { 'opacity': 0.1 }
      },
      {
        selector: 'edge.cluster-active',
        style: { 'opacity': 0.78, 'width': 1.9 }
      }
    ];
  }

  function updateSemanticZoom() {
    if (!state.cy) return;
    const zoom = state.cy.zoom();
    const baseline = state.fitZoom || zoom;
    const extremeThreshold = Math.max(EXTREME_ZOOM_FLOOR, baseline * EXTREME_ZOOM_RATIO);
    const extreme = zoom < extremeThreshold;
    state.cy.nodes('.topic').forEach((node) => {
      if (extreme) node.addClass('semantic-extreme');
      else node.removeClass('semantic-extreme');
    });
  }

  function updateTopicLabelSides() {
    if (!state.cy) return;
    state.categories.forEach((category) => {
      const hubPosition = state.originalPositions.get(category.id);
      if (!hubPosition) return;
      category.topics.forEach((topic) => {
        const topicPosition = state.originalPositions.get(topic.id);
        if (!topicPosition) return;
        const node = state.cy.getElementById(topic.id);
        if (!node.length) return;
        node.removeClass('label-left label-right label-top label-bottom');
        node.addClass(`label-${labelSideForOffset(
          topicPosition.x - hubPosition.x,
          topicPosition.y - hubPosition.y
        )}`);
      });
    });
  }

  function restorePresetPositions() {
    if (!state.cy) return;
    state.cy.nodes().forEach((node) => {
      const position = state.originalPositions.get(node.id());
      if (position) node.position({ x: position.x, y: position.y });
    });
  }

  function fitGraph(recordBaseline) {
    if (!state.cy || !state.cy.elements().length) return;
    state.cy.resize();
    state.cy.fit(state.cy.elements(), 48);
    if (recordBaseline || state.fitZoom == null) {
      state.fitZoom = state.cy.zoom();
    }
    updateSemanticZoom();
  }

  function recomputeLayoutAndFit() {
    if (!state.cy) return;
    state.originalPositions = calculatePositions();
    restorePresetPositions();
    updateTopicLabelSides();
    fitGraph(true);
  }

  function updateNodeColors() {
    if (!state.cy) return;
    state.cy.nodes().forEach((node) => {
      const kind = node.data('kind');
      if (kind !== 'category' && kind !== 'topic') return;
      const topic = kind === 'topic' ? state.topicById.get(node.id()) : null;
      const colors = nodeColors(
        node.data('categoryIndex'),
        Boolean(topic && topic.completed),
        kind
      );
      node.data('fill', colors.fill);
      node.data('stroke', colors.stroke);
    });
  }

  function renderInitialDocumentHint() {
    el.documentsTitle.textContent = '分群文件';
    el.documentsSummary.textContent = '';
    const hint = document.createElement('p');
    hint.className = 'lm-documents-hint';
    hint.textContent = '點選 category hub 或 topic satellite 以查看該分群文件。鍵盤使用者可在顯示清單後，以 Tab 移動至文件連結或「在圖上定位」按鈕。';
    el.documentsBody.replaceChildren(hint);
  }

  function renderDocuments(scrollToSelected) {
    const category = categoryAt(state.selectedCategoryIndex);
    if (!category) {
      renderInitialDocumentHint();
      return;
    }

    const completedCount = category.topics.filter((topic) => topic.completed).length;
    el.documentsTitle.textContent = category.name;
    el.documentsSummary.textContent = `${completedCount} / ${category.topics.length} 已完成`;
    const list = document.createElement('ul');
    list.className = 'lm-document-list';

    category.topics.forEach((topic) => {
      const row = document.createElement('li');
      row.className = 'lm-document-row';
      row.dataset.topicId = topic.id;
      if (topic.id === state.selectedTopicId) row.classList.add('selected');

      const title = document.createElement('div');
      title.className = 'lm-document-title';
      if (topic.completed && topic.path) {
        const articleLink = document.createElement('a');
        articleLink.href = topic.path;
        articleLink.textContent = topic.title;
        articleLink.setAttribute('data-completed-link', topic.path);
        articleLink.setAttribute('aria-label', `閱讀已完成文件：${topic.title}`);
        title.append(articleLink);
      } else {
        const pendingTitle = document.createElement('span');
        pendingTitle.textContent = topic.title;
        title.append(pendingTitle);
      }

      const meta = document.createElement('div');
      meta.className = 'lm-document-meta';
      meta.textContent = topic.completed
        ? `已完成 · 發佈日期：${topic.completed_at || 'N/A'}`
        : '待學習 · 尚未發佈';

      const locate = document.createElement('button');
      locate.type = 'button';
      locate.className = 'lm-locate-button';
      locate.textContent = '在圖上定位';
      locate.setAttribute('aria-label', `在學習圖譜上選取 ${topic.title}`);
      locate.addEventListener('click', () => {
        selectCluster(category.index, topic.id, true);
        const graphNode = state.cy && state.cy.getElementById(topic.id);
        if (graphNode && graphNode.length) {
          state.cy.animate(
            { center: { eles: graphNode }, zoom: Math.max(state.cy.zoom(), 0.72) },
            { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220 }
          );
        }
      });

      row.append(title, meta, locate);
      list.append(row);
    });

    el.documentsBody.replaceChildren(list);
    if (scrollToSelected && state.selectedTopicId) {
      requestAnimationFrame(() => {
        const selectedRow = [...list.children].find((row) => row.dataset.topicId === state.selectedTopicId);
        if (selectedRow) selectedRow.scrollIntoView({ block: 'nearest', behavior: 'auto' });
      });
    }
  }

  function applySelectionStyles() {
    if (!state.cy) return;
    const selectionClasses = 'cluster-muted cluster-neighbor cluster-active topic-selected';
    state.cy.nodes().removeClass(selectionClasses);
    state.cy.edges().removeClass('cluster-muted cluster-active');
    if (!Number.isInteger(state.selectedCategoryIndex)) {
      updateSemanticZoom();
      return;
    }

    const selectedCategory = categoryAt(state.selectedCategoryIndex);
    const adjacentIndexes = selectedCategory ? selectedCategory.adjacentIndexes : new Set();
    state.cy.nodes().forEach((node) => {
      if (node.id() === ROOT_ID) return;
      const nodeCategoryIndex = node.data('categoryIndex');
      if (nodeCategoryIndex === state.selectedCategoryIndex) {
        node.addClass('cluster-active');
      } else if (node.data('kind') === 'category' && adjacentIndexes.has(nodeCategoryIndex)) {
        node.addClass('cluster-neighbor');
      } else {
        node.addClass('cluster-muted');
      }
      if (node.id() === state.selectedTopicId) node.addClass('topic-selected');
    });

    state.cy.edges().forEach((edge) => {
      if (edge.hasClass('hierarchy')) {
        edge.addClass(edge.data('categoryIndex') === state.selectedCategoryIndex ? 'cluster-active' : 'cluster-muted');
        return;
      }
      if (edge.hasClass('topic-relation')) {
        if (edge.data('categoryIndex') === state.selectedCategoryIndex) {
          edge.addClass('cluster-active');
        }
        return;
      }
      const connected = edge.data('sourceCategoryIndex') === state.selectedCategoryIndex
        || edge.data('targetCategoryIndex') === state.selectedCategoryIndex;
      edge.addClass(connected ? 'cluster-active' : 'cluster-muted');
    });
    updateSemanticZoom();
  }

  function selectCluster(categoryIndex, topicId, announce) {
    if (!categoryAt(categoryIndex)) return;
    state.selectedCategoryIndex = categoryIndex;
    state.selectedTopicId = topicId || null;
    applySelectionStyles();
    renderDocuments(Boolean(topicId));
    if (announce) {
      const category = categoryAt(categoryIndex);
      const selectedTopic = topicId ? state.topicById.get(topicId) : null;
      setStatus(selectedTopic
        ? `已選取 ${selectedTopic.title}，並聚焦 ${category.name} 分群。`
        : `已聚焦 ${category.name} 分群。`);
    }
  }

  function clearSelection(announce) {
    state.selectedCategoryIndex = null;
    state.selectedTopicId = null;
    state.keyboardCursor = -1;
    if (state.cy) state.cy.nodes().removeClass('keyboard-target');
    applySelectionStyles();
    renderInitialDocumentHint();
    if (announce) setStatus('已清除分群選取。');
  }

  function handleGraphKeyboard(event) {
    if (!state.cy) return;
    const isNext = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const isPrevious = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!isNext && !isPrevious && event.key !== 'Escape') return;
    event.preventDefault();

    if (event.key === 'Escape') {
      state.keyboardCursor = -1;
      state.cy.nodes().removeClass('keyboard-target');
      clearSelection(true);
      return;
    }

    const selectableNodes = state.cy.nodes().filter((node) => node.data('kind') !== 'root');
    if (!selectableNodes.length) return;
    const step = isNext ? 1 : -1;
    state.keyboardCursor = (state.keyboardCursor + step + selectableNodes.length) % selectableNodes.length;
    const targetNode = selectableNodes[state.keyboardCursor];
    state.cy.nodes().removeClass('keyboard-target');
    targetNode.addClass('keyboard-target');

    if (targetNode.data('kind') === 'category') {
      selectCluster(targetNode.data('categoryIndex'), null, false);
    } else {
      selectCluster(targetNode.data('categoryIndex'), targetNode.id(), false);
    }
    state.cy.center(targetNode);
    setStatus(`鍵盤已選取 ${targetNode.data('label').replace('\n', '，')}。使用方向鍵繼續瀏覽，按 Escape 清除選取。`);
  }

  function initializeGraph() {
    state.cy = cytoscape({
      container: document.getElementById('cy'),
      elements: createElements(),
      style: graphStyles(),
      layout: { name: 'preset', fit: false, animate: false },
      minZoom: 0.12,
      maxZoom: 2.8,
      wheelSensitivity: 0.16,
      autoungrabify: false,
      userPanningEnabled: true,
      userZoomingEnabled: true,
      boxSelectionEnabled: false
    });

    state.cy.on('tap', 'node', (event) => {
      state.cy.nodes().removeClass('keyboard-target');
      state.keyboardCursor = -1;
      const node = event.target;
      const kind = node.data('kind');
      if (kind === 'category') {
        selectCluster(node.data('categoryIndex'), null, true);
      } else if (kind === 'topic') {
        selectCluster(node.data('categoryIndex'), node.id(), true);
      } else {
        clearSelection(true);
      }
    });
    state.cy.on('tap', (event) => {
      if (event.target === state.cy) clearSelection(true);
    });
    state.cy.on('mouseover', 'node.topic', (event) => {
      event.target.addClass('node-hover');
    });
    state.cy.on('mouseout', 'node.topic', (event) => {
      event.target.removeClass('node-hover');
      updateSemanticZoom();
    });
    state.cy.on('zoom', updateSemanticZoom);
    document.getElementById('cy').addEventListener('keydown', handleGraphKeyboard);

    requestAnimationFrame(() => {
      fitGraph(true);
    });
  }

  function resetMap() {
    state.clusterColors = false;
    state.keyboardCursor = -1;
    el.colorToggle.setAttribute('aria-pressed', 'false');
    el.colorToggle.textContent = '分群色彩：關閉';
    if (state.cy) state.cy.nodes().removeClass('keyboard-target');
    updateNodeColors();
    clearSelection(false);
    recomputeLayoutAndFit();
    setStatus('已重設位置、縮放、分群選取與分群色彩。');
  }

  function boot() {
    try {
      if (!el.dataScript) throw new Error('找不到 learning-map-data');
      const payload = JSON.parse(el.dataScript.textContent);
      if (!payload || !Array.isArray(payload.categories) || !Array.isArray(payload.topics)) {
        throw new Error('learning-map-data 格式不符');
      }
      if (typeof cytoscape !== 'function') {
        throw new Error('Cytoscape.js CDN 無法載入');
      }

      state.payload = payload;
      buildModel(payload);
      el.mapContent.classList.remove('lm-hidden');
      initializeGraph();
      renderInitialDocumentHint();
      setStatus(`已載入 ${payload.topics.length} 個 topics、${state.categories.length} 個 categories。點選節點可聚焦分群。`);
    } catch (error) {
      // 圖譜載入失敗（CDN 失效 / cytoscape 未定義 / payload 解析失敗）→ 解除隱藏 server-rendered 後備清單。
      if (el.mapContent) el.mapContent.classList.add('lm-hidden');
      if (el.fallback) el.fallback.classList.remove('lm-hidden');
      setStatus(`無法載入學習地圖，已改用純文字文章清單。（${error.message}）`, true);
    }
  }

  el.colorToggle.addEventListener('click', () => {
    state.clusterColors = !state.clusterColors;
    el.colorToggle.setAttribute('aria-pressed', String(state.clusterColors));
    el.colorToggle.textContent = `分群色彩：${state.clusterColors ? '開啟' : '關閉'}`;
    updateNodeColors();
    setStatus(state.clusterColors ? '已開啟分群色彩。' : '已關閉分群色彩。');
  });
  el.zoomIn.addEventListener('click', () => {
    if (!state.cy) return;
    state.cy.zoom({
      level: Math.min(state.cy.maxZoom(), state.cy.zoom() * 1.2),
      renderedPosition: { x: state.cy.width() / 2, y: state.cy.height() / 2 }
    });
  });
  el.zoomOut.addEventListener('click', () => {
    if (!state.cy) return;
    state.cy.zoom({
      level: Math.max(state.cy.minZoom(), state.cy.zoom() / 1.2),
      renderedPosition: { x: state.cy.width() / 2, y: state.cy.height() / 2 }
    });
  });
  el.fit.addEventListener('click', () => {
    fitGraph(true);
    setStatus('已將完整學習圖譜適應畫布。');
  });
  el.reset.addEventListener('click', resetMap);

  window.addEventListener('resize', () => {
    if (!state.cy) return;
    window.clearTimeout(state.resizeTimer);
    state.resizeTimer = window.setTimeout(() => {
      // 只重新 resize + fit 以貼合新視窗；preset 位置與 LAYOUT 常數皆與視窗尺寸無關，
      // 故毋須（也不應）重算佈局——重算會呼叫 restorePresetPositions() 抹掉使用者手動拖曳。
      fitGraph(true);
    }, 160);
  });

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
