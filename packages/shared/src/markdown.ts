import type { Board } from './schema';

export function exportMarkdown(board: Board): string {
  const lines: string[] = [
    `# ${board.title}`,
    '',
    '## Story',
    '',
    board.story || '_(empty)_',
    '',
    '## Rules',
    '',
  ];

  if (board.rules.length === 0) lines.push('_(none)_', '');
  board.rules.forEach((rule, i) => {
    lines.push(`### ${i + 1}. ${rule.text}`, '');
    if (rule.examples.length === 0) lines.push('_(no examples)_');
    for (const example of rule.examples) lines.push(`- ${example.text}`);
    lines.push('');
  });

  lines.push('## Questions', '');
  if (board.questions.length === 0) lines.push('_(none)_', '');
  for (const question of board.questions) {
    if (question.status === 'open') {
      lines.push(`- [ ] ${question.text}`);
    } else {
      lines.push(`- [x] ${question.text}${question.resolution ? ` — ${question.resolution}` : ''}`);
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}
