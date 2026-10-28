import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  analyzeBoard,
  exportMarkdown,
  TEXT_MAX_LENGTH,
  type Board,
  type Command,
} from '@example-map/shared';
import type { BoardStore, ChangeResult } from './board-store';

export const SERVER_INSTRUCTIONS = `
You are an Example Mapping facilitator working on a shared board that a human is watching live in their browser.

Example Mapping clarifies a user story through concrete examples:
- Story (yellow): the user story under discussion.
- Rules (blue): acceptance rules / business rules the story must satisfy.
- Examples (green): concrete scenarios that illustrate a rule, listed under it.
- Questions (red): unknowns that someone (often the product owner) must answer.

How to work:
- Call get_board before acting each turn. The human may have edited the board by hand since your last turn.
- Act proactively as a facilitator:
  - Propose concrete examples for rules that have none.
  - When something is ambiguous, an edge case is unclear, or rules conflict, add a Question instead of assuming an answer.
  - Read the "hints" returned by get_board and raise them with the human (e.g. split a story or rule that is too big).
- Write examples as specific scenarios with concrete data, e.g. "Cart $900 + $100 coupon → rejected (below $1000 minimum)", not abstract restatements of the rule.
- Keep each card short: one rule, one example, or one question per card.
- Do not delete or rewrite content the human created unless they ask you to.
- Prefer add_rule with its examples argument to add a rule and its first examples in one call.
- If the human says your last change was wrong, you can use undo (one step per tool call). The undo history is shared with the human, so check get_board first.
- Reply to the human in the language they use; card text should follow the language of the existing board.
`.trim();

const boardIdArg = z
  .string()
  .optional()
  .describe('Board ID. Omit to use the active board (the one currently open in the UI).');
const text = z.string().min(1).max(TEXT_MAX_LENGTH);
const index = z.number().int().min(0);

type BoardResolution = { ok: true; board: Board } | { ok: false; error: string };

export function createMcpServer(store: BoardStore): McpServer {
  const server = new McpServer(
    { name: 'example-map', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );

  /** Resolves the target board. An explicit boardId also becomes active so the human sees it. */
  const resolveBoard = (boardId: string | undefined): BoardResolution => {
    const id = boardId ?? store.activeBoardId;
    if (!id) {
      return { ok: false, error: 'No active board. Call list_boards or create_board first.' };
    }
    const board = store.get(id);
    if (!board)
      return {
        ok: false,
        error: `Board ${id} not found. Call list_boards to see available boards.`,
      };
    if (boardId) store.setActive(board.id, 'ai');
    return { ok: true, board };
  };

  const describeBoard = (board: Board) => ({
    board,
    hints: analyzeBoard(board),
    isActive: board.id === store.activeBoardId,
  });

  const commandTool = <Shape extends z.ZodRawShape>(
    name: string,
    description: string,
    shape: Shape,
    toCommand: (args: z.infer<z.ZodObject<Shape>>) => Command,
  ) => {
    const inputSchema: z.ZodRawShape = { ...shape, boardId: boardIdArg };
    server.registerTool(
      name,
      { description, inputSchema },
      async ({ boardId, ...rest }): Promise<CallToolResult> => {
        const target = resolveBoard(boardId as string | undefined);
        if (!target.ok) return fail(target.error);
        // The SDK has already validated `rest` against `shape`.
        const command = toCommand(rest as z.infer<z.ZodObject<Shape>>);
        return changeResult(store.apply(target.board.id, command, 'ai'));
      },
    );
  };

  for (const direction of ['undo', 'redo'] as const) {
    server.registerTool(
      direction,
      {
        description:
          direction === 'undo'
            ? 'Undo the most recent change to the board. The history is shared with the human, so this ' +
              'may undo their edit: call get_board first, and tell the human what you undid.'
            : 'Redo the most recently undone change. Tell the human what you redid.',
        inputSchema: { boardId: boardIdArg },
      },
      async ({ boardId }) => {
        const target = resolveBoard(boardId);
        if (!target.ok) return fail(target.error);
        return changeResult(store[direction](target.board.id, 'ai'));
      },
    );
  }

  server.registerTool(
    'list_boards',
    { description: 'List all example-mapping boards, most recently updated first.' },
    async () => ok({ activeBoardId: store.activeBoardId, boards: store.list() }),
  );

  server.registerTool(
    'create_board',
    {
      description:
        'Create a new board for a user story. It becomes the active board and opens in the UI.',
      inputSchema: {
        title: text.describe('Short board title, e.g. the feature name.'),
        story: z.string().max(TEXT_MAX_LENGTH).optional().describe('The user story text.'),
      },
    },
    async ({ title, story }) => ok(describeBoard(store.create(title, story ?? '', 'ai'))),
  );

  server.registerTool(
    'open_board',
    {
      description: 'Make a board active, which also switches the UI to it. Returns the board.',
      inputSchema: { boardId: z.string() },
    },
    async ({ boardId }) => {
      const target = resolveBoard(boardId);
      return target.ok ? ok(describeBoard(target.board)) : fail(target.error);
    },
  );

  server.registerTool(
    'get_board',
    {
      description:
        'Read the full board (story, rules with examples, questions) plus facilitation hints. ' +
        'Call this before acting, because the human may have edited the board.',
      inputSchema: { boardId: boardIdArg },
    },
    async ({ boardId }) => {
      const target = resolveBoard(boardId);
      return target.ok ? ok(describeBoard(target.board)) : fail(target.error);
    },
  );

  server.registerTool(
    'export_markdown',
    {
      description: 'Export the board as Markdown, e.g. to paste into a ticket.',
      inputSchema: { boardId: boardIdArg },
    },
    async ({ boardId }) => {
      const target = resolveBoard(boardId);
      return target.ok
        ? { content: [{ type: 'text', text: exportMarkdown(target.board) }] }
        : fail(target.error);
    },
  );

  commandTool('set_title', 'Rename the board.', { title: text }, ({ title }) => ({
    type: 'setTitle',
    title,
  }));
  commandTool(
    'set_story',
    'Set or rewrite the user story (yellow card).',
    { text: z.string().max(TEXT_MAX_LENGTH) },
    ({ text }) => ({ type: 'setStory', text }),
  );

  commandTool(
    'add_rule',
    'Add an acceptance rule (blue card), optionally with its first concrete examples.',
    {
      text: text.describe('The rule, e.g. "Orders must total at least $1000 to use a coupon".'),
      examples: z.array(text).optional().describe('Concrete examples illustrating this rule.'),
      index: index.optional().describe('Position among rules (0-based). Omit to append.'),
    },
    ({ text, examples, index }) => ({ type: 'addRule', text, examples, index }),
  );
  commandTool(
    'update_rule',
    'Reword an existing rule.',
    { ruleId: z.string(), text },
    ({ ruleId, text }) => ({ type: 'updateRule', ruleId, text }),
  );
  commandTool(
    'delete_rule',
    'Delete a rule and all its examples. Only do this when the human agrees.',
    { ruleId: z.string() },
    ({ ruleId }) => ({ type: 'deleteRule', ruleId }),
  );
  commandTool(
    'move_rule',
    'Reorder a rule.',
    { ruleId: z.string(), toIndex: index },
    ({ ruleId, toIndex }) => ({ type: 'moveRule', ruleId, toIndex }),
  );

  commandTool(
    'add_example',
    'Add a concrete example (green card) under a rule. Use specific data, not an abstract restatement.',
    {
      ruleId: z.string(),
      text,
      index: index.optional().describe('Position within the rule (0-based). Omit to append.'),
    },
    ({ ruleId, text, index }) => ({ type: 'addExample', ruleId, text, index }),
  );
  commandTool(
    'update_example',
    'Reword an existing example.',
    { exampleId: z.string(), text },
    ({ exampleId, text }) => ({ type: 'updateExample', exampleId, text }),
  );
  commandTool(
    'delete_example',
    'Delete an example.',
    { exampleId: z.string() },
    ({ exampleId }) => ({ type: 'deleteExample', exampleId }),
  );
  commandTool(
    'move_example',
    'Move an example to another position or under a different rule.',
    {
      exampleId: z.string(),
      toRuleId: z.string(),
      toIndex: index.optional().describe('Position within the target rule. Omit to append.'),
    },
    ({ exampleId, toRuleId, toIndex }) => ({ type: 'moveExample', exampleId, toRuleId, toIndex }),
  );

  commandTool(
    'add_question',
    'Add an open question (red card). Use this whenever something is ambiguous, an edge case is ' +
      'unclear, or rules conflict and someone (often the product owner) must decide. Do not guess.',
    { text },
    ({ text }) => ({ type: 'addQuestion', text }),
  );
  commandTool(
    'update_question',
    'Reword an existing question.',
    { questionId: z.string(), text },
    ({ questionId, text }) => ({ type: 'updateQuestion', questionId, text }),
  );
  commandTool(
    'resolve_question',
    'Mark a question as answered, recording the answer. Usually follow up by adding or updating rules/examples.',
    { questionId: z.string(), resolution: z.string().max(TEXT_MAX_LENGTH).optional() },
    ({ questionId, resolution }) => ({ type: 'resolveQuestion', questionId, resolution }),
  );
  commandTool(
    'reopen_question',
    'Reopen a resolved question.',
    { questionId: z.string() },
    ({ questionId }) => ({ type: 'reopenQuestion', questionId }),
  );
  commandTool(
    'delete_question',
    'Delete a question.',
    { questionId: z.string() },
    ({ questionId }) => ({ type: 'deleteQuestion', questionId }),
  );

  server.registerPrompt(
    'facilitate-example-mapping',
    {
      description: 'Start an Example Mapping session facilitated by the AI.',
      argsSchema: { story: z.string().optional().describe('The user story to map.') },
    },
    ({ story }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: facilitationPrompt(story),
          },
        },
      ],
    }),
  );

  return server;
}

function facilitationPrompt(story: string | undefined): string {
  const start = story
    ? `The story to map is:\n\n"${story}"\n\nCreate a new board for it with create_board.`
    : 'Ask me which story we are mapping, or call get_board to continue the active board.';
  return `Let's run an Example Mapping session on the shared board.

${start}

Then facilitate in short rounds:
1. Propose the key rules (add_rule), each with 1–3 concrete examples.
2. Capture anything uncertain as questions (add_question) instead of assuming.
3. After each round, summarise what you added, list the open questions for me, and ask what to explore next.
4. When I answer a question, resolve it (resolve_question) and update rules/examples accordingly.
5. Check get_board hints regularly and tell me if the story or a rule looks too big.

Keep rounds small so I can follow along on the board.`;
}

function findEntity(board: Board, id: string): unknown {
  if (id === board.id) return { id, title: board.title, story: board.story };
  for (const rule of board.rules) {
    if (rule.id === id) return { id, kind: 'rule', text: rule.text };
    const example = rule.examples.find((e) => e.id === id);
    if (example) return { id, kind: 'example', ruleId: rule.id, text: example.text };
  }
  const question = board.questions.find((q) => q.id === id);
  if (question) return { kind: 'question', ...question };
  return { id };
}

function changeResult(result: ChangeResult): CallToolResult {
  if (!result.ok) return fail(result.error);
  return ok({
    boardId: result.board.id,
    version: result.board.version,
    changed: result.affectedIds.map((id) => findEntity(result.board, id)),
    ...result.history,
  });
}

function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}
