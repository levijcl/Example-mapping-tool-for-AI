import { describe, expect, it } from 'vitest';
import { applyCommand, type Board } from '@example-map/shared';
import { dropToCommand } from './dnd';

const board: Board = {
  id: 'b_1',
  title: 'T',
  story: '',
  rules: [
    {
      id: 'r_a',
      text: 'A',
      examples: [
        { id: 'e_1', text: '1' },
        { id: 'e_2', text: '2' },
        { id: 'e_3', text: '3' },
      ],
    },
    { id: 'r_b', text: 'B', examples: [{ id: 'e_4', text: '4' }] },
    { id: 'r_c', text: 'C', examples: [] },
  ],
  questions: [],
  version: 0,
  createdAt: '',
  updatedAt: '',
};

function layout(command: ReturnType<typeof dropToCommand>) {
  const result = applyCommand(board, command);
  if (!result.ok) throw new Error(result.error);
  return result.board.rules.map((r) => `${r.id}:${r.examples.map((e) => e.id).join(',')}`);
}

describe('dropToCommand', () => {
  it('ignores drops on nothing or on itself', () => {
    expect(dropToCommand(board, 'e_1', null)).toBeNull();
    expect(dropToCommand(board, 'e_1', 'e_1')).toBeNull();
    expect(dropToCommand(board, 'r_a', 'r_a')).toBeNull();
  });

  it('reorders rules, including when dropped on an example of another rule', () => {
    expect(dropToCommand(board, 'r_a', 'r_c')).toEqual({
      type: 'moveRule',
      ruleId: 'r_a',
      toIndex: 2,
    });
    expect(dropToCommand(board, 'r_c', 'e_1')).toEqual({
      type: 'moveRule',
      ruleId: 'r_c',
      toIndex: 0,
    });
    expect(dropToCommand(board, 'r_a', 'e_2')).toBeNull();
  });

  it('reorders examples within a rule in both directions', () => {
    expect(layout(dropToCommand(board, 'e_1', 'e_3'))[0]).toBe('r_a:e_2,e_3,e_1');
    expect(layout(dropToCommand(board, 'e_3', 'e_1'))[0]).toBe('r_a:e_3,e_1,e_2');
  });

  it('moves an example before the example it is dropped on in another rule', () => {
    expect(layout(dropToCommand(board, 'e_2', 'e_4'))).toEqual([
      'r_a:e_1,e_3',
      'r_b:e_2,e_4',
      'r_c:',
    ]);
  });

  it('appends an example dropped on another rule column, including an empty one', () => {
    expect(layout(dropToCommand(board, 'e_1', 'r_c'))).toEqual([
      'r_a:e_2,e_3',
      'r_b:e_4',
      'r_c:e_1',
    ]);
    expect(dropToCommand(board, 'e_1', 'r_a')).toBeNull();
  });
});
