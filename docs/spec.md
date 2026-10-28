# Spec: AI 可操控的 Example Mapping 畫板

> 狀態：Approved · 最後更新：2026-10-28

## 1. 目標

做一個在本機執行的 Example Mapping 畫板。人類在 AI agent tool（Claude Code、Claude Desktop、Cursor 等）裡透過對話，讓 AI 以 **Example Mapping assistant** 的身份逐步建構畫板；人類也可以直接在瀏覽器裡手動操作同一個畫板，雙方的變更即時同步。

### 使用情境

1. 使用者執行 `pnpm start`，瀏覽器打開畫板。
2. 在 agent tool 裡說：「我們來 map 這個 story：使用者可以用優惠券結帳」。
3. AI 建立 board、寫入 Story，提出 Rules、Examples，並主動把不確定的地方記成 Questions。
4. 使用者在畫板上看到卡片即時出現，手動修改文字、拖拉 Example 到別的 Rule、把某個 Question 標成已解決。
5. 使用者再對 AI 說「繼續」，AI 讀回畫板（包含人類的修改）並接著補充。

### Non-goals

- 多人共編、帳號、認證、雲端部署
- 自由畫布（任意座標、連線、手繪）
- 本專案程式碼本身呼叫任何 LLM API —— 「主動協助」由使用者的 agent 負責，我們只提供工具與引導

## 2. 架構

```
┌──────────────┐  MCP (Streamable HTTP)  ┌──────────────────────────┐  WebSocket  ┌────────────┐
│ AI agent tool│ ──────────────────────▶ │ Board Server (Node)      │ ◀─────────▶ │ Web UI     │
│              │ ◀────────────────────── │ 127.0.0.1:4319           │             │ (React)    │
└──────────────┘                         │  /mcp  /ws  /api  /      │             └────────────┘
                                         │  BoardStore → boards/*.json
                                         └──────────────────────────┘
```

- **單一 process、單一事實來源。** AI（MCP）和人類（WebSocket）的所有變更都轉成同一套 `Command`，由 `BoardStore` 依序套用、驗證、存檔、廣播。
- **Last-write-wins。** Node 單執行緒依序處理 command，不做衝突合併。
- 只綁定 `127.0.0.1`。

### 技術棧

| 層       | 選擇                                                                   |
| -------- | ---------------------------------------------------------------------- |
| Monorepo | TypeScript + pnpm workspace                                            |
| 共用模型 | zod（schema 即型別，同時供 MCP input schema 與 WS 驗證使用）           |
| Server   | Node 22 + Hono + `ws` + `@modelcontextprotocol/sdk`（Streamable HTTP） |
| Web      | Vite + React + Tailwind + dnd-kit                                      |
| 持久化   | `boards/<boardId>.json`（atomic write：寫 tmp 檔後 rename）            |
| 測試     | Vitest（shared / server）、Playwright（E2E）                           |

### 專案結構

```
packages/
  shared/   # zod schemas、Command 定義、applyCommand（純函式）、health 分析
  server/   # BoardStore、HTTP/WS、MCP server
  web/      # React UI
docs/
  spec.md
boards/     # 執行時資料（.gitignore）
```

## 3. 資料模型

```ts
type Board = {
  id: string; // "b_" + 8 碼 nanoid
  title: string;
  story: string; // 黃卡，可為空字串
  rules: Rule[]; // 順序即顯示順序
  questions: Question[];
  version: number; // 每套用一個 command +1
  createdAt: string; // ISO
  updatedAt: string;
};

type Rule = { id: string; text: string; examples: Example[] }; // "r_..."
type Example = { id: string; text: string }; // "e_..."
type Question = {
  // "q_..."
  id: string;
  text: string;
  status: 'open' | 'resolved';
  resolution?: string; // 解決時的答案／結論
};
```

- ID 使用帶前綴的短 ID，方便 AI 在對話中引用、不易混淆類型。
- 所有文字欄位：trim 後 1–500 字（`story`、`resolution` 允許空字串）。
- Example 一定屬於某條 Rule；刪除 Rule 會一併刪除其 Examples。

## 4. Commands（所有變更的唯一入口）

`applyCommand(board, command) → board | Error` 是 `shared` 中的純函式，server 與測試共用。

| Command           | 參數                                    | 說明                    |
| ----------------- | --------------------------------------- | ----------------------- |
| `setTitle`        | `title`                                 |                         |
| `setStory`        | `text`                                  |                         |
| `addRule`         | `text`, `index?`, `examples?: string[]` | 可一次帶入多個 examples |
| `updateRule`      | `ruleId`, `text`                        |                         |
| `deleteRule`      | `ruleId`                                | 連帶刪除 examples       |
| `moveRule`        | `ruleId`, `toIndex`                     |                         |
| `addExample`      | `ruleId`, `text`, `index?`              |                         |
| `updateExample`   | `exampleId`, `text`                     |                         |
| `deleteExample`   | `exampleId`                             |                         |
| `moveExample`     | `exampleId`, `toRuleId`, `toIndex`      | 可跨 Rule               |
| `addQuestion`     | `text`                                  |                         |
| `updateQuestion`  | `questionId`, `text`                    |                         |
| `resolveQuestion` | `questionId`, `resolution?`             |                         |
| `reopenQuestion`  | `questionId`                            |                         |
| `deleteQuestion`  | `questionId`                            |                         |

每個 command 套用時附帶 `actor: "human" | "ai"`，隨廣播送出（UI 用來標示 AI 剛改了什麼）。

錯誤（ID 不存在、驗證失敗、index 越界）回傳明確訊息，例如：`Rule r_ab12cd34 not found. Call get_board to refresh.`

## 5. 健康度分析（給 AI 主動協助的依據）

`analyzeBoard(board) → Hint[]`，純函式，結果附在 `get_board` 回傳中。

| 條件                 | Hint                           |
| -------------------- | ------------------------------ |
| Story 為空           | 先釐清 story                   |
| 沒有任何 Rule        | 開始找出 acceptance rules      |
| Rule 沒有 Example    | `Rule r_x has no examples`     |
| Rule 的 Examples > 6 | 這條 rule 可能太大，考慮拆分   |
| Rules > 8            | Story 可能太大，考慮拆分 story |
| Open questions > 5   | Story 可能還沒準備好進開發     |

門檻集中定義為常數，方便調整。

## 6. MCP 介面

Endpoint：`http://127.0.0.1:4319/mcp`（Streamable HTTP）。
設定方式：`claude mcp add --transport http example-map http://127.0.0.1:4319/mcp`

### Active board

Server 維護 `activeBoardId`：最近一次在 UI 開啟、或透過 MCP 建立／指定的 board。所有 board 操作工具的 `boardId` 都是選填，省略時使用 active board；沒有 active board 時回傳錯誤並提示先 `list_boards` 或 `create_board`。

### Tools

| Tool                                                                        | 參數                                      | 回傳                                                                  |
| --------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `list_boards`                                                               | —                                         | `[{id, title, updatedAt, ruleCount, openQuestionCount}]`，標示 active |
| `create_board`                                                              | `title`, `story?`                         | 新 board（並設為 active，UI 自動切換過去）                            |
| `open_board`                                                                | `boardId`                                 | 設為 active，回傳同 `get_board`                                       |
| `get_board`                                                                 | `boardId?`                                | 完整 board + `hints`                                                  |
| `set_story`                                                                 | `text`, `boardId?`                        |                                                                       |
| `add_rule`                                                                  | `text`, `examples?`, `index?`, `boardId?` | 新 rule（含 example IDs）                                             |
| `update_rule` / `delete_rule` / `move_rule`                                 | 對應 command                              |                                                                       |
| `add_example` / `update_example` / `delete_example` / `move_example`        | 對應 command                              |                                                                       |
| `add_question` / `resolve_question` / `reopen_question` / `delete_question` | 對應 command                              |                                                                       |
| `export_markdown`                                                           | `boardId?`                                | Markdown 文字                                                         |

- 變更類工具回傳：受影響的實體（含新 ID）+ `version`。為避免 context 膨脹，不回傳整張 board。
- 每個工具的 description 用語意描述「何時使用」，例如 `add_question`：「當你或使用者對規則有不確定、需要 PO/業務確認的地方時使用」。

### Server instructions

MCP initialize 時回傳 `instructions`，摘要 assistant 行為準則：

- 你是 Example Mapping facilitator。目標是透過具體 examples 釐清 story 的 rules。
- 每輪動作前先 `get_board`，因為人類可能手動改過。
- 主動：為缺少 example 的 rule 提出 examples；對模糊、邊界條件、互相矛盾之處新增 Question，而不是自行假設；根據 hints 提醒使用者拆分 story／rule。
- 不要刪除或改寫人類建立的內容，除非使用者要求。
- Example 用具體情境描述（例如「購物車 $900，用 $100 券 → 被拒，未達 $1000 門檻」），不要寫成抽象規則。

### Prompts

- `facilitate-example-mapping`（參數：`story?`）：展開完整的 facilitation 流程與範例，供使用者在 agent tool 中以 slash prompt 啟動一個 session。

## 7. HTTP / WebSocket 介面（UI 使用）

### REST

| Method | Path              | 說明                           |
| ------ | ----------------- | ------------------------------ |
| GET    | `/api/boards`     | board 列表                     |
| POST   | `/api/boards`     | 建立 `{title}`                 |
| DELETE | `/api/boards/:id` | 刪除（僅 UI 提供，MCP 不提供） |

### WebSocket `/ws`

Client → Server（`ClientMessage`）：

```ts
type ClientMessage =
  | { type: 'open'; boardId: string } // 訂閱並設為 active
  | { type: 'command'; boardId: string; requestId: string; command: Command };
```

Server → Client（`ServerMessage`）：

```ts
type ServerMessage =
  | { type: 'snapshot'; board: Board } // open 之後
  | { type: 'updated'; board: Board; command: Command; actor: Actor; affectedIds: string[] } // 任何來源的變更
  | { type: 'boardsChanged' } // 列表有變，UI 重新 GET
  | { type: 'activeChanged'; boardId: string | null; actor: Actor } // UI 只在 actor 為 ai 時跟著切換
  | { type: 'error'; requestId?: string; message: string };
```

Board 很小（數十張卡），每次變更都送整張 board，前端直接替換 state，不做 diff。

## 8. UI

- **左側**：board 列表、新增、刪除。
- **主畫面**：
  - 頂部：Title、Story（黃卡）
  - 中間：Rules 橫向排列成欄（藍卡為欄首），欄內為 Examples（綠卡）；橫向可捲動
  - 右側：Questions 欄（紅卡），已解決的收合在下方並顯示 resolution
- **互動**：
  - 點擊卡片文字 → inline 編輯，Enter／blur 存檔，Esc 取消
  - 每欄底部「+ Example」，Rules 列尾端「+ Rule」，Questions 欄「+ Question」
  - 卡片 hover 顯示刪除；Question 顯示 resolve／reopen
  - dnd-kit：拖拉 Rule 欄重排；拖拉 Example 在欄內重排或移到其他欄
- **AI 可見性**：`actor: "ai"` 的變更，依 `updated` 訊息中的 `affectedIds` 將受影響的卡片短暫高亮（約 2 秒）。
- **連線狀態**：WS 斷線時顯示提示並自動重連，重連後重新 `open`。

## 9. 指令

| 指令                           | 說明                                     |
| ------------------------------ | ---------------------------------------- |
| `pnpm install`                 |                                          |
| `pnpm dev`                     | Server（watch）+ Vite dev server         |
| `pnpm start`                   | Build web 後啟動 server，在 4319 提供 UI |
| `pnpm test`                    | Vitest                                   |
| `pnpm test:e2e`                | Playwright                               |
| `pnpm typecheck` / `pnpm lint` |                                          |

環境變數：`PORT`（預設 4319）、`DATA_DIR`（預設 `./boards`）。

## 10. 測試策略

- **shared（Vitest，主力）**：每個 command 的正常／錯誤路徑、`analyzeBoard` 各 hint 門檻、schema 驗證。
- **server（Vitest）**：BoardStore 存讀檔與 atomic write；用 MCP SDK client 連 in-process server，呼叫工具後驗證 board 狀態與 WS 廣播。
- **E2E（Playwright）**：
  1. 透過 MCP client 呼叫 `add_rule` → 瀏覽器中出現卡片且高亮
  2. 瀏覽器手動編輯 → `get_board` 讀到修改
  3. 拖拉 Example 到另一個 Rule → 持久化後重新整理仍在

## 11. MVP 驗收條件

- [x] `pnpm start` 後，瀏覽器在 `http://127.0.0.1:4319` 看到畫板
- [ ] Claude Code 以 `claude mcp add` 連上後，能透過對話建立 board、Story、Rules、Examples、Questions
- [x] AI 的變更 1 秒內出現在 UI，且有高亮
- [x] UI 可完成所有 command 對應的手動操作（含拖拉）
- [x] 人類手動修改後，AI 的 `get_board` 能讀到並回傳 hints
- [x] 重啟 server 後資料仍在
- [x] `pnpm test`、`pnpm test:e2e`、`pnpm typecheck` 全部通過

## 12. MVP 之後（不在本次範圍）

- Undo／redo（特別是撤銷 AI 的一批操作）
- 匯出 Gherkin `.feature`
- Question 關聯到特定 Rule
- 鍵盤快捷鍵
- 卡片備註、Example 的 given/when/then 結構化欄位

## 13. 已確認決定

1. Port 預設 4319。
2. 資料目錄為 repo 內的 `boards/`，加入 `.gitignore`。
3. Undo 不在 MVP，列入第 12 節之後再做。
