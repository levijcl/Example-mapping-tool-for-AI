# Implementation Plan

> 依據：[spec.md](./spec.md) · 每個任務完成後都要通過 `pnpm typecheck && pnpm test` 才算完成，並各自 commit。

## Phase 1 — 地基

### T1. Monorepo scaffold

- pnpm workspace：`packages/shared`、`packages/server`、`packages/web`
- TypeScript（strict）、Vitest、ESLint + Prettier、根目錄 scripts（`dev`/`start`/`test`/`typecheck`/`lint`）
- `.gitignore`（含 `boards/`、`node_modules`、`dist`）
- **驗收**：`pnpm install && pnpm typecheck && pnpm test` 通過（各 package 一個 smoke test）

### T2. shared：資料模型與 Commands

- zod schemas：Board / Rule / Example / Question / Command
- ID 產生（帶前綴的 nanoid）
- `applyCommand(board, command)`：spec §4 的全部 15 個 command，含錯誤訊息
- **驗收**：每個 command 的正常與錯誤路徑都有測試（ID 不存在、驗證失敗、index 越界、刪 rule 連帶刪 examples、跨 rule 移動 example）

### T3. shared：健康度分析與匯出

- `analyzeBoard(board) → Hint[]`，門檻定義為常數（spec §5）
- `exportMarkdown(board)`
- **驗收**：每個 hint 的門檻邊界（剛好等於與超過）都有測試；Markdown 有 snapshot 測試

**Checkpoint A**：核心 domain 完成，全部是純函式且有測試覆蓋。

## Phase 2 — Server

### T4. BoardStore

- 從 `DATA_DIR` 載入；`list` / `get` / `create` / `delete` / `apply(boardId, command, actor)`
- atomic write（寫 tmp 檔後 rename）
- 追蹤 `activeBoardId`
- 透過 event emitter 發出 `updated` / `boardsChanged` / `activeChanged`
- **驗收**：用暫存目錄測試存讀、重啟後資料還在、事件有正確發出

### T5. HTTP + WebSocket

- Hono：`/api/boards`（GET/POST/DELETE），production 模式提供 web 的靜態檔
- `ws` 掛在 `/ws`：處理 `open` / `command`，廣播 spec §7 定義的訊息
- 只綁定 `127.0.0.1:${PORT ?? 4319}`
- **驗收**：整合測試起一個真的 server，用 WS client 送 command，確認另一個 client 收到 `updated`

### T6. MCP server

- `@modelcontextprotocol/sdk` 的 Streamable HTTP，掛在 `/mcp`
- spec §6 的全部 tools（共用 zod schema）、server instructions、`facilitate-example-mapping` prompt
- active board 的預設行為
- **驗收**：用 SDK client 連線測試：`create_board` → `add_rule`（帶 examples）→ `get_board` 回傳正確內容與 hints；同時有 WS client 收到 `actor: "ai"` 的 `updated`

**Checkpoint B**：用 `claude mcp add` 實際連上，透過對話操作 board，確認 JSON 檔有正確變化。

## Phase 3 — Web UI

### T7. UI 骨架 + 唯讀渲染

- Vite + React + Tailwind；dev 模式把 `/api`、`/ws`、`/mcp` proxy 到 server
- WS client hook（自動重連、重連後重新 `open`、處理 `activeChanged`）
- 左側 board 列表（新增、刪除）；主畫面依 spec §8 的版面渲染 Story / Rules / Examples / Questions
- 連線狀態提示
- **驗收**：AI 透過 MCP 新增卡片，瀏覽器即時出現；AI `create_board` 時 UI 自動切換過去

### T8. 手動編輯

- inline 編輯（Enter／blur 存檔、Esc 取消）、新增、刪除、resolve／reopen question
- **驗收**：在 UI 完成每一種非拖拉的操作，`get_board` 都讀得到

### T9. 拖拉

- dnd-kit：Rule 欄位重排、Example 在欄內重排與跨欄移動
- **驗收**：拖拉後重新整理，結果仍在

### T10. AI 變更高亮

- `actor: "ai"` 的變更：用 `applyCommand` 回傳、隨 `updated` 廣播的 `affectedIds` 決定受影響的卡片，高亮約 2 秒
- **驗收**：AI 新增／修改的卡片有高亮，人類自己的修改沒有

## Phase 4 — 收尾

### T11. E2E + 文件

- Playwright：spec §10 的 3 個情境
- README：安裝、`pnpm start`、`claude mcp add` 設定、使用範例
- **驗收**：spec §11 的 MVP 驗收條件全部打勾

## 依賴關係

```
T1 → T2 → T3 → T4 → T5 → T6
                     T5 → T7 → T8 → T9 → T10
                           T6, T10 → T11
```

T6（MCP）和 T7（UI 骨架）只依賴 T5，可以平行進行。
