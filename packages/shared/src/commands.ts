import { newId as defaultNewId, type IdPrefix } from './ids';
import {
  CommandSchema,
  formatZodError,
  type Board,
  type Command,
  type Example,
  type Rule,
} from './schema';

export type ApplyOptions = {
  now?: () => string;
  newId?: (prefix: IdPrefix) => string;
};

export type ApplyResult =
  | {
      ok: true;
      board: Board;
      command: Command;
      /** IDs of entities created or changed by the command (not deleted ones). */
      affectedIds: string[];
    }
  | { ok: false; error: string };

class CommandError extends Error {}

const REFRESH_HINT = 'Call get_board to refresh.';

export function createBoard(title: string, story = '', options: ApplyOptions = {}): Board {
  const now = (options.now ?? defaultNow)();
  return {
    id: (options.newId ?? defaultNewId)('b'),
    title: title.trim(),
    story: story.trim(),
    rules: [],
    questions: [],
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function applyCommand(
  board: Board,
  input: unknown,
  options: ApplyOptions = {},
): ApplyResult {
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: `Invalid command: ${formatZodError(parsed.error)}` };

  const command = parsed.data;
  const next: Board = JSON.parse(JSON.stringify(board));
  const newId = options.newId ?? defaultNewId;
  try {
    const affectedIds = mutate(next, command, newId);
    next.version = board.version + 1;
    next.updatedAt = (options.now ?? defaultNow)();
    return { ok: true, board: next, command, affectedIds };
  } catch (error) {
    if (error instanceof CommandError) return { ok: false, error: error.message };
    throw error;
  }
}

function mutate(board: Board, command: Command, newId: (prefix: IdPrefix) => string): string[] {
  switch (command.type) {
    case 'setTitle':
      board.title = command.title;
      return [board.id];
    case 'setStory':
      board.story = command.text;
      return [board.id];

    case 'addRule': {
      const rule: Rule = {
        id: newId('r'),
        text: command.text,
        examples: (command.examples ?? []).map((text) => ({ id: newId('e'), text })),
      };
      insertAt(board.rules, rule, command.index, 'Rule index');
      return [rule.id, ...rule.examples.map((e) => e.id)];
    }
    case 'updateRule': {
      const rule = findRule(board, command.ruleId);
      rule.text = command.text;
      return [rule.id];
    }
    case 'deleteRule': {
      board.rules.splice(ruleIndex(board, command.ruleId), 1);
      return [];
    }
    case 'moveRule': {
      const [rule] = board.rules.splice(ruleIndex(board, command.ruleId), 1);
      insertAt(board.rules, rule!, command.toIndex, 'Rule toIndex');
      return [command.ruleId];
    }

    case 'addExample': {
      const rule = findRule(board, command.ruleId);
      const example: Example = { id: newId('e'), text: command.text };
      insertAt(rule.examples, example, command.index, 'Example index');
      return [example.id];
    }
    case 'updateExample': {
      const { rule, index } = findExample(board, command.exampleId);
      rule.examples[index]!.text = command.text;
      return [command.exampleId];
    }
    case 'deleteExample': {
      const { rule, index } = findExample(board, command.exampleId);
      rule.examples.splice(index, 1);
      return [];
    }
    case 'moveExample': {
      const target = findRule(board, command.toRuleId);
      const { rule, index } = findExample(board, command.exampleId);
      const [example] = rule.examples.splice(index, 1);
      insertAt(target.examples, example!, command.toIndex, 'Example toIndex');
      return [command.exampleId];
    }

    case 'addQuestion': {
      const id = newId('q');
      board.questions.push({ id, text: command.text, status: 'open' });
      return [id];
    }
    case 'updateQuestion': {
      findQuestion(board, command.questionId).text = command.text;
      return [command.questionId];
    }
    case 'resolveQuestion': {
      const question = findQuestion(board, command.questionId);
      question.status = 'resolved';
      if (command.resolution) question.resolution = command.resolution;
      else delete question.resolution;
      return [command.questionId];
    }
    case 'reopenQuestion': {
      const question = findQuestion(board, command.questionId);
      question.status = 'open';
      delete question.resolution;
      return [command.questionId];
    }
    case 'deleteQuestion': {
      const index = board.questions.findIndex((q) => q.id === command.questionId);
      if (index === -1) throw notFound('Question', command.questionId);
      board.questions.splice(index, 1);
      return [];
    }
  }
}

/** Inserts at `index`, or appends when omitted. Valid range is 0..array.length. */
function insertAt<T>(array: T[], item: T, index: number | undefined, label: string): void {
  if (index === undefined) {
    array.push(item);
    return;
  }
  if (index > array.length) {
    throw new CommandError(`${label} ${index} is out of range (0..${array.length}).`);
  }
  array.splice(index, 0, item);
}

function ruleIndex(board: Board, ruleId: string): number {
  const index = board.rules.findIndex((r) => r.id === ruleId);
  if (index === -1) throw notFound('Rule', ruleId);
  return index;
}

function findRule(board: Board, ruleId: string): Rule {
  return board.rules[ruleIndex(board, ruleId)]!;
}

function findExample(board: Board, exampleId: string): { rule: Rule; index: number } {
  for (const rule of board.rules) {
    const index = rule.examples.findIndex((e) => e.id === exampleId);
    if (index !== -1) return { rule, index };
  }
  throw notFound('Example', exampleId);
}

function findQuestion(board: Board, questionId: string) {
  const question = board.questions.find((q) => q.id === questionId);
  if (!question) throw notFound('Question', questionId);
  return question;
}

function notFound(kind: string, id: string): CommandError {
  return new CommandError(`${kind} ${id} not found. ${REFRESH_HINT}`);
}

function defaultNow(): string {
  return new Date().toISOString();
}
