# Topic Explorer — 參考資料

本檔為 `SKILL.md` 的延伸閱讀，僅在需要 schema 細節、edge 語義或領域選題靈感時再讀。

## 1. 資料結構 Schema

### docs/todo.json (Array)
待辦主題池。每個項目：

```json
{ "id": "rate-limiter", "title": "限流器 (Rate Limiter)", "category": "API Design" }
```

### docs/completed.json (Array) — 由 generate.js 自動維護，勿手改
```json
{
  "id": "distributed-transactions-handbook",
  "title": "分散式交易綜合手冊 (2PC / TCC / Saga)",
  "category": "Distributed Transactions",
  "completed_at": "2026-06-22",
  "path": "books/distributed-transactions-handbook/index.html"
}
```

### docs/mindmap.json (Object)
```json
{
  "nodes": [
    { "id": "consistent-hashing", "title": "一致性雜湊", "category": "Caching & Sharding" }
  ],
  "edges": [
    { "from": "hashing-basics", "to": "consistent-hashing", "type": "prerequisite" },
    { "from": "consistent-hashing", "to": "load-balancing", "type": "related" }
  ]
}
```

## 2. Edge 語義 (與 scripts/mindmap.js 行為對齊)

| type | 方向慣例 | Mermaid 連線 | 推薦器行為 |
| :--- | :--- | :--- | :--- |
| `prerequisite` | 先備 → 進階 | `==>` (粗箭頭) | 用來判斷主題是否「已解鎖」：若某主題所有 prerequisite 來源皆已完成，才視為可獨立起步 |
| `related` | 任一方向皆可 | `-->` (細箭頭) | 推薦器會同時看出入邊，做為鄰接推薦來源 |

`mindmap.js --action next` 的邏輯：
1. 以「最近完成主題」為基準，找其**出邊**與**入邊**所連、且尚未完成的主題作為推薦。
2. 若無鄰接推薦，退而從 `todo.json` 找「所有 prerequisite 皆已完成（或無 prerequisite）」的主題作為獨立起點。

> 推論：把新主題正確掛上 `prerequisite` 邊，等於替自動推薦器建立「解鎖樹」；
> 邊缺失或方向反了，會讓推薦品質下降或永遠無法被推薦。

## 3. 新增主題決策清單

新增前自問：
- [ ] id 是否已存在於 nodes / completed / todo？（去重）
- [ ] 顆粒度是否恰當？能不能獨立成一篇？是否和既有主題重疊？
- [ ] 是否有「必須先懂」的既有主題？→ 設為 `prerequisite`。
- [ ] 是否有同層互補/對照主題？→ 設為 `related`。
- [ ] 加入這條邊會不會形成 prerequisite 循環？
- [ ] category 是否與既有命名一致（避免同義分類碎片化，如 "Cache" vs "Caching"）？

## 4. 領域知識：常見 System Design 主題與學習順序

以下為選題靈感與典型依賴關係，供規劃 Roadmap 時參考（非窮舉，依使用者需求裁切）。
箭頭表示建議學習順序（左為先備）。

### 基礎 (Foundations)
- 網路與協定：DNS、TCP/UDP、HTTP/HTTPS、TLS、WebSocket、gRPC
- 一致性模型：Strong / Eventual / Causal Consistency、CAP、PACELC
- 雜湊基礎 → 一致性雜湊 (Consistent Hashing)

### 儲存與資料 (Storage & Data)
- 關聯式 vs NoSQL 選型 → 索引 (B-Tree / LSM-Tree)
- 資料分片 (Sharding / Partitioning) → 複寫 (Replication) → 一致性雜湊
- 快取：Cache 模式 (Cache-Aside / Write-Through / Write-Back)、快取失效、快取雪崩/穿透/擊穿
- 物件儲存 / Blob Storage、CDN

### 分散式系統核心 (Distributed Systems)
- 共識：Leader Election → Raft / Paxos
- 分散式交易：2PC → 3PC、TCC、Saga（本手冊已有綜合手冊，可拆深入篇）
- 冪等性 (Idempotency)、Exactly-once / At-least-once 語義
- 分散式鎖、向量時鐘 (Vector Clock)、CRDT

### 訊息與串流 (Messaging & Streaming)
- Message Queue 基礎 → Kafka / RabbitMQ 架構 → 背壓 (Backpressure)
- Pub/Sub、Event-Driven Architecture、CDC (Change Data Capture)

### 流量與韌性 (Traffic & Resilience)
- 負載平衡 (Load Balancing) 演算法 → 反向代理 / API Gateway
- 限流 (Rate Limiter)：Token Bucket / Leaky Bucket / Sliding Window
- 熔斷 (Circuit Breaker)、重試與退避 (Retry / Backoff)、艙壁隔離 (Bulkhead)

### 可觀測性與運維 (Observability & Ops)
- Logging / Metrics / Tracing 三本柱、分散式追蹤
- 健康檢查、藍綠/金絲雀部署

### 經典案例題 (Design X)
- Design URL Shortener、Design Rate Limiter、Design Newsfeed、Design Chat System、
  Design Search Autocomplete、Design Distributed ID Generator、Design Notification System

## 5. 範例：規劃 "Caching" 領域並批次寫入

1. 子主題與依賴：`cache-patterns` → `cache-invalidation` → `consistent-hashing`（先備 `hashing-basics`），`cdn`（related: `cache-patterns`）。
2. 依拓撲序逐一寫入：

```bash
node .cursor/skills/topic-explorer/scripts/add-topic.js --id cache-patterns \
  --title "快取策略 (Cache Patterns)" --category "Caching"

node .cursor/skills/topic-explorer/scripts/add-topic.js --id cache-invalidation \
  --title "快取失效與一致性" --category "Caching" --prereq cache-patterns

node .cursor/skills/topic-explorer/scripts/add-topic.js --id cdn \
  --title "內容傳遞網路 (CDN)" --category "Caching" --related cache-patterns
```

3. `node scripts/validate.js` 驗證通過後，交棒撰稿流程。
