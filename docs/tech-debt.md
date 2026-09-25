# 技術債追蹤

已知、尚未處理的全站問題。**處理完一項就把它從總表與各項說明中直接刪除**，不留「已處理」紀錄
（處理經過看 git log 即可），避免本檔膨脹。新發現的問題追加在表尾，編號不重用。

狀態：`待處理`、`進行中`，或 `接受`（評估後決定不處理，須在說明中寫理由）。

---

## 總表

| # | 篇 | 問題 | 影響 | 預估 | 狀態 |
| :-: | :--- | :--- | :--- | :--- | :--- |
| 6 | 全站 | 兩組接受的主 archetype B 撞形 | 多樣性 | 重 | 接受 |
| 8 | 11 篇舊 demo | 早於 compute／render 約定，L1 第 11 項或 L2 失敗 | demo 閘門無法進 CI | 重（逐篇） | 待處理 |
| 9 | `scripts/quality/demo-audit.js` | L1 第 6、9 項為啟發式，有已知誤報 | 閘門可信度 | 中 | 待處理 |
| 10 | 9 篇（見說明） | 未點名目標的「上一篇／下一篇」共 10 處，另有 4 處「上一章／下一章」 | 可讀性 | 中 | 待處理 |

---

## 各項說明

### 6　接受的 B 撞形

發佈序上兩個 4 篇視窗內各有兩篇主 archetype 皆為 B：
`advanced-replication-consistency-handbook` ／ `data-sharding-basics`，以及 `wide-column-store` ／ `nat-port-forwarding`。
四篇的 demo 都是真模擬器，使用者於 2026-09-20 決定不動。

**影響**：`archetype-window.js` 全站模式會因此 exit 1；對這四篇跑 `--topic` 閘門也會失敗。
修訂這四篇時，這兩組撞形不視為本次修訂造成的失敗。
**若日後要歸零**：改其中一篇的主 archetype 並重做它的 demo，選代價最小的一篇。

### 8　早於 compute／render 約定的舊 demo

以下 11 篇的 demo 是真算的，但沒有依 style-guide §0.5 分出 `compute*` 純函式或沒有 `@probe`：

| 篇 | 失敗項 |
| :--- | :--- |
| `advanced-replication-consistency-handbook` | L1 #11、L2 |
| `consistent-hashing-handbook` | L1 #11、L2 |
| `data-sharding-basics` | L1 #11、L2 |
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

### 10　其餘篇的編號式引用

**問題**：與 style-guide「嚴格禁止的作法」第 15 條相同——「上一篇把 Kafka 講成…」這類句子描述了內容，卻沒點名是哪一篇，單篇閱讀時仍要靠發佈順序才找得到。

| 篇 | 位置 | 原文開頭 |
| :--- | :--- | :--- |
| `a2a-protocol` | 第 1 節 sec-sub | 上一篇把「Agent 怎麼接工具」講清楚了 |
| `a2a-protocol` | 第 7 節 sec-sub | 接上下一篇協定對照時才站得穩 |
| `advanced-replication-consistency-handbook` | 第 1 節 | 上一篇已介紹 Single-Leader / Multi-Leader / Leaderless |
| `ip-addressing-subnetting` | 第 1 節 | 上一篇我們建立了 TCP/IP 分層心智模型 |
| `kafka-architecture` | 第 1 節 | 上一篇把訊息骨幹拆成 Queue 與 Log 兩種模型 |
| `kafka-architecture` | 第 4 節清單 | 冪等——定義見上一篇 |
| `nat-port-forwarding` | 第 1 節 | 上一篇我們學會解讀 IPv4 與子網路遮罩 |
| `stream-processing` | 第 1 節 | 上一篇把 Kafka 講成可重放的分散式日誌 |
| `tls-https-fundamentals` | 第 8 節（最後一節） | 下一篇進入 HTTP/1.1 與 HTTP/2 |
| `llm-orchestration-agents` | 第 6 節 callout 標題 | 本篇只給動機，細節在後續三篇 |

本篇內的相對章節指涉「上一章／下一章」另有 4 處，一併改成「第 N 節」：`a2a-protocol` 第 4 節（「下一章 Demo」）、`vector-database-fundamentals` 第 3 節 sec-sub（「上一章的點」）、`wide-column-store` 第 2 節（「產品細節下一章再說」）、`redis-architecture` 第 5 節（「用 Cluster（下一章）」）。

**待裁決**：`realtime-connection-scaling` 的「前六篇」、`websocket-realtime-communication` 的「前四篇」屬計數式範圍指涉，2026-08 網路系列清理時被當作合規寫法保留；
但它和已改寫的 `mcp-protocol`「前三篇」是同一種依賴發佈順序的寫法。動手前先決定計數式是否也要改成點名。

**定位**（結果含合規寫法——同句已點名目標的「前一篇《…》」「前一篇的 TLS 篇」——以及 CSS／HTML 註解，須逐條判讀）：

```bash
grep -nE '前一篇|上一篇|下一篇|第[一二三四五六七八九十]+篇|前[一二三四五六七八九十]篇|篇 ?[0-9]+|[（(]s[0-9]+|上一章|下一章|前兩篇|後續[一二三四五六七八九十]篇'   drafts/*/content.html drafts/*/script.html
```

**做法**：跨篇改成「短稱＋內容描述」，本篇相對章節改「第 N 節」；改 draft 後 `generate.js --keep-date`（沿用既有 title／category）重產。
短稱沿用站內既有寫法：網路系列為「TCP/UDP 篇、TLS 篇、HTTP 篇、QUIC 篇、WebSocket 篇、NAT 篇、DNS 篇」等；Agent 系列為「Agent 編排篇、Agent Runtime 篇、Tool Gateway 篇、MCP 篇、A2A 篇、ACP 互通篇」。
