import type { Board, Command } from '@example-map/shared';

export const isRuleId = (id: string) => id.startsWith('r_');
export const isExampleId = (id: string) => id.startsWith('e_');

function ruleOfExample(board: Board, exampleId: string) {
  return board.rules.find((rule) => rule.examples.some((e) => e.id === exampleId));
}

/**
 * Maps a drag-and-drop gesture to a board command, or null for a no-op.
 * Rules can be dropped on rules (or examples inside them); examples can be dropped
 * on other examples (taking their position) or on a rule column (appended).
 */
export function dropToCommand(
  board: Board,
  activeId: string,
  overId: string | null,
): Command | null {
  if (!overId || activeId === overId) return null;

  if (isRuleId(activeId)) {
    const targetRuleId = isRuleId(overId) ? overId : ruleOfExample(board, overId)?.id;
    if (!targetRuleId || targetRuleId === activeId) return null;
    const toIndex = board.rules.findIndex((r) => r.id === targetRuleId);
    return { type: 'moveRule', ruleId: activeId, toIndex };
  }

  if (isExampleId(activeId)) {
    const sourceRule = ruleOfExample(board, activeId);
    if (!sourceRule) return null;

    if (isRuleId(overId)) {
      if (overId === sourceRule.id) return null;
      return { type: 'moveExample', exampleId: activeId, toRuleId: overId };
    }

    const targetRule = ruleOfExample(board, overId);
    if (!targetRule) return null;
    const toIndex = targetRule.examples.findIndex((e) => e.id === overId);
    return { type: 'moveExample', exampleId: activeId, toRuleId: targetRule.id, toIndex };
  }

  return null;
}
