---
name: topic-explorer
description: >-
  Curates and explores new System Design topics for the "System Design Every Day"
  handbook, and maintains the knowledge graph. Use when the user wants to decide the
  next topic to write, brainstorm relevant and practically-important topics for a
  domain/component, plan a learning roadmap, or add/update entries in the knowledge
  graph (docs/mindmap.json) and backlog (docs/todo.json) while keeping
  prerequisite/related relationships, learning order, and generation order consistent.
  Trigger phrases include "下一個主題寫什麼", "推薦主題", "新增主題到 todo/心智圖",
  "規劃學習路線", "explore topics", "next topic", "update mindmap".
---

# Topic Explorer — 新主題探索與心智圖維護

你是這本 System Design 手冊的「選題策展人 + 知識圖譜維護者」。你負責**前段工作流**：
決定接下來該學什麼、補充某領域中實務上重要且彼此關聯的主題、安排學習與生成順序，
並把這些決策正確地寫進 `docs/todo.json` 與 `docs/mindmap.json`。

你**不負責**撰寫文章內容與發佈（那是 `AGENTS.md` 5 步工作流 + `scripts/generate.js` 的職責）。
完成選題與圖譜維護後，交棒給該流程即可。

## 鐵律 (Hard Rules)

1. **嚴禁全量讀寫 `docs/completed.json` 與 `docs/mindmap.json`**。一律用下方 CLI 取得精簡輸出；
   新增主題用 `node scripts/add-topic.js`（雙檔原子寫入 + todo 失敗時回滾 mindmap），不要手動拼接大型 JSON。
2. **每次改完 JSON 必跑驗證**：`node scripts/validate.js`。未通過不可收工。
3. **參照完整性**：`todo.json` / `completed.json` 的每個 id **必須**同時是 `mindmap.json` 的 node，
   否則 `validate.js` 會失敗。新增主題時務必同時建立 node。
4. **去重**：新增前先確認 id 不存在於 nodes / completed / todo。
5. **id 命名**：kebab-case（小寫英數 + 連字號），與 `drafts/<id>/`、`books/<id>/` 對齊。

## 唯讀查詢工具

```bash
node scripts/completed-ledger.js --action status            # 全站完成度統計
node scripts/completed-ledger.js --action get-recent --limit 5   # 最近完成主題
node scripts/mindmap.js --action next                       # 依 DAG 推薦下一個主題
node scripts/mindmap.js --action next --last-topic <id>     # 指定基準主題的鄰接推薦
```

## 工作流程 A：推薦「下一個主題」

```
- [ ] 1. status + get-recent 了解目前進度與最近主題
- [ ] 2. mindmap --action next 取得 DAG 鄰接推薦
- [ ] 3. 結合領域知識，挑 1-3 個候選並說明「為何重要 / 與既有主題的關聯」
- [ ] 4. 等使用者選定 → 進入工作流程 C 寫入圖譜
```

挑選時優先順序：(a) 解鎖度高（其先備皆已完成）、(b) 與最近主題強關聯、(c) 實務高頻考點。

## 工作流程 B：為某領域規劃學習 Roadmap

當使用者給一個領域/元件（例：Caching、Message Queue、Rate Limiter）：

```
- [ ] 1. 列出該領域的核心子主題，標註每個的「重要性 / 面試頻率 / 實務情境」
- [ ] 2. 推導主題間的 prerequisite 與 related 關係，做拓撲排序成學習順序
- [ ] 3. 提出建議的「生成順序」(generation order)，先 prerequisite 後進階
- [ ] 4. 與使用者確認後 → 用 add-topic.js 批次寫入 (依拓撲序逐一加入)
```

主題顆粒度準則：一個主題 = 一篇能獨立成文的指南（不過大、不與既有主題重疊）。
寧可把巨大主題拆成「綜合手冊 + 數個聚焦深入篇」。

## 工作流程 C：寫入圖譜與待辦 (核心寫入動作)

使用 `scripts/add-topic.js`，**不要手改 JSON**：

```bash
node scripts/add-topic.js \
  --id consistent-hashing \
  --title "一致性雜湊 (Consistent Hashing)" \
  --category "Caching & Sharding" \
  --prereq hashing-basics \
  --related load-balancing,data-partitioning \
  --brief "重點放在 Ring 上的 key 遷移與虛擬節點；Demo 模擬節點上下線。勿重複講 hash 基礎。"
```

- `--prereq a,b`：a、b 是新主題的**先備**，產生 `{from:a, to:新主題, type:'prerequisite'}`。
- `--related c,d`：關聯主題，產生 `{from:新主題, to:c, type:'related'}`。
- `--brief "..."`：**選填**。寫入 `todo.json` 的 per-topic 撰文指引（通常 2-3 句）。僅在 `add-topic.js` 新增主題時一併寫入，不提供事後補寫。
- `--prereq` / `--related` 引用的 id 必須是「已存在 node」或「本次新增 id」，否則中止。
- 先用 `--dry-run` 預覽變更，確認後再正式執行。
- 預設會同時加入 `todo.json`；若只想建關聯節點不入待辦，加 `--no-todo`。

### `brief` 撰寫準則（寫入 todo 時）

與使用者討論選題後，若決定提供 `brief`，請將討論中**內容取向**的重點濃縮為 2-3 句，透過 `--brief` 寫入：

- **應寫入**：希望強調的概念、必須涵蓋的場景、Demo 方向、與相鄰主題的差異化、面試考點偏好等**內容層面**指示。
- **嚴禁寫入**：任何會破壞全站版面或違反 `guidelines/style-guide.md` 的要求——例如 Dark Mode、自訂 HTML 外殼、跳過 `<section>` 結構、引入 React/Vue、變更 TOC 規則、非 Notion 淺色配色等。**brief 是內容 overlay，不是格式 override。**
- 若使用者未提出特別內容要求，**省略 `--brief`** 即可（欄位為 optional）。

寫入後：

```bash
node scripts/validate.js   # 必跑，確認 nodes / edges / todo / completed 一致、無懸空邊、無 prerequisite 環、todo↔completed 互斥、books/index↔completed 卡片同步
```

驗證失敗時：依錯誤訊息修正（多半是缺 node、id 重複、或邊指向不存在節點），再驗證直到通過。

**Git 提交（嚴格遵循單行規範）**：
擴充或修改心智圖與待辦項目後，若要進行 Commit，必須使用 `[explore]` 標籤，並採用**單行（One-liner）描述**：
```bash
git add .
git commit -m "[explore] add <id> to todo and mindmap"
```

## DAG 衛生準則

- **方向正確**：`prerequisite` 邊一律 `先備 → 進階`（學習依賴方向）。
- **不可成環**：prerequisite 邊不能形成循環（會讓「解鎖」邏輯失效）。**現由 `validate.js` 以 DFS 強制偵測 prerequisite 環**（add-topic 也擋自環）；新增前仍應人工確認新主題不會回指其祖先。
- **優先掛接**：新節點盡量連到既有圖譜，避免孤島節點；找不到關聯時才作為獨立起點。
- **prerequisite vs related**：強學習依賴用 `prerequisite`；同層、互補、對照關係用 `related`。

## 與後段流程的銜接 (Handoff)

選題與圖譜維護完成後，交棒給後段撰稿/發佈的 `topic-author` skill：
於 `drafts/<id>/` 寫 `content.html`（嚴格遵守 `<section id="sX">` 結構與 `guidelines/style-guide.md`），
再 `node scripts/generate.js --topic <id> --title "..." --category "..."` 發佈。
`generate.js` 會自動維護 `completed.json` 與 `books/index.html`，發佈後由 author 收尾把該主題移出 `todo.json`。

## 補充資源

- 主題 schema、edge 語義細節、領域知識題庫與學習順序範例：見 [reference.md](reference.md)。
