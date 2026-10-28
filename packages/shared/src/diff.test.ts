import { describe, expect, it } from 'vitest';
import { changedIds } from './diff';
import type { Board } from './schema';

const before: Board = {
  id: 'b_1',
  title: 'T',
  story: 'S',
  rules: [
    {
      id: 'r_1',
      text: 'R1',
      examples: [
        { id: 'e_1', text: 'E1' },
        { id: 'e_2', text: 'E2' },
      ],
    },
    { id: 'r_2', text: 'R2', examples: [] },
  ],
  questions: [{ id: 'q_1', text: 'Q1', status: 'open' }],
  version: 1,
  createdAt: '',
  updatedAt: '',
};

const edit = (fn: (b: Board) => void): Board => {
  const b: Board = JSON.parse(JSON.stringify(before));
  fn(b);
  return b;
};

describe('changedIds', () => {
  it('returns nothing for identical boards, ignoring version and timestamps', () => {
    expect(
      changedIds(
        before,
        edit((b) => ((b.version = 9), (b.updatedAt = 'x'))),
      ),
    ).toEqual([]);
  });

  it('reports the board id when title or story changes', () => {
    expect(
      changedIds(
        before,
        edit((b) => (b.story = 'S2')),
      ),
    ).toEqual(['b_1']);
    expect(
      changedIds(
        before,
        edit((b) => (b.title = 'T2')),
      ),
    ).toEqual(['b_1']);
  });

  it('reports new and edited cards but not removed ones', () => {
    const after = edit((b) => {
      b.rules[0]!.text = 'R1 edited';
      b.rules[0]!.examples.pop();
      b.rules[1]!.examples.push({ id: 'e_3', text: 'E3' });
      b.questions.push({ id: 'q_2', text: 'Q2', status: 'open' });
    });
    expect(changedIds(before, after)).toEqual(['r_1', 'e_3', 'q_2']);
  });

  it('reports a restored rule together with its examples', () => {
    const withoutRule = edit((b) => b.rules.shift());
    expect(changedIds(withoutRule, before)).toEqual(['r_1', 'e_1', 'e_2']);
  });

  it('reports an example moved to another rule, but not pure reordering', () => {
    expect(
      changedIds(
        before,
        edit((b) => b.rules.reverse()),
      ),
    ).toEqual([]);
    expect(
      changedIds(
        before,
        edit((b) => b.rules[0]!.examples.reverse()),
      ),
    ).toEqual([]);
    const moved = edit((b) => b.rules[1]!.examples.push(b.rules[0]!.examples.shift()!));
    expect(changedIds(before, moved)).toEqual(['e_1']);
  });

  it('reports question status and resolution changes', () => {
    expect(
      changedIds(
        before,
        edit((b) => (b.questions[0]!.status = 'resolved')),
      ),
    ).toEqual(['q_1']);
    expect(
      changedIds(
        before,
        edit((b) => (b.questions[0]!.resolution = 'A')),
      ),
    ).toEqual(['q_1']);
  });
});
