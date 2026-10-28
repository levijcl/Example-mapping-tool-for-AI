import { beforeEach, describe, expect, it } from 'vitest';
import { applyCommand, createBoard, type ApplyOptions } from './commands';
import type { Board } from './schema';

let counter = 0;
const options: ApplyOptions = {
  now: () => '2026-10-28T00:00:00.000Z',
  newId: (prefix) => `${prefix}_${++counter}`,
};

beforeEach(() => {
  counter = 0;
});

function apply(board: Board, command: unknown): Board {
  const result = applyCommand(board, command, options);
  if (!result.ok) throw new Error(result.error);
  return result.board;
}

function expectError(board: Board, command: unknown, message: string | RegExp) {
  const result = applyCommand(board, command, options);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toMatch(message);
}

/** Board with rules r_2 [e_3, e_4] and r_5 [e_6], question q_7. */
function seeded(): Board {
  counter = 0;
  let board = createBoard('Coupons', 'Pay with coupon', options);
  board = apply(board, {
    type: 'addRule',
    text: 'Min spend $1000',
    examples: ['$900 → rejected', '$1000 → ok'],
  });
  board = apply(board, {
    type: 'addRule',
    text: 'One coupon per order',
    examples: ['two coupons → rejected'],
  });
  board = apply(board, { type: 'addQuestion', text: 'Does tax count?' });
  return board;
}

describe('createBoard', () => {
  it('creates an empty board at version 0', () => {
    expect(createBoard(' Coupons ', '', options)).toEqual({
      id: 'b_1',
      title: 'Coupons',
      story: '',
      rules: [],
      questions: [],
      version: 0,
      createdAt: '2026-10-28T00:00:00.000Z',
      updatedAt: '2026-10-28T00:00:00.000Z',
    });
  });
});

describe('applyCommand', () => {
  it('does not mutate the input board and bumps version', () => {
    const board = seeded();
    const before = JSON.parse(JSON.stringify(board));
    const result = applyCommand(board, { type: 'setTitle', title: 'New' }, options);
    expect(board).toEqual(before);
    expect(result.ok && result.board.version).toBe(board.version + 1);
  });

  it('rejects unknown command types', () => {
    expectError(seeded(), { type: 'explode' }, /Invalid command/);
  });

  it('rejects empty and too-long text, and trims text', () => {
    expectError(seeded(), { type: 'addQuestion', text: '   ' }, /Invalid command: text/);
    expectError(seeded(), { type: 'addQuestion', text: 'x'.repeat(501) }, /Invalid command: text/);
    const board = apply(seeded(), { type: 'addQuestion', text: '  why?  ' });
    expect(board.questions.at(-1)?.text).toBe('why?');
  });

  describe('title and story', () => {
    it('setTitle', () => {
      expect(apply(seeded(), { type: 'setTitle', title: 'Renamed' }).title).toBe('Renamed');
    });

    it('setStory allows empty text', () => {
      expect(apply(seeded(), { type: 'setStory', text: '' }).story).toBe('');
    });
  });

  describe('rules', () => {
    it('addRule appends with examples and reports affected ids', () => {
      const result = applyCommand(
        seeded(),
        { type: 'addRule', text: 'New rule', examples: ['a', 'b'] },
        options,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.board.rules.at(-1)).toEqual({
        id: 'r_8',
        text: 'New rule',
        examples: [
          { id: 'e_9', text: 'a' },
          { id: 'e_10', text: 'b' },
        ],
      });
      expect(result.affectedIds).toEqual(['r_8', 'e_9', 'e_10']);
    });

    it('addRule inserts at index and rejects out-of-range index', () => {
      const board = apply(seeded(), { type: 'addRule', text: 'First', index: 0 });
      expect(board.rules.map((r) => r.text)).toEqual([
        'First',
        'Min spend $1000',
        'One coupon per order',
      ]);
      expectError(
        seeded(),
        { type: 'addRule', text: 'x', index: 3 },
        'Rule index 3 is out of range (0..2).',
      );
    });

    it('updateRule', () => {
      expect(
        apply(seeded(), { type: 'updateRule', ruleId: 'r_2', text: 'Min $500' }).rules[0]?.text,
      ).toBe('Min $500');
    });

    it('deleteRule removes the rule and its examples', () => {
      const board = apply(seeded(), { type: 'deleteRule', ruleId: 'r_2' });
      expect(board.rules.map((r) => r.id)).toEqual(['r_5']);
      expectError(
        board,
        { type: 'updateExample', exampleId: 'e_3', text: 'x' },
        'Example e_3 not found',
      );
    });

    it('moveRule', () => {
      expect(
        apply(seeded(), { type: 'moveRule', ruleId: 'r_2', toIndex: 1 }).rules.map((r) => r.id),
      ).toEqual(['r_5', 'r_2']);
      expectError(
        seeded(),
        { type: 'moveRule', ruleId: 'r_2', toIndex: 2 },
        /out of range \(0\.\.1\)/,
      );
    });

    it.each([
      { type: 'updateRule', ruleId: 'r_x', text: 'x' },
      { type: 'deleteRule', ruleId: 'r_x' },
      { type: 'moveRule', ruleId: 'r_x', toIndex: 0 },
      { type: 'addExample', ruleId: 'r_x', text: 'x' },
    ])('$type reports a missing rule', (command) => {
      expectError(seeded(), command, 'Rule r_x not found. Call get_board to refresh.');
    });
  });

  describe('examples', () => {
    it('addExample appends or inserts at index', () => {
      let board = apply(seeded(), { type: 'addExample', ruleId: 'r_5', text: 'last' });
      board = apply(board, { type: 'addExample', ruleId: 'r_5', text: 'first', index: 0 });
      expect(board.rules[1]?.examples.map((e) => e.text)).toEqual([
        'first',
        'two coupons → rejected',
        'last',
      ]);
      expectError(
        seeded(),
        { type: 'addExample', ruleId: 'r_5', text: 'x', index: 5 },
        /out of range/,
      );
    });

    it('updateExample', () => {
      expect(
        apply(seeded(), { type: 'updateExample', exampleId: 'e_4', text: '$1000 → accepted' })
          .rules[0]?.examples[1],
      ).toEqual({ id: 'e_4', text: '$1000 → accepted' });
    });

    it('deleteExample', () => {
      expect(
        apply(seeded(), { type: 'deleteExample', exampleId: 'e_3' }).rules[0]?.examples.map(
          (e) => e.id,
        ),
      ).toEqual(['e_4']);
    });

    it('moveExample within the same rule', () => {
      const board = apply(seeded(), {
        type: 'moveExample',
        exampleId: 'e_3',
        toRuleId: 'r_2',
        toIndex: 1,
      });
      expect(board.rules[0]?.examples.map((e) => e.id)).toEqual(['e_4', 'e_3']);
    });

    it('moveExample across rules, appending when toIndex is omitted', () => {
      let board = apply(seeded(), { type: 'moveExample', exampleId: 'e_3', toRuleId: 'r_5' });
      expect(board.rules[0]?.examples.map((e) => e.id)).toEqual(['e_4']);
      expect(board.rules[1]?.examples.map((e) => e.id)).toEqual(['e_6', 'e_3']);
      board = apply(board, { type: 'moveExample', exampleId: 'e_4', toRuleId: 'r_5', toIndex: 0 });
      expect(board.rules[1]?.examples.map((e) => e.id)).toEqual(['e_4', 'e_6', 'e_3']);
    });

    it('moveExample rejects a missing target rule or out-of-range index', () => {
      expectError(
        seeded(),
        { type: 'moveExample', exampleId: 'e_3', toRuleId: 'r_x' },
        'Rule r_x not found',
      );
      expectError(
        seeded(),
        { type: 'moveExample', exampleId: 'e_3', toRuleId: 'r_5', toIndex: 2 },
        /out of range \(0\.\.1\)/,
      );
    });

    it.each([
      { type: 'updateExample', exampleId: 'e_x', text: 'x' },
      { type: 'deleteExample', exampleId: 'e_x' },
      { type: 'moveExample', exampleId: 'e_x', toRuleId: 'r_2' },
    ])('$type reports a missing example', (command) => {
      expectError(seeded(), command, 'Example e_x not found. Call get_board to refresh.');
    });
  });

  describe('questions', () => {
    it('addQuestion creates an open question', () => {
      expect(apply(seeded(), { type: 'addQuestion', text: 'Expiry?' }).questions.at(-1)).toEqual({
        id: 'q_8',
        text: 'Expiry?',
        status: 'open',
      });
    });

    it('updateQuestion', () => {
      expect(
        apply(seeded(), { type: 'updateQuestion', questionId: 'q_7', text: 'Tax?' }).questions[0]
          ?.text,
      ).toBe('Tax?');
    });

    it('resolveQuestion with and without resolution, and re-resolving updates it', () => {
      let board = apply(seeded(), {
        type: 'resolveQuestion',
        questionId: 'q_7',
        resolution: 'No, pre-tax',
      });
      expect(board.questions[0]).toMatchObject({ status: 'resolved', resolution: 'No, pre-tax' });
      board = apply(board, { type: 'resolveQuestion', questionId: 'q_7' });
      expect(board.questions[0]).toEqual({
        id: 'q_7',
        text: 'Does tax count?',
        status: 'resolved',
      });
    });

    it('reopenQuestion clears the resolution', () => {
      let board = apply(seeded(), { type: 'resolveQuestion', questionId: 'q_7', resolution: 'No' });
      board = apply(board, { type: 'reopenQuestion', questionId: 'q_7' });
      expect(board.questions[0]).toEqual({ id: 'q_7', text: 'Does tax count?', status: 'open' });
    });

    it('deleteQuestion', () => {
      expect(apply(seeded(), { type: 'deleteQuestion', questionId: 'q_7' }).questions).toEqual([]);
    });

    it.each([
      { type: 'updateQuestion', questionId: 'q_x', text: 'x' },
      { type: 'resolveQuestion', questionId: 'q_x' },
      { type: 'reopenQuestion', questionId: 'q_x' },
      { type: 'deleteQuestion', questionId: 'q_x' },
    ])('$type reports a missing question', (command) => {
      expectError(seeded(), command, 'Question q_x not found. Call get_board to refresh.');
    });
  });
});
