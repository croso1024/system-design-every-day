# System Design Every Day

每日自動更新的 System Design 學習手冊。透過 Cursor Cloud Agent 與 Cursor Automation，依照待辦主題逐步產出含互動演示的 HTML 指南，並發佈至 GitHub Pages。

## 專案概念

1. **使用者** 在 `docs/todo.json` 新增想學習的 System Design 主題
2. **Cursor Automation** 定時觸發 Cloud Agent
3. **Agent** 比對 `todo` / `completed`，選定主題並產出內容
4. **組裝腳本** 將草稿注入 HTML 範本，更新目錄與狀態
5. **GitHub Actions** 部署 `books/` 至 GitHub Pages

## 工作流

```
┌─────────────────────────┐
│  Cursor Automation      │
│  (每日定時觸發)          │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  讀取 docs/todo.json     │
│  讀取 docs/completed.json│
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  選定下一個主題          │
│  參考 guidelines/        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  撰寫 drafts/{topic}/    │
│  content.html + script   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  node scripts/generate.js│
│  → books/{topic}/        │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│  Git commit & push       │
│  → GitHub Pages 部署     │
└─────────────────────────┘
```

## 資料夾結構

```
system-design-every-day/
├── Agents.md                 # Agent 工作流與角色說明
├── README.md                 # 專案說明（本文件）
├── guidelines/
│   └── style-guide.md        # UI/UX 與互動元件風格規範
├── docs/
│   ├── todo.json             # 待辦主題（使用者維護）
│   └── completed.json        # 已完成主題 metadata
├── templates/
│   └── base.html             # 全站 HTML 範本
├── drafts/                   # Agent 草稿工作區（執行時產生）
│   └── {topic-id}/
│       ├── content.html
│       └── script.html       # 可選
├── books/
│   ├── index.html            # 手冊目錄首頁
│   └── {topic-id}/
│       └── index.html        # 各主題指南
└── scripts/
    └── generate.js           # 範本組裝與索引更新
```

## 快速開始

### 新增待學習主題

編輯 [docs/todo.json](docs/todo.json)，加入新主題：

```json
{
  "id": "consistent-hashing",
  "title": "Consistent Hashing (一致性雜湊)",
  "category": "Distributed System"
}
```

### 手動組裝單篇（開發 / 測試用）

```bash
# 1. 建立草稿
mkdir -p drafts/consistent-hashing
# 編輯 drafts/consistent-hashing/content.html
# 可選：drafts/consistent-hashing/script.html

# 2. 執行組裝
node scripts/generate.js \
  --topic consistent-hashing \
  --title "Consistent Hashing (一致性雜湊)" \
  --category "Distributed System"
```

### Agent 必讀

Cloud Agent 執行前請閱讀 [Agents.md](Agents.md) 與 [guidelines/style-guide.md](guidelines/style-guide.md)。

## 部署

`books/` 目錄作為 GitHub Pages 的發佈根目錄。GitHub Actions workflow 將於後續設定。

## License

See [LICENSE](LICENSE).
