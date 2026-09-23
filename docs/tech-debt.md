# 技術債追蹤

已知、尚未處理的全站問題。**處理完一項就把它從總表與各項說明中直接刪除**，不留「已處理」紀錄
（處理經過看 git log 即可），避免本檔膨脹。新發現的問題追加在表尾，編號不重用。

狀態：`待處理`、`進行中`，或 `接受`（評估後決定不處理，須在說明中寫理由）。

---

## 總表

| # | 篇 | 問題 | 影響 | 預估 | 狀態 |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 1 | `agent-runtime-backend` | 論述層約 20 處編號式跨篇／章節引用 | 可讀性 | 中 | 待處理 |
| 2 | `mcp-protocol` | 論述層約 17 處編號式跨篇／章節引用，第 7 節表格有一整欄「第 N 篇 · 標題」 | 可讀性 | 中 | 待處理 |
| 3 | `distributed-transactions-handbook` | 6 個 demo 中 4 個仍是常數播放器 | demo 品質、結構範本可信度 | 重 | 待處理 |
| 6 | 全站 | 兩組接受的主 archetype B 撞形 | 多樣性 | 重 | 接受 |
| 7 | `agent-tool-gateway-security`、`cache-failure-modes` | 各一處未點名的「前一篇」 | 可讀性 | 輕 | 待處理 |
| 8 | 12 篇舊 demo | 早於 compute／render 約定，L1 第 11 項或 L2 失敗 | demo 閘門無法進 CI | 重（逐篇） | 待處理 |
| 9 | `scripts/quality/demo-audit.js` | L1 第 6、9 項為啟發式，有已知誤報 | 閘門可信度 | 中 | 待處理 |

---

## 各項說明

### 1、2、7　編號式引用

**問題**：「前一篇」「第一篇」「前三篇」「（s7 選型階梯）」這類指涉要靠發佈順序或他篇章節編號才看得懂，
單篇閱讀時無法跟隨。規則見 `guidelines/style-guide.md`「嚴格禁止的作法」第 15 條。

**定位**（結果含合規的寫法，例如同句已點名的「前一篇《LLM 應用編排與 Agent 模式》」，以及 `<section id="sN">` 與 CSS 註解，須逐條人工判讀）：

```bash
grep -nE '前一篇|上一篇|下一篇|第[一二三四五六七八九十]+篇|前[一二三四五六七八九十]篇|篇 ?[0-9]+|[（(]s[0-9]+|[^a-z"#-]s[0-9]+[^0-9a-z"]' \
  drafts/<id>/content.html drafts/<id>/script.html
```

- **#1** `agent-runtime-backend`：以「第一篇」指 LLM 應用編排那篇為主，另有第 1 節導覽卡片的「（sN）」與第 2 節 cap 的「s7 選型階梯」等本篇章節自引用。
- **#2** `mcp-protocol`：「第一／二／三篇」「前三篇」與「（sN）」；第 7 節表格三列的列標題整欄是「第 N 篇 · 標題」，要連表頭語意一起改寫。
- **#7** `agent-tool-gateway-security` 第 1 節 sec-sub「前一篇的 runtime…」、`cache-failure-modes` 第 1 節 sec-sub「前一篇把 Cache-Aside 的讀寫路徑講完了」。

**做法**：跨篇改成「短稱＋內容描述」（例：「Agent Runtime 篇的狀態機那一節」）；本篇自引用改「第 N 節」並視空間補短標題。
改 draft 後 `generate.js --keep-date`（沿用既有 title／category）重產。#1、#2、#7 可合為一批。

### 3　distributed-transactions-handbook 的 4 個常數播放器

**問題**：光譜、流程、時序實驗室、並排對照四個 demo 的輸出是寫死字串，只有補償鏈與決策器真算。
它是 style-guide 引用的多 demo 結構範本（已註明「不可作為實作參考」）。

**做法**：等同一篇重量級重做。4 個 demo 各自選 archetype，且主 archetype 不得與發佈序相鄰篇撞形——
先跑 `node scripts/quality/archetype-window.js --topic distributed-transactions-handbook` 看相鄰視窗封死哪些型。
依 `topic-reviser` 的兩階段 Sub-Agent 流程，brief 用 `guidelines/demo-agent-brief.md`。
完成後同步處理 #8 的這一篇，並把 style-guide 裡「不可作為實作參考」的註記拿掉。

### 6　接受的 B 撞形

發佈序上兩個 4 篇視窗內各有兩篇主 archetype 皆為 B：
`advanced-replication-consistency-handbook` ／ `data-sharding-basics`，以及 `wide-column-store` ／ `nat-port-forwarding`。
四篇的 demo 都是真模擬器，使用者於 2026-09-20 決定不動。

**影響**：`archetype-window.js` 全站模式會因此 exit 1；對這四篇跑 `--topic` 閘門也會失敗。
修訂這四篇時，這兩組撞形不視為本次修訂造成的失敗。
**若日後要歸零**：改其中一篇的主 archetype 並重做它的 demo，選代價最小的一篇。

### 8　早於 compute／render 約定的舊 demo

以下 12 篇的 demo 是真算的，但沒有依 style-guide §0.5 分出 `compute*` 純函式或沒有 `@probe`：

| 篇 | 失敗項 |
| :--- | :--- |
| `advanced-replication-consistency-handbook` | L1 #11、L2 |
| `consistent-hashing-handbook` | L1 #11、L2 |
| `data-sharding-basics` | L1 #11、L2 |
| `distributed-transactions-handbook` | L1 #11、L2（見 #3） |
| `embedded-database` | L1 #11、L2 |
| `http-1-1-and-http-2` | L1 #11、L2 |
| `ip-addressing-subnetting` | L1 #11、L2 |
| `nat-port-forwarding` | L1 #11、L2 |
| `search-analytics-engine` | L1 #11、L2 |
| `tcp-udp-and-socket-programming` | L1 #11、L2 |
| `vector-database-fundamentals` | L1 #11、L2 |
| `wide-column-store` | L2（有 compute，缺 `@probe`） |

**影響**：`demo-audit.js --all` 與 `compute-probe.js --all` 目前不可能全綠，所以 demo 閘門還沒放進 CI。
**做法**：逐篇把計算抽成 `compute*` 純函式、補 `@probe` 三行，不改互動模型與畫面；某篇的 demo 因其他原因重做時一併處理。
`wide-column-store` 只缺 `@probe`，最輕。清單清空後，或改為「CI 只對本次 push 改到的 draft 跑閘門」，即可把閘門放進 `.github/workflows/deploy.yml`。

### 9　demo-audit.js 的啟發式誤報

- **第 6 項（id 綁定）**：script 先組出 id 字串再 `getElementById` 時，工具看不到字面 id，會把控制項誤報為死控制項。
  目前 `cdn-edge-caching` 的 `swin-*`、`cku-*` 共 12 個控制項即為此誤報。
- **第 9 項（cap）**：判斷方式是「圖表容器後 4000 字內有無 `.cap`」，容器之間的距離一變，計數就變。

**做法**：第 6 項可以改成辨識 `getElementById(prefix + name)` 這類模式並回報「無法靜態判定」，不要直接判死；
第 9 項可以改成找容器閉合標籤後的下一個兄弟元素。改完對全站跑 `demo-audit.js --all`，確認除上述誤報外結果不變。
