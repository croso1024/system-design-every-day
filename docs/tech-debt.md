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
| 10 | 首頁學習地圖 | 同欄順序由 barycenter 決定，資料一變既有分類的位置可能跟著變 | 地圖長期穩定性 | 輕 | 待處理 |
| 11 | `scripts/generate.js` | `--title` 與 mindmap 節點的 title 不一致時不會被擋 | 首頁與文章頁標題可能不同 | 輕 | 待處理 |

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

### 10　首頁學習地圖的同欄順序尚未固定

**現況**：首頁地圖的欄由分類 prerequisite 的最長路徑深度決定；同欄順序由 barycenter（前驅卡片中心 y 的平均）決定，
沒有前驅時依領域順序，最後比分類名稱的 code point。每次產頁都重算，所以新增分類或改動分類層 prerequisite 時，
既有分類在同一欄內的位置可能改變，讀者看到的地圖不保證穩定。改版時刻意只做到「可重現」，沒有做「固定」。

**預留的能力**：
- 同欄排序只在 `scripts/lib/learning-map-layout.js` 的 `compareSameColumn` 這一個 comparator 決定，導入時只需在這裡加一個比較鍵。
- `docs/categories.json` 每個分類已是物件（`{ "name", "domain" }`），可直接加欄位，不必改格式。
- 排版結果完全可重現（只比數字與 code point、不用 `localeCompare`，座標只用加減乘除），
  相同資料在任何 Node 版本都產生相同座標，所以「把當下順序寫死」不會改變畫面。

**做法**：寫一次性腳本讀取目前的排版結果（`node scripts/mindmap.js --action layout-report`，或直接呼叫排版模組），
把每個分類在同欄中的當下順序寫進 `categories.json` 的 `rank` 欄位；comparator 改為先比 `rank`，沒有 `rank` 的分類再走現有鍵。
`scripts/lib/categories.js` 的格式檢查與 `validate.js` 要接受新欄位；`add-topic.js --domain` 新增分類時不填 `rank`，
新分類插入的位置仍由 barycenter 決定，要固定時再補。做完當下畫面不變，之後既有分類的順序就固定了。
改完必跑 `node scripts/reindex-home.js` → `node scripts/validate.js`（首頁 payload 與 docs 重算結果必須同步）。

### 11　generate.js 的 --title 沒有對 mindmap 守衛

**現況**：主題的 title 存在兩處：`docs/mindmap.json` 的節點（由 `add-topic.js` 寫入）與 `docs/completed.json`
（由 `generate.js --title` 寫入）。首頁的卡片清單、路徑面板與文章頁各自讀取不同檔案的 title，
目前 50 篇兩邊完全一致，但這只靠 topic-author 的慣例維持；一旦不一致，同一篇會在首頁與內頁顯示不同名稱，
沒有任何閘門會報錯。`generate.js` 已對 `--category` 做「有給就必須與 mindmap 節點一致，否則零副作用 exit 1」，
title 沒有比照辦理。

**做法**：比照 `--category` 守衛，`--title` 有給就必須與 mindmap 節點的 title 一致，否則零副作用 exit 1；
或更進一步把 `--title` 改為選填、預設取節點的 title，讓 mindmap 成為 title 的唯一來源。
兩種做法都要同步更新 `generate.js` 檔頭的 usage、AGENTS.md 路徑表與 topic-author skill 的指令說明。
