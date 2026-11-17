---
name: writing-e2e-tests
description: Use when adding, changing or debugging Playwright e2e tests under e2e/ in this repo — new specs, new Tasks or Questions, new UI locators, MCP tool calls from tests, or human/AI browser-sync scenarios.
---

# 寫 e2e 測試（Screenplay 三層）

## 概要

`e2e/` 採用 _BDD in Action_（第二版）「可攜式測試自動化」的三層架構，以 `e2e/screenplay.ts` 的輕量 Screenplay 實作。
核心原則：**spec 只說誰做了什麼、看到什麼；怎麼做由角色的 Ability 決定**。同一個 Task 可由 human（瀏覽器）或 ai（MCP）執行。

## 這個測試該不該寫在 e2e？

| 要驗證的東西                                                              | 放哪裡                                      |
| ------------------------------------------------------------------------- | ------------------------------------------- |
| 人類與 AI 透過瀏覽器 / MCP 共用 board 的行為（同步、UI 操作、拖拉、undo） | `e2e/`                                      |
| 只走 MCP、不需要瀏覽器（例如 `export_markdown` 的輸出）                   | `packages/server/src/mcp.test.ts`（Vitest） |
| 純邏輯（`applyCommand`、`exportMarkdown`、分析）                          | `packages/shared/src/*.test.ts`             |

## 每一層放什麼

| 層     | 檔案                                | 放什麼                                                      |
| ------ | ----------------------------------- | ----------------------------------------------------------- |
| 規格層 | `e2e/<功能>.spec.ts`                | 只有 `actor.attemptsTo(...)` 與 `actor.sees(...)`，業務語言 |
| 領域層 | `e2e/domain/tasks.ts`               | 所有 Task（新的也加在這裡，不另開檔）                       |
| 領域層 | `e2e/domain/questions.ts`           | 所有 Question（同上）                                       |
| 整合層 | `e2e/integration/browse-the-web.ts` | `BoardScreen`：所有 locator、DOM 結構知識                   |
| 整合層 | `e2e/integration/call-mcp-tools.ts` | MCP client、文字 → id 的查找（`ruleWithText` 等）           |
| 角色   | `e2e/fixtures.ts`                   | `human`、`ai` 兩個 Actor                                    |

spec 裡出現 `page.`、`getByRole`、`data-testid`、卡片 id 或 MCP tool 名稱，代表東西放錯層了：移到 Task／Question／`BoardScreen`。

## Task 與 Question 的寫法

```ts
// domain/tasks.ts — 每種 Ability 一個 via；角色有哪個能力就跑哪個（依列出順序取第一個符合的）
export const DeleteExample = (text: string): Activity =>
  task(
    `deletes the example "${text}"`, // 會成為 test.step 名稱：「Human deletes the example "…"」
    via(BrowseTheWeb, async ({ screen }) => {
      const card = screen.exampleCard(text); // locator 來自 BoardScreen，不在這裡寫 selector
      await card.hover();
      await card.getByRole('button', { name: 'Delete example' }).click();
    }),
    via(CallMcpTools, async (mcp) => {
      const { id } = exampleWithText(await mcp.board(), text); // 卡片以文字指稱，id 由整合層查
      await mcp.call('delete_example', { exampleId: id });
    }),
  );

// domain/questions.ts — 回傳「當下快照」，不等待；重試交給 actor.sees()
export const TheQuestions = {
  open: (): Question<string[]> =>
    question(
      'the open questions',
      via(BrowseTheWeb, ({ screen }) => screen.openQuestions.allTextContents()),
      fromBoard((board) => board.questions.filter((q) => q.status === 'open').map((q) => q.text)),
    ),
};

// <功能>.spec.ts
await human.attemptsTo(DeleteExample('Delete this example'));
await ai.sees(TheRules.examplesOf('A rule')).toEqual(['Keep this example']);
```

規則：

- **兩種實作都寫**：系統兩邊都能做的事（有對應 MCP tool），Task／Question 就同時提供 `BrowseTheWeb` 與 `CallMcpTools`。只有一邊能做的（鍵盤快捷鍵、高亮、截圖、`window.confirm`、沒有 MCP tool 的操作）只寫那一個 `via`，並在 JSDoc 註明。
- **Question 不等待**：UI 用 `allTextContents()`、`count()`、`evaluateAll()`、`isEnabled()` 這類不會等元素出現的 API；不要用 `textContent()`／`getAttribute()`（元素不存在時會卡到 timeout）。
- **斷言用 `actor.sees(question)`**（`expect.poll`），不要在 spec 直接 `expect(locator)`。
- **以文字指稱卡片**；並在 board 上保留一張不該受影響的卡，才能抓到「刪錯張」。
- **斷言的範圍看清單屬於誰**：同一塊 board 上的卡片清單（rules、examples、questions）只屬於這個測試，用 `toEqual([...])` 比對整個清單。board 清單（sidebar、`list_boards`）是整個 run 共用的，改用 `toContain` 與 `not.toContain`。
- **先重用**：動手前看 `tasks.ts`、`questions.ts`、`BoardScreen` 是否已有可用的 Task／Question／locator。

## Spec 的固定開場

```ts
test.beforeEach(async ({ human }) => {
  await human.attemptsTo(OpenTheApp());
});

test('…', async ({ human, ai }) => {
  await ai.attemptsTo(CreateBoard('唯一的 board 標題'));
  await human.sees(TheBoard.title()).toBe('唯一的 board 標題'); // 等 UI 切到新 board 再繼續
  // …
});
```

server 在整個 run 共用同一個資料目錄，所以每個測試用**不重複的 board 標題**。

## 完成前的驗證（必做）

1. `pnpm test:e2e` — 全部通過；新測試要親眼看它跑過，不能只讀程式碼推論。
2. `pnpm typecheck` — 已包含 `e2e/`（`e2e/tsconfig.json`）。
3. `pnpm lint` 與 `pnpm exec prettier --check .`
4. **另一條路徑**：如果新 Task／Question 的某個 `via` 沒有被任何 spec 用到（例如只讓 ai 刪，但也寫了 UI 版），寫一個臨時 spec 把角色對調跑一次，通過後刪除，並在回報中說明。
5. 回報時列出：哪些 `via` 被 spec 覆蓋、哪些只經過臨時驗證。

## 常見錯誤

| 錯誤                                                          | 修正                                               |
| ------------------------------------------------------------- | -------------------------------------------------- |
| 為新功能另開 `domain/<x>.ts`，把 Task 和 Question 混在一起    | Task 加進 `tasks.ts`，Question 加進 `questions.ts` |
| spec 裡直接寫 `page.getByRole(...)` 或 `agent.call('...')`    | 包成 Task／Question，locator 放 `BoardScreen`      |
| Question 用 `locator.textContent()`，元素不存在時整個測試卡住 | 改用 `allTextContents()` 取 `[0] ?? ''`            |
| 斷言 `toContain` 某張卡，刪錯卡也會通過                       | 保留一張對照卡，`toEqual` 整個清單                 |
| 只讀程式碼就宣稱測試可行                                      | 跑 `pnpm test:e2e`，並驗證沒被覆蓋的 `via`         |
| 把只需 MCP 的輸出測試寫成 e2e                                 | 放 server 的 Vitest                                |
