import { describe, expect, it } from 'vitest';
import { analyzeBoard, HINT_THRESHOLDS } from './analyze';
import type { Board, Question, Rule } from './schema';

function board(overrides: Partial<Board> = {}): Board {
  return {
    id: 'b_1',
    title: 'T',
    story: 'A story',
    rules: [rule('r_1', 1)],
    questions: [],
    version: 0,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

function rule(id: string, exampleCount: number): Rule {
  return {
    id,
    text: id,
    examples: Array.from({ length: exampleCount }, (_, i) => ({ id: `${id}_e${i}`, text: 'e' })),
  };
}

function questions(count: number, status: Question['status'] = 'open'): Question[] {
  return Array.from({ length: count }, (_, i) => ({ id: `q_${i}`, text: 'q', status }));
}

const codes = (b: Board) => analyzeBoard(b).map((h) => h.code);

describe('analyzeBoard', () => {
  it('returns no hints for a healthy board', () => {
    expect(analyzeBoard(board())).toEqual([]);
  });

  it('flags an empty story', () => {
    expect(codes(board({ story: '' }))).toEqual(['empty-story']);
  });

  it('flags a board without rules', () => {
    expect(codes(board({ rules: [] }))).toEqual(['no-rules']);
  });

  it('flags a rule without examples, with its id', () => {
    expect(analyzeBoard(board({ rules: [rule('r_1', 1), rule('r_2', 0)] }))).toEqual([
      { code: 'rule-without-examples', message: expect.stringContaining('r_2'), targetId: 'r_2' },
    ]);
  });

  it('flags a rule only when examples exceed the threshold', () => {
    const max = HINT_THRESHOLDS.maxExamplesPerRule;
    expect(codes(board({ rules: [rule('r_1', max)] }))).toEqual([]);
    expect(codes(board({ rules: [rule('r_1', max + 1)] }))).toEqual(['rule-too-many-examples']);
  });

  it('flags too many rules only above the threshold', () => {
    const max = HINT_THRESHOLDS.maxRules;
    const rules = (n: number) => Array.from({ length: n }, (_, i) => rule(`r_${i}`, 1));
    expect(codes(board({ rules: rules(max) }))).toEqual([]);
    expect(codes(board({ rules: rules(max + 1) }))).toEqual(['too-many-rules']);
  });

  it('counts only open questions against the threshold', () => {
    const max = HINT_THRESHOLDS.maxOpenQuestions;
    expect(codes(board({ questions: [...questions(max), ...questions(3, 'resolved')] }))).toEqual(
      [],
    );
    expect(codes(board({ questions: questions(max + 1) }))).toEqual(['too-many-open-questions']);
  });
});
