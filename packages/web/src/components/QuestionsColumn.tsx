import type { Command, Question } from '@example-map/shared';
import { AddCard } from './AddCard';
import { Card, CardAction } from './Card';
import { EditableText } from './EditableText';

type Props = {
  questions: Question[];
  send: (command: Command) => void;
  highlighted: ReadonlySet<string>;
};

export function QuestionsColumn({ questions, send, highlighted }: Props) {
  const open = questions.filter((q) => q.status === 'open');
  const resolved = questions.filter((q) => q.status === 'resolved');

  return (
    <section
      aria-label="Questions"
      className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-l border-stone-200 bg-white/60 p-4"
    >
      <h2 className="text-xs font-semibold tracking-wide text-rose-700 uppercase">
        Questions <span className="text-stone-400">({open.length})</span>
      </h2>

      {open.map((question) => (
        <Card
          key={question.id}
          variant="question"
          data-testid={question.id}
          highlighted={highlighted.has(question.id)}
          actions={
            <>
              <CardAction
                label="Resolve question"
                onClick={() => send({ type: 'resolveQuestion', questionId: question.id })}
              >
                ✓
              </CardAction>
              <CardAction
                label="Delete question"
                onClick={() => send({ type: 'deleteQuestion', questionId: question.id })}
              >
                ✕
              </CardAction>
            </>
          }
        >
          <EditableText
            label="question"
            value={question.text}
            onSave={(text) => send({ type: 'updateQuestion', questionId: question.id, text })}
            className="pr-12"
          />
        </Card>
      ))}

      <AddCard
        label="Question"
        placeholder="What is unclear?"
        onAdd={(text) => send({ type: 'addQuestion', text })}
      />

      {resolved.length > 0 && (
        <details className="mt-4" open>
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-stone-500 uppercase">
            Resolved ({resolved.length})
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {resolved.map((question) => (
              <Card
                key={question.id}
                variant="resolved"
                data-testid={question.id}
                highlighted={highlighted.has(question.id)}
                actions={
                  <>
                    <CardAction
                      label="Reopen question"
                      onClick={() => send({ type: 'reopenQuestion', questionId: question.id })}
                    >
                      ↺
                    </CardAction>
                    <CardAction
                      label="Delete question"
                      onClick={() => send({ type: 'deleteQuestion', questionId: question.id })}
                    >
                      ✕
                    </CardAction>
                  </>
                }
              >
                <p className="p-1 pr-12 line-through">{question.text}</p>
                <EditableText
                  label="resolution"
                  value={question.resolution ?? ''}
                  allowEmpty
                  placeholder="Add the answer…"
                  onSave={(resolution) =>
                    send({ type: 'resolveQuestion', questionId: question.id, resolution })
                  }
                  className="text-stone-700"
                />
              </Card>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
