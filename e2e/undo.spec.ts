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

async function openNewBoard(page: Page, title: string): Promise<void> {
  await page.goto('/');
  await expect(page.getByText(/Connecting to server|Disconnected from server/)).toBeHidden();
  await agent.call<{ board: Board }>('create_board', { title });
  await expect(page.getByRole('button', { name: 'Edit board title' })).toHaveText(title);
}

const questions = (page: Page) => page.getByRole('region', { name: 'Questions' });

test('keyboard undo/redo reverts board changes but not text being typed', async ({ page }) => {
  await openNewBoard(page, 'Undo with keyboard');
  const undoButton = page.getByRole('button', { name: 'Undo', exact: true });
  const redoButton = page.getByRole('button', { name: 'Redo', exact: true });
  await expect(undoButton).toBeDisabled();

  await page.getByRole('button', { name: '+ Question' }).click();
  await page.keyboard.type('First question');
  await page.keyboard.press('Enter');

  // Cmd/Ctrl+Z inside the text field is the browser's text undo, not a board undo.
  await page.keyboard.type('draft');
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('Escape');
  await expect(questions(page)).toContainText('First question');
  await expect(undoButton).toBeEnabled();

  await page.keyboard.press('ControlOrMeta+z');
  await expect(questions(page)).not.toContainText('First question');
  await expect(redoButton).toBeEnabled();
  await expect.poll(async () => (await agent.getBoard()).questions).toEqual([]);

  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(questions(page)).toContainText('First question');
  await expect(redoButton).toBeDisabled();
});

test('the AI can undo, and the human can redo with the button', async ({ page }) => {
  await openNewBoard(page, 'Undo by AI');
  const { changed } = await agent.call<{ changed: Array<{ id: string }> }>('add_rule', {
    text: 'Rule from AI',
    examples: ['Example from AI'],
  });
  await expect(page.getByTestId(changed[0]!.id)).toBeVisible();

  const undone = await agent.call<{ canRedo: boolean }>('undo');
  expect(undone.canRedo).toBe(true);
  await expect(page.getByTestId(changed[0]!.id)).toHaveCount(0);

  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId(changed[0]!.id)).toContainText('Rule from AI');
  await expect(page.getByTestId(changed[1]!.id)).toContainText('Example from AI');
  expect((await agent.getBoard()).rules).toHaveLength(1);
  await page.screenshot({ path: 'test-results/undo-redo.png' });
});
