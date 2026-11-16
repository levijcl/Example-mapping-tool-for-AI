/**
 * Domain layer: what people do on an example map, independent of how they do it.
 * Each task has a browser implementation and, where the AI can do it too, an MCP one.
 */
import { expect } from '@playwright/test';
import { BrowseTheWeb } from '../integration/browse-the-web';
import {
  CallMcpTools,
  exampleWithText,
  questionWithText,
  ruleWithText,
} from '../integration/call-mcp-tools';
import { task, via, type Activity } from '../screenplay';

export const OpenTheApp = (): Activity =>
  task(
    'opens the app',
    via(BrowseTheWeb, async ({ page, screen }) => {
      await page.goto('/');
      await expect(screen.connectionStatus).toBeHidden();
    }),
  );

export const ReloadTheApp = (): Activity =>
  task(
    'reloads the app',
    via(BrowseTheWeb, async ({ page, screen }) => {
      await page.reload();
      await expect(screen.connectionStatus).toBeHidden();
    }),
  );

export const TakeAScreenshot = (name: string): Activity =>
  task(
    `takes a screenshot "${name}"`,
    via(BrowseTheWeb, async ({ page }) => {
      await page.screenshot({ path: `test-results/${name}.png` });
    }),
  );

export const CreateBoard = (title: string, { story }: { story?: string } = {}): Activity =>
  task(
    `creates the board "${title}"`,
    via(BrowseTheWeb, async ({ page, screen }) => {
      await screen.addButton(screen.boards, 'New board').click();
      await page.keyboard.type(title);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      await expect(screen.boardTitle).toHaveText(title);
      if (story) {
        await screen.story.click();
        await page.keyboard.type(story);
        await page.keyboard.press('Enter');
      }
    }),
    via(CallMcpTools, async (mcp) => {
      await mcp.call('create_board', { title, story });
    }),
  );

export const AddRule = (text: string, { examples = [] }: { examples?: string[] } = {}): Activity =>
  task(
    `adds the rule "${text}"` + (examples.length ? ` with ${examples.length} example(s)` : ''),
    via(BrowseTheWeb, async ({ page, screen }, actor) => {
      await screen.addButton(page, 'Rule').click();
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
      for (const example of examples) await actor.attemptsTo(AddExample(example).toTheRule(text));
    }),
    via(CallMcpTools, async (mcp) => {
      await mcp.call('add_rule', { text, examples });
    }),
  );

export const AddExample = (text: string) => ({
  toTheRule: (rule: string): Activity =>
    task(
      `adds the example "${text}" to the rule "${rule}"`,
      via(BrowseTheWeb, async ({ page, screen }) => {
        await screen.addButton(screen.rule(rule), 'Example').click();
        await page.keyboard.type(text);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Escape');
      }),
      via(CallMcpTools, async (mcp) => {
        const { id } = ruleWithText(await mcp.board(), rule);
        await mcp.call('add_example', { ruleId: id, text });
      }),
    ),
});

export const RewordRule = (from: string) => ({
  to: (to: string): Activity =>
    task(
      `rewords the rule "${from}" to "${to}"`,
      via(BrowseTheWeb, async ({ page, screen }) => {
        await screen.ruleCard(from).getByRole('button', { name: 'Edit rule' }).click();
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.type(to);
        await page.keyboard.press('Enter');
        await expect(screen.ruleCard(to)).toBeVisible();
      }),
      via(CallMcpTools, async (mcp) => {
        const { id } = ruleWithText(await mcp.board(), from);
        await mcp.call('update_rule', { ruleId: id, text: to });
      }),
    ),
});

export const MoveExample = (text: string) => ({
  toTheRule: (rule: string): Activity =>
    task(
      `moves the example "${text}" to the rule "${rule}"`,
      via(BrowseTheWeb, async ({ page, screen }) => {
        const source = screen.exampleCard(text);
        const target = screen.rule(rule);
        await expect(source).toBeVisible();
        const from = (await source.boundingBox())!;
        const to = (await target.boundingBox())!;

        // dnd-kit needs a small move to start the drag, then a gradual move to the drop target.
        await page.mouse.move(from.x + 20, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + 40, from.y + from.height / 2, { steps: 5 });
        await page.mouse.move(to.x + to.width / 2, to.y + to.height - 10, { steps: 15 });
        await page.mouse.up();
      }),
      via(CallMcpTools, async (mcp) => {
        const board = await mcp.board();
        await mcp.call('move_example', {
          exampleId: exampleWithText(board, text).id,
          toRuleId: ruleWithText(board, rule).id,
        });
      }),
    ),
});

export const AddQuestion = (text: string): Activity =>
  task(
    `adds the question "${text}"`,
    via(BrowseTheWeb, async ({ page, screen }) => {
      await screen.addButton(screen.questions, 'Question').click();
      await page.keyboard.type(text);
      await page.keyboard.press('Enter');
      await page.keyboard.press('Escape');
    }),
    via(CallMcpTools, async (mcp) => {
      await mcp.call('add_question', { text });
    }),
  );

export const ResolveQuestion = (text: string): Activity =>
  task(
    `resolves the question "${text}"`,
    via(BrowseTheWeb, async ({ screen }) => {
      const card = screen.questionCard(text);
      await card.hover();
      await card.getByRole('button', { name: 'Resolve question' }).click();
    }),
    via(CallMcpTools, async (mcp) => {
      const { id } = questionWithText(await mcp.board(), text);
      await mcp.call('resolve_question', { questionId: id });
    }),
  );

/** Types into a new question card, then undoes the typing with Cmd/Ctrl+Z and cancels. */
export const DraftAQuestionAndUndoTheTyping = (draft: string): Activity =>
  task(
    `drafts the question "${draft}" and undoes the typing`,
    via(BrowseTheWeb, async ({ page, screen }) => {
      await screen.addButton(screen.questions, 'Question').click();
      await page.keyboard.type(draft);
      await page.keyboard.press('ControlOrMeta+z');
      await page.keyboard.press('Escape');
    }),
  );

const historyStep = (direction: 'undo' | 'redo', shortcut: string) => {
  const verb = direction === 'undo' ? 'undoes' : 'redoes';
  return {
    theLastChange: (): Activity =>
      task(
        `${verb} the last change`,
        via(BrowseTheWeb, async ({ screen }) => {
          await (direction === 'undo' ? screen.undoButton : screen.redoButton).click();
        }),
        via(CallMcpTools, async (mcp) => {
          await mcp.call(direction);
        }),
      ),
    withTheKeyboard: (): Activity =>
      task(
        `${verb} the last change with the keyboard`,
        via(BrowseTheWeb, async ({ page }) => {
          await page.keyboard.press(shortcut);
        }),
      ),
  };
};

export const Undo = historyStep('undo', 'ControlOrMeta+z');
export const Redo = historyStep('redo', 'ControlOrMeta+Shift+z');
