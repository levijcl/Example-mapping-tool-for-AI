import { expect, test, type Page } from '@playwright/test';
import type { Board } from '@example-map/shared';
import { Agent } from './mcp';

let agent: Agent;

test.beforeEach(async ({ baseURL }) => {
  agent = await Agent.connect(baseURL!);
});

test.afterEach(async () => {
  await agent.close();
});

async function createBoardViaAgent(page: Page, title: string): Promise<Board> {
  await page.goto('/');
  await expect(page.getByText(/Connecting to server|Disconnected from server/)).toBeHidden();
  const { board } = await agent.call<{ board: Board }>('create_board', {
    title,
    story: 'Pay with a coupon',
  });
  await expect(page.getByRole('button', { name: 'Edit board title' })).toHaveText(title);
  return board;
}

test('AI changes appear live in the browser and are highlighted', async ({ page }) => {
  await createBoardViaAgent(page, 'AI live updates');

  const { changed } = await agent.call<{ changed: Array<{ id: string }> }>('add_rule', {
    text: 'Orders must total at least $1000',
    examples: ['$900 cart → coupon rejected'],
  });
  await agent.call('add_question', { text: 'Does tax count toward the minimum?' });

  const rule = page.getByTestId(changed[0]!.id);
  await expect(rule).toContainText('Orders must total at least $1000');
  await expect(rule).toHaveAttribute('data-highlighted', 'true');
  await expect(page.getByTestId(changed[1]!.id)).toContainText('$900 cart → coupon rejected');
  await expect(page.getByRole('region', { name: 'Questions' })).toContainText('Does tax count');

  await page.screenshot({ path: 'test-results/ai-live-updates.png' });
  await expect(rule).not.toHaveAttribute('data-highlighted');
});

test('manual edits in the browser are visible to the AI', async ({ page }) => {
  await createBoardViaAgent(page, 'Manual edits');
  const { changed } = await agent.call<{ changed: Array<{ id: string }> }>('add_rule', {
    text: 'Old rule',
  });
  const rule = page.getByTestId(changed[0]!.id);

  await rule.getByRole('button', { name: 'Edit rule' }).click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('One coupon per order');
  await page.keyboard.press('Enter');
  await expect(rule).toContainText('One coupon per order');

  await page
    .getByRole('region', { name: /^Rule: One coupon/ })
    .getByRole('button', { name: '+ Example' })
    .click();
  await page.keyboard.type('Two coupons → second one rejected');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '+ Question' }).click();
  await page.keyboard.type('What about gift cards?');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');

  await expect(page.getByRole('region', { name: 'Questions' })).toContainText(
    'What about gift cards?',
  );
  await expect(rule).not.toHaveAttribute('data-highlighted');

  const board = await agent.getBoard();
  expect(board.rules[0]?.text).toBe('One coupon per order');
  expect(board.rules[0]?.examples.map((e) => e.text)).toEqual([
    'Two coupons → second one rejected',
  ]);
  expect(board.questions.map((q) => q.text)).toEqual(['What about gift cards?']);

  const questionId = board.questions[0]!.id;
  await page.getByTestId(questionId).hover();
  await page.getByTestId(questionId).getByRole('button', { name: 'Resolve question' }).click();
  await expect.poll(async () => (await agent.getBoard()).questions[0]?.status).toBe('resolved');
});

test('dragging an example to another rule persists across reload', async ({ page }) => {
  await createBoardViaAgent(page, 'Drag and drop');
  await agent.call('add_rule', { text: 'Rule A', examples: ['Example 1', 'Example 2'] });
  await agent.call('add_rule', { text: 'Rule B' });
  const before = await agent.getBoard();
  const [ruleA, ruleB] = before.rules;
  const example1 = ruleA!.examples[0]!;

  const source = page.getByTestId(example1.id);
  const target = page.getByRole('region', { name: 'Rule: Rule B' });
  await expect(source).toBeVisible();
  const from = (await source.boundingBox())!;
  const to = (await target.boundingBox())!;

  await page.mouse.move(from.x + 20, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height - 10, { steps: 15 });
  await page.mouse.up();

  await expect
    .poll(async () => (await agent.getBoard()).rules[1]?.examples.map((e) => e.id))
    .toEqual([example1.id]);

  await page.reload();
  await expect(target.getByTestId(example1.id)).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Rule: Rule A' }).getByTestId(example1.id),
  ).toHaveCount(0);
  expect(ruleB).toBeDefined();
  await page.screenshot({ path: 'test-results/after-drag.png' });
});
