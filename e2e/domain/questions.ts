/**
 * Domain layer: what people can observe on an example map.
 * Answers are snapshots (they never wait), so use them through `actor.sees(...)`, which retries.
 */
import type { Board } from '@example-map/shared';
import { BrowseTheWeb } from '../integration/browse-the-web';
import { CallMcpTools } from '../integration/call-mcp-tools';
import { question, via, type Question } from '../screenplay';

const fromBoard = <T>(read: (board: Board) => T) =>
  via(CallMcpTools, async (mcp) => read(await mcp.board()));

export const TheBoard = {
  title: (): Question<string> =>
    question(
      'the board title',
      via(BrowseTheWeb, async ({ screen }) => (await screen.boardTitle.allTextContents())[0] ?? ''),
      fromBoard((board) => board.title),
    ),
};

export const TheRules = {
  all: (): Question<string[]> =>
    question(
      'the rules',
      via(BrowseTheWeb, ({ screen }) => screen.ruleCards.allTextContents()),
      fromBoard((board) => board.rules.map((r) => r.text)),
    ),

  examplesOf: (rule: string): Question<string[]> =>
    question(
      `the examples of the rule "${rule}"`,
      via(BrowseTheWeb, ({ screen }) => screen.examplesOf(rule).allTextContents()),
      fromBoard(
        (board) => board.rules.find((r) => r.text === rule)?.examples.map((e) => e.text) ?? [],
      ),
    ),

  /** Whether the rule card is highlighted as a recent AI change. Only visible in the browser. */
  isHighlighted: (rule: string): Question<boolean> =>
    question(
      `whether the rule "${rule}" is highlighted`,
      via(BrowseTheWeb, ({ screen }) =>
        screen
          .ruleCard(rule)
          .evaluateAll((cards) => cards.some((c) => (c as HTMLElement).dataset.highlighted)),
      ),
    ),
};

export const TheQuestions = {
  open: (): Question<string[]> =>
    question(
      'the open questions',
      via(BrowseTheWeb, ({ screen }) => screen.openQuestions.allTextContents()),
      fromBoard((board) => board.questions.filter((q) => q.status === 'open').map((q) => q.text)),
    ),

  resolved: (): Question<string[]> =>
    question(
      'the resolved questions',
      via(BrowseTheWeb, ({ screen }) => screen.resolvedQuestions.allTextContents()),
      fromBoard((board) =>
        board.questions.filter((q) => q.status === 'resolved').map((q) => q.text),
      ),
    ),
};

export const TheHistory = {
  canUndo: (): Question<boolean> =>
    question(
      'whether undo is available',
      via(BrowseTheWeb, ({ screen }) => screen.undoButton.isEnabled()),
      via(CallMcpTools, async (mcp) => mcp.lastKnownHistory().canUndo),
    ),

  canRedo: (): Question<boolean> =>
    question(
      'whether redo is available',
      via(BrowseTheWeb, ({ screen }) => screen.redoButton.isEnabled()),
      via(CallMcpTools, async (mcp) => mcp.lastKnownHistory().canRedo),
    ),
};
