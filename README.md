# Example Map

一個在本機執行、**AI 可以透過 MCP 操控**的 Example Mapping 畫板。

你在 AI agent tool（Claude Code、Claude Desktop、Cursor…）裡用對話請 AI 扮演 Example Mapping facilitator，
它會在畫板上建立 Story、Rules、Examples、Questions；你在瀏覽器裡即時看到變化，也可以直接手動編輯、拖拉，
AI 下一輪會讀到你的修改。

- 黃卡 Story · 藍卡 Rules · 綠卡 Examples · 紅卡 Questions
- AI 剛改過的卡片會發出紫色光暈約 2 秒
- 資料存在 `boards/*.json`（已加入 `.gitignore`）

詳細設計見 [docs/spec.md](docs/spec.md)。

## 需求

- Node.js 22+
- pnpm 10+

## 開始使用

```bash
pnpm install
pnpm start
```

打開 <http://127.0.0.1:4319>。

### 連接 AI agent

Server 在 `http://127.0.0.1:4319/mcp` 提供 MCP（Streamable HTTP）。

**Claude Code**

```bash
claude mcp add --transport http example-map http://127.0.0.1:4319/mcp
```

**其他支援 MCP 的工具**：新增一個 HTTP（Streamable HTTP）類型的 MCP server，URL 填上面的 endpoint。

### 使用範例

在 agent 裡說：

> 我們來做 example mapping：「身為購物者，我可以在結帳時使用優惠券」

或使用 MCP prompt `facilitate-example-mapping`（Claude Code 中為 `/mcp__example-map__facilitate-example-mapping`）。

AI 會建立 board、提出 rules 與具體 examples，並把不確定的地方記成 questions。你可以：

- 直接在畫板上點擊文字編輯（Enter 儲存、Shift+Enter 換行、Esc 取消）
- 拖拉 rule 欄位重新排序，拖拉 example 到其他 rule
- 把 question 標為已解決並填入答案，再請 AI「根據答案更新 rules」

AI 的操作預設作用在**畫面上目前開啟的 board**。

## MCP 工具

| 類別      | 工具                                                                                        |
| --------- | ------------------------------------------------------------------------------------------- |
| Board     | `list_boards`、`create_board`、`open_board`、`get_board`、`export_markdown`                 |
| Story     | `set_title`、`set_story`                                                                    |
| Rules     | `add_rule`（可同時帶 examples）、`update_rule`、`delete_rule`、`move_rule`                  |
| Examples  | `add_example`、`update_example`、`delete_example`、`move_example`                           |
| Questions | `add_question`、`update_question`、`resolve_question`、`reopen_question`、`delete_question` |

`get_board` 會附上 hints（例如某條 rule 沒有 example、open questions 太多），讓 AI 主動提醒你。
刪除整個 board 只能在 UI 上做。

## 開發

```bash
pnpm dev          # server (watch, :4319) + Vite dev server（自動 proxy /api /ws /mcp）
pnpm test         # Vitest：shared / server / web
pnpm test:e2e     # Playwright（首次需 pnpm exec playwright install chromium）
pnpm typecheck
pnpm lint
```

環境變數：`PORT`（預設 4319）、`DATA_DIR`（預設 `<repo>/boards`）。

### 專案結構

```
packages/
  shared/   資料模型（zod）、applyCommand、健康度分析、Markdown 匯出、WS 協定
  server/   BoardStore（JSON 持久化）、REST + WebSocket、MCP server
  web/      React + Tailwind + dnd-kit 畫板
e2e/        Playwright：AI ↔ 瀏覽器同步、手動編輯、拖拉
docs/       spec 與實作計畫
```

### 安全性

Server 只綁定 `127.0.0.1`，並拒絕 Host / Origin 不是 localhost 的 HTTP 與 WebSocket 請求，
避免惡意網頁透過瀏覽器（DNS rebinding、跨站 WebSocket）操作你的畫板。
