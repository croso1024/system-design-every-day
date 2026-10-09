'use strict';

/**
 * categories.js — 分類登記表 docs/categories.json 的共用邏輯。
 *
 * 登記表是「category → 領域 (domain)」對照的唯一真相來源；首頁 payload 裡的對照只是衍生副本，
 * 前端模板不放任何對照表。供 mindmap.js、validate.js、add-topic.js、generate.js 共用。
 *
 * 檔案格式：
 *   {
 *     "domains":    [ { "id": "network", "name": "網路與通訊" }, ... ],   // 順序 = 首頁圖例順序
 *     "categories": [ { "name": "API Design", "domain": "network" }, ... ] // 依 name 的 code point 排序
 *   }
 *
 * 這裡的純計算函式（validate / build index / insert）都不碰磁碟；只有 read / write 兩支會。
 * 所有排序一律用 code point 比較（compareCodePoint），不用 localeCompare，
 * 以確保本機與 CI 不同 ICU 版本下的結果完全一致。
 */

const fs = require('fs');
const path = require('path');
const { writeJSONAtomic } = require('./atomic');

const ROOT = path.resolve(__dirname, '..', '..');
const CATEGORIES_PATH = path.join(ROOT, 'docs', 'categories.json');

const DOMAIN_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * 以 Unicode code point 逐字比較兩個字串（不受 locale / ICU 影響）。
 * @returns {number} 負數 = a 在前；正數 = b 在前；0 = 相等
 */
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

/**
 * 分類名稱 → 穩定 id。只保留 ASCII 英數，其餘連續字元一律折成單一連字號。
 * 例："Network Protocols & Real-time Systems" → "network-protocols-real-time-systems"。
 * 名稱不含任何英數時會回傳空字串，由 validateCategoryRegistry 判定為錯誤。
 */
function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 讀取登記表。檔案不存在或 JSON 損壞時 throw，由呼叫端決定 fail-loud 的方式。 */
function readCategoryRegistry(filePath = CATEGORIES_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`找不到分類登記表 docs/categories.json（${filePath}）`);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new Error(`docs/categories.json 解析失敗（檔案可能損壞）：${e.message}`);
  }
}

/** 原子寫入登記表（沿用專案 JSON 慣例）。 */
function writeCategoryRegistry(registry, filePath = CATEGORIES_PATH) {
  writeJSONAtomic(filePath, registry);
}

/**
 * 驗證登記表格式（validate.js 的 R1）。回傳錯誤訊息陣列；空陣列代表通過。
 * 檢查項目：
 *   - domains / categories 都是陣列
 *   - domain id 符合 ^[a-z][a-z0-9-]*$、不重複；domain name 非空、不重複
 *   - category name 非空、不重複；slug 合法、不重複；domain 必須存在
 *   - categories 依 name 的 code point 排序（add-topic 插入時維持此順序）
 */
function validateCategoryRegistry(registry) {
  const errors = [];
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry)) {
    return ['categories.json 必須是 JSON Object（含 domains 與 categories 兩個陣列）'];
  }

  const domains = registry.domains;
  const categories = registry.categories;
  if (!Array.isArray(domains)) errors.push('categories.json 缺少 "domains" 陣列');
  if (!Array.isArray(categories)) errors.push('categories.json 缺少 "categories" 陣列');
  if (errors.length) return errors;

  const domainIds = new Set();
  const domainNames = new Set();
  domains.forEach((domain, index) => {
    const label = `categories.json domains[${index}]`;
    if (typeof domain !== 'object' || domain === null) {
      errors.push(`${label} 必須是物件`);
      return;
    }
    if (typeof domain.id !== 'string' || !DOMAIN_ID_PATTERN.test(domain.id)) {
      errors.push(`${label} 的 id "${domain.id}" 不合法（需符合 ^[a-z][a-z0-9-]*$）`);
    } else if (domainIds.has(domain.id)) {
      errors.push(`${label} 的 id "${domain.id}" 重複`);
    } else {
      domainIds.add(domain.id);
    }
    if (typeof domain.name !== 'string' || !domain.name.trim()) {
      errors.push(`${label} 缺少有效的 name`);
    } else if (domainNames.has(domain.name)) {
      errors.push(`${label} 的 name "${domain.name}" 重複`);
    } else {
      domainNames.add(domain.name);
    }
  });

  const categoryNames = new Set();
  const slugs = new Map();
  categories.forEach((category, index) => {
    const label = `categories.json categories[${index}]`;
    if (typeof category !== 'object' || category === null) {
      errors.push(`${label} 必須是物件`);
      return;
    }
    if (typeof category.name !== 'string' || !category.name.trim()) {
      errors.push(`${label} 缺少有效的 name`);
      return;
    }
    if (categoryNames.has(category.name)) {
      errors.push(`${label} 的 name "${category.name}" 重複`);
    }
    categoryNames.add(category.name);

    const slug = slugify(category.name);
    if (!SLUG_PATTERN.test(slug)) {
      errors.push(`${label} 的 name "${category.name}" 無法產生合法 slug（需含至少一個 ASCII 英數字元）`);
    } else if (slugs.has(slug)) {
      errors.push(`${label} 的 slug "${slug}" 與 "${slugs.get(slug)}" 衝突`);
    } else {
      slugs.set(slug, category.name);
    }

    if (typeof category.domain !== 'string' || !domainIds.has(category.domain)) {
      errors.push(`${label}（"${category.name}"）的 domain "${category.domain}" 不存在於 domains`);
    }

    if (index > 0) {
      const previous = categories[index - 1];
      if (previous && typeof previous.name === 'string' && compareCodePoint(previous.name, category.name) > 0) {
        errors.push(`${label}（"${category.name}"）未依 name 的 code point 排序（應排在 "${previous.name}" 之前）`);
      }
    }
  });

  return errors;
}

/**
 * 建立查詢索引。假設登記表已通過 validateCategoryRegistry。
 * @returns {{
 *   domains: Array<{id:string,name:string}>,
 *   domainById: Map<string,{id:string,name:string}>,
 *   categories: Array<{id:string,name:string,domain:string}>,
 *   categoryByName: Map<string,{id:string,name:string,domain:string}>,
 *   categoryById: Map<string,{id:string,name:string,domain:string}>
 * }}
 */
function buildCategoryIndex(registry) {
  const domains = (registry.domains || []).map((domain) => ({ id: domain.id, name: domain.name }));
  const categories = (registry.categories || []).map((category) => ({
    id: slugify(category.name),
    name: category.name,
    domain: category.domain,
  }));
  return {
    domains,
    domainById: new Map(domains.map((domain) => [domain.id, domain])),
    categories,
    categoryByName: new Map(categories.map((category) => [category.name, category])),
    categoryById: new Map(categories.map((category) => [category.id, category])),
  };
}

/** 查詢分類所屬領域 id；未登記回傳 null。 */
function domainOfCategory(registry, categoryName) {
  const entry = (registry.categories || []).find((category) => category && category.name === categoryName);
  return entry ? entry.domain : null;
}

/**
 * 回傳「插入一個新分類後」的登記表副本（不修改原物件、不寫檔），並維持 name 的 code point 順序。
 * 呼叫端須先確認該 name 尚未登記、domain 已存在。
 */
function withCategory(registry, { name, domain }) {
  const categories = (registry.categories || []).slice();
  let insertAt = categories.length;
  for (let i = 0; i < categories.length; i += 1) {
    if (compareCodePoint(categories[i].name, name) > 0) {
      insertAt = i;
      break;
    }
  }
  categories.splice(insertAt, 0, { name, domain });
  return { ...registry, categories };
}

module.exports = {
  CATEGORIES_PATH,
  compareCodePoint,
  slugify,
  readCategoryRegistry,
  writeCategoryRegistry,
  validateCategoryRegistry,
  buildCategoryIndex,
  domainOfCategory,
  withCategory,
};
