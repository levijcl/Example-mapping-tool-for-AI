import type { Board } from './schema';

export const HINT_THRESHOLDS = {
  /** More examples than this suggests the rule is too broad. */
  maxExamplesPerRule: 6,
  /** More rules than this suggests the story is too big. */
  maxRules: 8,
  /** More open questions than this suggests the story is not ready. */
  maxOpenQuestions: 5,
} as const;

export type HintCode =
  | 'empty-story'
  | 'no-rules'
  | 'rule-without-examples'
  | 'rule-too-many-examples'
  | 'too-many-rules'
  | 'too-many-open-questions';

export type Hint = {
  code: HintCode;
  message: string;
  targetId?: string;
};

export function analyzeBoard(board: Board): Hint[] {
  const hints: Hint[] = [];
  const { maxExamplesPerRule, maxRules, maxOpenQuestions } = HINT_THRESHOLDS;

  if (!board.story) {
    hints.push({
      code: 'empty-story',
      message: 'The story is empty. Clarify the user story first.',
    });
  }
  if (board.rules.length === 0) {
    hints.push({ code: 'no-rules', message: 'No rules yet. Start identifying acceptance rules.' });
  }
  for (const rule of board.rules) {
    if (rule.examples.length === 0) {
      hints.push({
        code: 'rule-without-examples',
        message: `Rule ${rule.id} has no examples. Add concrete examples to illustrate it.`,
        targetId: rule.id,
      });
    } else if (rule.examples.length > maxExamplesPerRule) {
      hints.push({
        code: 'rule-too-many-examples',
        message: `Rule ${rule.id} has ${rule.examples.length} examples. It may be too broad; consider splitting it.`,
        targetId: rule.id,
      });
    }
  }
  if (board.rules.length > maxRules) {
    hints.push({
      code: 'too-many-rules',
      message: `The board has ${board.rules.length} rules. The story may be too big; consider splitting it.`,
    });
  }
  const openQuestions = board.questions.filter((q) => q.status === 'open').length;
  if (openQuestions > maxOpenQuestions) {
    hints.push({
      code: 'too-many-open-questions',
      message: `There are ${openQuestions} open questions. The story may not be ready for development.`,
    });
  }
  return hints;
}
