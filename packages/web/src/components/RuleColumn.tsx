import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Command, Example, Rule } from '@example-map/shared';
import { AddCard } from './AddCard';
import { Card, CardAction } from './Card';
import { EditableText } from './EditableText';

type Props = {
  rule: Rule;
  send: (command: Command) => void;
  highlighted: ReadonlySet<string>;
};

export function RuleColumn({ rule, send, highlighted }: Props) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging, isOver, active } =
    useSortable({ id: rule.id });
  const exampleDropTarget = isOver && active !== null && String(active.id).startsWith('e_');

  const deleteRule = () => {
    const message = `Delete this rule and its ${rule.examples.length} example(s)?`;
    if (rule.examples.length === 0 || window.confirm(message))
      send({ type: 'deleteRule', ruleId: rule.id });
  };

  return (
    <section
      ref={setNodeRef}
      aria-label={`Rule: ${rule.text}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`flex w-64 shrink-0 flex-col gap-2 rounded-lg p-2 transition-colors ${
        isDragging ? 'opacity-40' : ''
      } ${exampleDropTarget ? 'bg-emerald-100/60' : ''}`}
    >
      <Card
        variant="rule"
        data-testid={rule.id}
        highlighted={highlighted.has(rule.id)}
        className="cursor-grab font-medium active:cursor-grabbing"
        {...attributes}
        {...listeners}
        actions={
          <CardAction label="Delete rule" onClick={deleteRule}>
            ✕
          </CardAction>
        }
      >
        <EditableText
          label="rule"
          value={rule.text}
          onSave={(text) => send({ type: 'updateRule', ruleId: rule.id, text })}
          className="pr-6"
        />
      </Card>

      <SortableContext
        items={rule.examples.map((e) => e.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex min-h-8 flex-col gap-2 pl-3">
          {rule.examples.map((example) => (
            <ExampleCard
              key={example.id}
              example={example}
              send={send}
              highlighted={highlighted.has(example.id)}
            />
          ))}
          <AddCard
            label="Example"
            placeholder="A concrete scenario…"
            onAdd={(text) => send({ type: 'addExample', ruleId: rule.id, text })}
          />
        </div>
      </SortableContext>
    </section>
  );
}

function ExampleCard({
  example,
  send,
  highlighted,
}: {
  example: Example;
  send: (command: Command) => void;
  highlighted: boolean;
}) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: example.id,
  });

  return (
    <Card
      ref={setNodeRef}
      variant="example"
      data-testid={example.id}
      highlighted={highlighted}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`cursor-grab active:cursor-grabbing ${isDragging ? 'opacity-40' : ''}`}
      {...attributes}
      {...listeners}
      actions={
        <CardAction
          label="Delete example"
          onClick={() => send({ type: 'deleteExample', exampleId: example.id })}
        >
          ✕
        </CardAction>
      }
    >
      <EditableText
        label="example"
        value={example.text}
        onSave={(text) => send({ type: 'updateExample', exampleId: example.id, text })}
        className="pr-6"
      />
    </Card>
  );
}
