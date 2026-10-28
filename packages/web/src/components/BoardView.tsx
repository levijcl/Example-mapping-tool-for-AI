import { useState, type ReactNode } from 'react';
import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
} from '@dnd-kit/core';
import { horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import type { Board, Command, HistoryState } from '@example-map/shared';
import { dropToCommand, isExampleId, isRuleId } from '../dnd';
import { AddCard } from './AddCard';
import { Card } from './Card';
import { EditableText } from './EditableText';
import { QuestionsColumn } from './QuestionsColumn';
import { RuleColumn } from './RuleColumn';

type Props = {
  board: Board;
  send: (command: Command) => void;
  highlighted: ReadonlySet<string>;
  history: HistoryState;
  onUndo: () => void;
  onRedo: () => void;
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl+';

/** Rules only collide with rules; examples prefer the example under the pointer, then a rule column. */
const collisionDetection: CollisionDetection = (args) => {
  const activeId = String(args.active.id);
  if (isRuleId(activeId)) {
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((c) => isRuleId(String(c.id))),
    });
  }
  const hits = pointerWithin(args);
  const exampleHit = hits.find((c) => isExampleId(String(c.id)));
  if (exampleHit) return [exampleHit];
  const ruleHit = hits.find((c) => isRuleId(String(c.id)));
  if (ruleHit) return [ruleHit];
  return closestCorners(args);
};

export function BoardView({ board, send, highlighted, history, onUndo, onRedo }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const dragged = activeId ? findCardText(board, activeId) : null;

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex flex-col gap-3 border-b border-stone-200 px-6 py-4">
          <div className="flex items-start gap-4">
            <EditableText
              label="board title"
              value={board.title}
              onSave={(title) => send({ type: 'setTitle', title })}
              className={`min-w-0 flex-1 text-xl font-semibold ${highlighted.has(board.id) ? 'ai-highlight' : ''}`}
            />
            <div className="flex shrink-0 gap-1">
              <HistoryButton
                label="Undo"
                shortcut={`${MOD}Z`}
                disabled={!history.canUndo}
                onClick={onUndo}
              >
                ↶ Undo
              </HistoryButton>
              <HistoryButton
                label="Redo"
                shortcut={`${MOD}⇧Z`}
                disabled={!history.canRedo}
                onClick={onRedo}
              >
                ↷ Redo
              </HistoryButton>
            </div>
          </div>
          <Card
            variant="story"
            data-testid="story"
            highlighted={highlighted.has(board.id)}
            className="max-w-3xl"
          >
            <div className="mb-1 text-xs font-semibold tracking-wide text-amber-800 uppercase">
              Story
            </div>
            <EditableText
              label="story"
              value={board.story}
              allowEmpty
              placeholder="As a … I want … so that …"
              onSave={(text) => send({ type: 'setStory', text })}
            />
          </Card>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={({ active }) => setActiveId(String(active.id))}
          onDragCancel={() => setActiveId(null)}
          onDragEnd={({ active, over }) => {
            setActiveId(null);
            const command = dropToCommand(board, String(active.id), over ? String(over.id) : null);
            if (command) send(command);
          }}
        >
          <div className="flex flex-1 items-start gap-2 overflow-auto p-4" aria-label="Rules">
            <SortableContext
              items={board.rules.map((r) => r.id)}
              strategy={horizontalListSortingStrategy}
            >
              {board.rules.map((rule) => (
                <RuleColumn key={rule.id} rule={rule} send={send} highlighted={highlighted} />
              ))}
            </SortableContext>
            <div className="w-64 shrink-0 p-2">
              <AddCard
                label="Rule"
                placeholder="A business rule…"
                onAdd={(text) => send({ type: 'addRule', text })}
                className="border-sky-300"
              />
            </div>
          </div>
          <DragOverlay>
            {dragged && (
              <Card
                variant={isRuleId(activeId!) ? 'rule' : 'example'}
                className="w-60 rotate-1 shadow-lg"
              >
                <div className="p-1 whitespace-pre-wrap">{dragged}</div>
              </Card>
            )}
          </DragOverlay>
        </DndContext>
      </div>

      <QuestionsColumn questions={board.questions} send={send} highlighted={highlighted} />
    </div>
  );
}

function HistoryButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={`${label} (${shortcut})`}
      disabled={disabled}
      onClick={onClick}
      className="rounded-md border border-stone-300 bg-white px-2.5 py-1 text-sm text-stone-700 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white"
    >
      {children}
    </button>
  );
}

function findCardText(board: Board, id: string): string | null {
  for (const rule of board.rules) {
    if (rule.id === id) return rule.text;
    const example = rule.examples.find((e) => e.id === id);
    if (example) return example.text;
  }
  return null;
}
