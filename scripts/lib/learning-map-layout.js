'use strict';

/**
 * learning-map-layout.js — 首頁知識地圖的純函式排版模組（產頁時計算，前端不重算）。
 *
 * 輸入：分類（含所屬領域與文章 id 清單）、領域順序、分類層 prerequisite 邊。
 * 輸出：payload v2 的 `layout` 區塊（欄、卡片座標、獨立主題區塊、走線路徑）以及每個分類的欄號。
 *
 * 排版規則（對應設計稿 C-1）：
 *   - 欄 = 分類在 prerequisite DAG 上的最長路徑深度（拓撲排序後單趟計算；有循環直接 throw）。
 *   - 同欄順序只在 `compareSameColumn` 這一個 comparator 決定：先依「前驅卡片中心 y 的平均」(barycenter)，
 *     沒有前驅時依領域順序，最後一律比分類名稱的 code point。
 *   - 完全沒有 prerequisite 關係的分類不進 DAG，排在下方的「獨立主題」區塊。
 *   - 跨越多欄的 edge 在每個中間欄從卡片之間的空隙穿過（`gapCrossingY`），同一欄的穿越點彼此錯開。
 *   - 所有卡片等高：任一分類文章數超過 DOTS_PER_ROW 時，全部卡片改為兩列高度。
 *
 * 可重現性（決策 14）：排序只比數字與 code point、不用 localeCompare；座標只用加減乘除，
 * 輸出時才四捨五入到小數 1 位。相同輸入在任何 Node 版本都產生逐位元相同的結果。
 */

const { compareCodePoint } = require('./categories');

// ---- 尺寸常數（CSS 以 payload 帶出的值為準，模板不另外維護） ----
const CARD_W = 164;
const CARD_H_ONE_ROW = 62;
const CARD_H_TWO_ROWS = 76;
const DOTS_PER_ROW = 11;        // 決策 7：點點一列最多 11 顆
const PAD_X = 24;               // 畫布左右內距
const COL_STEP = 205;           // 欄距（CARD_W + 41px 走線溝槽）
const GUTTER = COL_STEP - CARD_W;
const CARD_GAP = 16;            // 同欄卡片間距
const LABEL_TOP = 22;           // 欄標題的 y
const ROUTE_TOP = 40;           // 走線可用區域上緣（欄標題之下）
const DAG_Y0 = 56;              // 第一張卡片的 y
const DAG_BOTTOM_PAD = 16;
const ISOLATED_GAP = 36;        // DAG 底部到「獨立主題」標題的距離
const ISOLATED_LABEL_H = 28;    // 標題列到第一排獨立卡片的距離
const EDGE_CLEARANCE = 8;       // 穿越點與卡片邊緣的最小距離
const EDGE_SEPARATION = 6;      // 同欄穿越點之間的最小距離
const POP_ROW_H = 26;           // hover 浮出清單每列高度（估算 pop 方向用）
const POP_PAD = 12;
const ARROW_SIZE = 7;
const COLUMN_LABEL_FIRST = '起點';
const COLUMN_LABEL_LAST = '延伸';
const ISOLATED_LABEL = '獨立主題';

/** 四捨五入到小數 1 位（只在輸出時使用）。 */
function round1(value) {
  return Math.round(value * 10) / 10;
}

// ---- 輸入檢查 ----------------------------------------------------------------

function normalizeInput(input) {
  if (!input || typeof input !== 'object') throw new Error('learning-map-layout: 缺少輸入');
  const domains = Array.isArray(input.domains) ? input.domains : [];
  const categories = Array.isArray(input.categories) ? input.categories : [];
  const prereqs = Array.isArray(input.categoryPrereqs) ? input.categoryPrereqs : [];

  const domainRank = new Map();
  domains.forEach((domain, index) => {
    if (!domain || typeof domain.id !== 'string') throw new Error(`learning-map-layout: domains[${index}] 缺少 id`);
    if (domainRank.has(domain.id)) throw new Error(`learning-map-layout: domain "${domain.id}" 重複`);
    domainRank.set(domain.id, index);
  });

  const categoryById = new Map();
  categories.forEach((category, index) => {
    if (!category || typeof category.id !== 'string' || !category.id) {
      throw new Error(`learning-map-layout: categories[${index}] 缺少 id`);
    }
    if (categoryById.has(category.id)) throw new Error(`learning-map-layout: 分類 id "${category.id}" 重複`);
    if (!domainRank.has(category.domain)) {
      throw new Error(`learning-map-layout: 分類 "${category.id}" 的 domain "${category.domain}" 不在 domains`);
    }
    const topicCount = Array.isArray(category.topicIds)
      ? category.topicIds.length
      : (Number.isInteger(category.topicCount) ? category.topicCount : 0);
    categoryById.set(category.id, {
      id: category.id,
      name: typeof category.name === 'string' ? category.name : category.id,
      domain: category.domain,
      topicCount,
    });
  });

  const seenEdges = new Set();
  const edges = [];
  prereqs.forEach((edge, index) => {
    if (!edge || typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      throw new Error(`learning-map-layout: categoryPrereqs[${index}] 缺少 source / target`);
    }
    if (!categoryById.has(edge.source) || !categoryById.has(edge.target)) {
      throw new Error(`learning-map-layout: categoryPrereqs[${index}] 指向未知分類：${edge.source} -> ${edge.target}`);
    }
    if (edge.source === edge.target) {
      throw new Error(`learning-map-layout: categoryPrereqs[${index}] 為自環：${edge.source}`);
    }
    const key = `${edge.source}|${edge.target}`;
    if (seenEdges.has(key)) return; // 同一對分類的多條文章 edge 已在上游聚合；此處只防禦重複
    seenEdges.add(key);
    edges.push({ source: edge.source, target: edge.target });
  });

  return { domainRank, categoryById, edges };
}

// ---- 分欄：拓撲排序 + 最長路徑 ------------------------------------------------

/**
 * 回傳一條循環路徑（以起點收尾），供錯誤訊息使用；無循環回傳 null。
 */
function findCyclePath(ids, successors) {
  const color = new Map();
  const stack = [];
  let found = null;
  function dfs(u) {
    if (found) return;
    color.set(u, 1);
    stack.push(u);
    for (const v of successors.get(u)) {
      if (found) return;
      if (color.get(v) === 1) {
        found = stack.slice(stack.indexOf(v)).concat(v);
        return;
      }
      if (color.get(v) === undefined) dfs(v);
    }
    stack.pop();
    color.set(u, 2);
  }
  for (const id of ids) {
    if (color.get(id) === undefined) dfs(id);
    if (found) break;
  }
  return found;
}

/**
 * 分欄。只對「有任何 prerequisite 關係」的分類計算；孤立分類回傳 column null。
 * @returns {{ columnById: Map<string, number|null>, predecessors: Map, successors: Map, columnCount: number }}
 */
function assignColumns(categoryById, edges) {
  const predecessors = new Map();
  const successors = new Map();
  const indegree = new Map();
  categoryById.forEach((_category, id) => {
    predecessors.set(id, []);
    successors.set(id, []);
    indegree.set(id, 0);
  });
  edges.forEach((edge) => {
    predecessors.get(edge.target).push(edge.source);
    successors.get(edge.source).push(edge.target);
    indegree.set(edge.target, indegree.get(edge.target) + 1);
  });

  // Kahn 拓撲排序；queue 依 id 的 code point 排序以保持確定性（結果欄號不受順序影響，但保險）。
  const ids = [...categoryById.keys()].sort(compareCodePoint);
  const remaining = new Map(indegree);
  let queue = ids.filter((id) => remaining.get(id) === 0);
  const order = [];
  while (queue.length) {
    queue.sort(compareCodePoint);
    const current = queue.shift();
    order.push(current);
    successors.get(current).forEach((next) => {
      remaining.set(next, remaining.get(next) - 1);
      if (remaining.get(next) === 0) queue.push(next);
    });
  }
  if (order.length !== ids.length) {
    const cycle = findCyclePath(ids, successors) || ids.filter((id) => remaining.get(id) > 0);
    const names = cycle.map((id) => `"${categoryById.get(id).name}"`).join(' -> ');
    throw new Error(`learning-map-layout: 分類層 prerequisite 有循環，無法分欄：${names}（請調整造成循環的文章 edge；node scripts/validate.js 會列出）`);
  }

  const columnById = new Map();
  let columnCount = 0;
  order.forEach((id) => {
    const isolated = predecessors.get(id).length === 0 && successors.get(id).length === 0;
    if (isolated) {
      columnById.set(id, null);
      return;
    }
    let column = 0;
    predecessors.get(id).forEach((prev) => {
      const prevColumn = columnById.get(prev);
      if (prevColumn + 1 > column) column = prevColumn + 1;
    });
    columnById.set(id, column);
    if (column + 1 > columnCount) columnCount = column + 1;
  });

  return { columnById, predecessors, successors, columnCount };
}

// ---- 同欄排序：唯一的 comparator（決策 13／18） ----------------------------------

/**
 * 同欄順序的唯一決定點。日後導入 rank 時只需在這裡加一個比較鍵。
 * @param {object} a 分類（含 barycenter: number|null）
 * @param {object} b
 * @param {Map<string, number>} domainRank
 */
function compareSameColumn(a, b, domainRank) {
  const wa = a.barycenter;
  const wb = b.barycenter;
  if (wa !== null && wb !== null && wa !== wb) return wa - wb;
  if (wa === null && wb !== null) return 1;
  if (wa !== null && wb === null) return -1;
  const domainDiff = domainRank.get(a.domain) - domainRank.get(b.domain);
  if (domainDiff !== 0) return domainDiff;
  return compareCodePoint(a.name, b.name);
}

// ---- 卡片擺放 ------------------------------------------------------------------

function columnX(column) {
  return PAD_X + column * COL_STEP;
}

/**
 * 逐欄擺放：每欄先算 barycenter，依 comparator 排序，再由上往下推開避免重疊。
 * @returns {Map<string, {id, column, x, y, w, h, cy}>}
 */
function placeDagCards(categoryById, columns, cardHeight, domainRank) {
  const boxes = new Map();
  for (let column = 0; column < columns.columnCount; column += 1) {
    const members = [];
    categoryById.forEach((category, id) => {
      if (columns.columnById.get(id) !== column) return;
      const predYs = columns.predecessors.get(id)
        .filter((prev) => boxes.has(prev))
        .map((prev) => boxes.get(prev).cy);
      let barycenter = null;
      if (predYs.length) {
        let sum = 0;
        predYs.forEach((y) => { sum += y; });
        barycenter = sum / predYs.length;
      }
      members.push({ id, name: category.name, domain: category.domain, barycenter });
    });
    members.sort((a, b) => compareSameColumn(a, b, domainRank));

    let cursor = DAG_Y0;
    members.forEach((member) => {
      const wanted = member.barycenter === null ? cursor : member.barycenter - cardHeight / 2;
      const y = wanted > cursor ? wanted : cursor;
      boxes.set(member.id, {
        id: member.id,
        column,
        x: columnX(column),
        y,
        w: CARD_W,
        h: cardHeight,
        cy: y + cardHeight / 2,
      });
      cursor = y + cardHeight + CARD_GAP;
    });
  }
  return boxes;
}

/**
 * 獨立主題區塊：依領域順序、再依名稱排成列，一列最多 perRow 張，超過就換行。
 */
function placeIsolatedCards(categoryById, columns, cardHeight, domainRank, startY, perRow) {
  const members = [];
  categoryById.forEach((category, id) => {
    if (columns.columnById.get(id) !== null) return;
    members.push({ id, name: category.name, domain: category.domain, barycenter: null });
  });
  members.sort((a, b) => compareSameColumn(a, b, domainRank));

  const boxes = new Map();
  members.forEach((member, index) => {
    const row = Math.floor(index / perRow);
    const col = index - row * perRow;
    const y = startY + row * (cardHeight + CARD_GAP);
    boxes.set(member.id, {
      id: member.id,
      column: null,
      x: columnX(col),
      y,
      w: CARD_W,
      h: cardHeight,
      cy: y + cardHeight / 2,
    });
  });
  return boxes;
}

// ---- 走線 ------------------------------------------------------------------------

/**
 * 跨欄 edge 在中間欄的穿越 y：挑離理想值最近的卡片空隙，並與同欄已用的穿越點錯開。
 * 所有空隙都無效時（卡片塞滿整欄）回傳 null，由呼叫端視為「穿過卡片」。
 */
function gapCrossingY(columnBoxes, wanted, used, top, bottom) {
  const gaps = [];
  let prev = top;
  columnBoxes.forEach((box) => {
    gaps.push([prev + EDGE_CLEARANCE, box.y - EDGE_CLEARANCE]);
    prev = box.y + box.h;
  });
  gaps.push([prev + EDGE_CLEARANCE, bottom - EDGE_CLEARANCE]);

  let best = null;
  let bestDistance = Infinity;
  gaps.forEach((gap) => {
    if (gap[1] < gap[0]) return;
    let y = wanted;
    if (y < gap[0]) y = gap[0];
    if (y > gap[1]) y = gap[1];
    const distance = y > wanted ? y - wanted : wanted - y;
    if (distance < bestDistance) {
      best = { y, gap };
      bestDistance = distance;
    }
  });
  if (!best) return null; // §2.7：原設計稿此處會存取 null.y 而拋錯

  const offsets = [0, 7, -7, 14, -14, 21, -21, 28, -28];
  for (let i = 0; i < offsets.length; i += 1) {
    const y = best.y + offsets[i];
    if (y < best.gap[0] || y > best.gap[1]) continue;
    const clear = used.every((u) => (u > y ? u - y : y - u) >= EDGE_SEPARATION);
    if (clear) {
      used.push(y);
      return y;
    }
  }
  used.push(best.y);
  return best.y;
}

/**
 * 計算每條 edge 的中間穿越點與出入埠 y（同一張卡片的多條線扇形展開）。
 */
function buildRoutes(edges, boxes, top, bottom) {
  const boxesByColumn = new Map();
  boxes.forEach((box) => {
    if (box.column === null) return;
    if (!boxesByColumn.has(box.column)) boxesByColumn.set(box.column, []);
    boxesByColumn.get(box.column).push(box);
  });
  boxesByColumn.forEach((list) => list.sort((a, b) => a.y - b.y));

  const usedByColumn = new Map();
  const routes = edges.map((edge) => {
    const a = boxes.get(edge.source);
    const b = boxes.get(edge.target);
    const via = [];
    for (let column = a.column + 1; column < b.column; column += 1) {
      const wanted = a.cy + ((b.cy - a.cy) * (column - a.column)) / (b.column - a.column);
      if (!usedByColumn.has(column)) usedByColumn.set(column, []);
      const y = gapCrossingY(boxesByColumn.get(column) || [], wanted, usedByColumn.get(column), top, bottom);
      via.push({ column, y });
    }
    return { source: edge.source, target: edge.target, a, b, via, sy: a.cy, ty: b.cy };
  });

  boxes.forEach((box) => {
    const outs = routes.filter((route) => route.source === box.id);
    outs.sort((p, q) => {
      const py = p.via.length ? p.via[0].y : p.b.cy;
      const qy = q.via.length ? q.via[0].y : q.b.cy;
      return (py - qy) || compareCodePoint(p.target, q.target);
    });
    const outStep = Math.min(10, (box.h - 16) / Math.max(1, outs.length - 1));
    outs.forEach((route, i) => { route.sy = box.cy + (i - (outs.length - 1) / 2) * outStep; });

    const ins = routes.filter((route) => route.target === box.id);
    ins.sort((p, q) => {
      const py = p.via.length ? p.via[p.via.length - 1].y : p.a.cy;
      const qy = q.via.length ? q.via[q.via.length - 1].y : q.a.cy;
      return (py - qy) || compareCodePoint(p.source, q.source);
    });
    const inStep = Math.min(10, (box.h - 16) / Math.max(1, ins.length - 1));
    ins.forEach((route, i) => { route.ty = box.cy + (i - (ins.length - 1) / 2) * inStep; });
  });

  return routes;
}

/**
 * 把一條 route 轉成線段清單：相鄰欄之間用三次 Bézier S 形，中間欄的空隙用直線穿過。
 * 回傳的 segments 同時供 SVG path 字串與「穿過卡片」檢查使用。
 */
function routeSegments(route) {
  const tip = route.b.x - 2;
  const points = [[route.a.x + route.a.w + 1, route.sy]];
  route.via.forEach((v) => {
    const y = v.y === null ? route.a.cy : v.y; // null = 找不到空隙；仍畫線，交由穿越檢查報告
    points.push([columnX(v.column) - 4, y]);
    points.push([columnX(v.column) + CARD_W + 4, y]);
  });
  points.push([tip - 6, route.ty]);

  const segments = [];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    if (i % 2 === 0 && i < points.length - 1) {
      segments.push({ kind: 'line', x1, y1, x2, y2 });
      continue;
    }
    const mx = (x1 + x2) / 2;
    segments.push({ kind: 'cubic', x1, y1, c1x: mx, c1y: y1, c2x: mx, c2y: y2, x2, y2 });
  }
  return { segments, tip, tipY: route.ty };
}

function segmentsToPath(segments) {
  let d = `M${round1(segments[0].x1)} ${round1(segments[0].y1)}`;
  segments.forEach((segment) => {
    if (segment.kind === 'line') {
      d += `L${round1(segment.x2)} ${round1(segment.y2)}`;
    } else {
      d += `C${round1(segment.c1x)} ${round1(segment.c1y)} ${round1(segment.c2x)} ${round1(segment.c2y)} ${round1(segment.x2)} ${round1(segment.y2)}`;
    }
  });
  return d;
}

function arrowHeadPath(x, y) {
  const size = ARROW_SIZE;
  return `M${round1(x)} ${round1(y)}L${round1(x - size)} ${round1(y - size / 2)}L${round1(x - size)} ${round1(y + size / 2)}Z`;
}

/** 線段取樣點（Bézier 以 24 等分近似），供穿越檢查。 */
function sampleSegment(segment) {
  const samples = [];
  const steps = 24;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    if (segment.kind === 'line') {
      samples.push([segment.x1 + (segment.x2 - segment.x1) * t, segment.y1 + (segment.y2 - segment.y1) * t]);
    } else {
      const mt = 1 - t;
      const w0 = mt * mt * mt;
      const w1 = 3 * mt * mt * t;
      const w2 = 3 * mt * t * t;
      const w3 = t * t * t;
      samples.push([
        w0 * segment.x1 + w1 * segment.c1x + w2 * segment.c2x + w3 * segment.x2,
        w0 * segment.y1 + w1 * segment.c1y + w2 * segment.c2y + w3 * segment.y2,
      ]);
    }
  }
  return samples;
}

/**
 * 檢查有多少條 edge 的路徑會穿過「非起點／終點」的卡片（含 2px 安全邊）。
 * @returns {{ count: number, offenders: Array<{source, target, card}> }}
 */
function countEdgeCardCrossings(routedEdges, boxes) {
  const margin = 2;
  const offenders = [];
  routedEdges.forEach((edge) => {
    const hit = new Set();
    edge.segments.forEach((segment) => {
      sampleSegment(segment).forEach(([x, y]) => {
        boxes.forEach((box) => {
          if (box.id === edge.source || box.id === edge.target) return;
          if (x > box.x - margin && x < box.x + box.w + margin && y > box.y - margin && y < box.y + box.h + margin) {
            hit.add(box.id);
          }
        });
      });
    });
    hit.forEach((card) => offenders.push({ source: edge.source, target: edge.target, card }));
  });
  return { count: offenders.length, offenders };
}

// ---- 主函式 --------------------------------------------------------------------

/**
 * @param {{ domains: Array<{id,name}>, categories: Array<{id,name,domain,topicIds?}>, categoryPrereqs: Array<{source,target}> }} input
 * @param {{ strict?: boolean }} [options] strict（預設 true）時，edge 穿過卡片即 throw；layout-report 用 false 取得計數。
 * @returns {{
 *   columnById: Map<string, number|null>,
 *   layout: { width, height, card: {w,h}, columns, boxes, isolated, edges },
 *   crossings: { count, offenders },
 *   columnCount: number
 * }}
 */
function buildLearningMapLayout(input, options = {}) {
  const strict = options.strict !== false;
  const { domainRank, categoryById, edges } = normalizeInput(input);
  const columns = assignColumns(categoryById, edges);

  let maxTopics = 0;
  categoryById.forEach((category) => { if (category.topicCount > maxTopics) maxTopics = category.topicCount; });
  const cardHeight = maxTopics > DOTS_PER_ROW ? CARD_H_TWO_ROWS : CARD_H_ONE_ROW;

  // DAG
  const dagBoxes = placeDagCards(categoryById, columns, cardHeight, domainRank);
  let dagBottom = DAG_Y0;
  dagBoxes.forEach((box) => { if (box.y + box.h > dagBottom) dagBottom = box.y + box.h; });
  dagBottom += DAG_BOTTOM_PAD;

  const dagColumnCount = columns.columnCount > 0 ? columns.columnCount : 1;
  const width = PAD_X * 2 + (dagColumnCount - 1) * COL_STEP + CARD_W;

  // 獨立主題
  const isolatedIds = [...categoryById.keys()].filter((id) => columns.columnById.get(id) === null);
  let isolated = null;
  let isolatedBoxes = new Map();
  let height = dagBottom;
  if (isolatedIds.length) {
    const labelY = dagBottom + ISOLATED_GAP;
    isolatedBoxes = placeIsolatedCards(categoryById, columns, cardHeight, domainRank, labelY + ISOLATED_LABEL_H, dagColumnCount);
    isolated = { y: labelY, label: ISOLATED_LABEL };
    isolatedBoxes.forEach((box) => { if (box.y + box.h > height) height = box.y + box.h; });
    height += DAG_BOTTOM_PAD;
  }

  const allBoxes = new Map([...dagBoxes, ...isolatedBoxes]);

  // 走線（只有 DAG 內的 edge；edges 依 source、target 的 code point 排序以保持確定性）
  const sortedEdges = edges.slice().sort((p, q) => compareCodePoint(p.source, q.source) || compareCodePoint(p.target, q.target));
  const routes = buildRoutes(sortedEdges, dagBoxes, ROUTE_TOP, dagBottom);
  const routedEdges = routes.map((route) => {
    const { segments, tip, tipY } = routeSegments(route);
    return { source: route.source, target: route.target, segments, d: segmentsToPath(segments), head: arrowHeadPath(tip, tipY) };
  });

  const crossings = countEdgeCardCrossings(routedEdges, dagBoxes);
  if (strict && crossings.count > 0) {
    const detail = crossings.offenders.map((o) => `${o.source} -> ${o.target} 穿過 ${o.card}`).join('；');
    throw new Error(`learning-map-layout: 有 ${crossings.count} 條 edge 穿過卡片：${detail}`);
  }

  // pop 方向：浮出清單估算高度放得下就往下，否則往上（獨立主題區塊一律往上，因為它在畫布底部）
  const popDirection = (box, topicCount) => {
    if (box.column === null) return 'above';
    const popHeight = POP_PAD * 2 + topicCount * POP_ROW_H;
    return box.y + box.h + popHeight <= dagBottom ? 'below' : 'above';
  };

  const boxes = {};
  [...allBoxes.keys()].sort(compareCodePoint).forEach((id) => {
    const box = allBoxes.get(id);
    boxes[id] = { x: round1(box.x), y: round1(box.y), pop: popDirection(box, categoryById.get(id).topicCount) };
  });

  const columnsOut = [];
  for (let column = 0; column < columns.columnCount; column += 1) { // 沒有任何 DAG 分類時不輸出空欄標題
    let label = '';
    if (column === 0) label = COLUMN_LABEL_FIRST;
    else if (column === dagColumnCount - 1) label = COLUMN_LABEL_LAST;
    columnsOut.push({ index: column, x: columnX(column), label });
  }

  return {
    columnById: columns.columnById,
    columnCount: columns.columnCount,
    crossings,
    layout: {
      width,
      height: round1(height),
      card: { w: CARD_W, h: cardHeight },
      columns: columnsOut,
      boxes,
      isolated: isolated ? { y: round1(isolated.y), label: isolated.label } : null,
      edges: routedEdges.map((edge) => ({ source: edge.source, target: edge.target, d: edge.d, head: edge.head })),
    },
  };
}

module.exports = {
  buildLearningMapLayout,
  compareSameColumn,
  constants: {
    CARD_W,
    CARD_H_ONE_ROW,
    CARD_H_TWO_ROWS,
    DOTS_PER_ROW,
    PAD_X,
    COL_STEP,
    GUTTER,
    CARD_GAP,
    LABEL_TOP,
    ROUTE_TOP,
    DAG_Y0,
  },
};
