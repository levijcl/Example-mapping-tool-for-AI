import type { Board } from './schema';

/**
 * IDs of cards whose content changed or that are new in `after` (removed cards are not listed).
 * The board's own ID is included when the title or story changed. Pure reordering within the
 * same rule or list is not considered a change; moving an example to another rule is.
 */
export function changedIds(before: Board, after: Board): string[] {
  const ids: string[] = [];
  if (before.title !== after.title || before.story !== after.story) ids.push(after.id);

  const beforeRules = new Map(before.rules.map((r) => [r.id, r]));
  const beforeExamples = new Map(
    before.rules.flatMap((r) =>
      r.examples.map((e) => [e.id, { text: e.text, ruleId: r.id }] as const),
    ),
  );
  for (const rule of after.rules) {
    if (beforeRules.get(rule.id)?.text !== rule.text) ids.push(rule.id);
    for (const example of rule.examples) {
      const old = beforeExamples.get(example.id);
      if (old?.text !== example.text || old.ruleId !== rule.id) ids.push(example.id);
    }
  }

  const beforeQuestions = new Map(before.questions.map((q) => [q.id, q]));
  for (const question of after.questions) {
    const old = beforeQuestions.get(question.id);
    if (
      old?.text !== question.text ||
      old.status !== question.status ||
      old.resolution !== question.resolution
    ) {
      ids.push(question.id);
    }
  }
  return ids;
}
