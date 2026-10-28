import type { BoardSummary } from '@example-map/shared';
import { AddCard } from './AddCard';

type Props = {
  boards: BoardSummary[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onCreate: (title: string) => void;
  onDelete: (board: BoardSummary) => void;
};

export function Sidebar({ boards, currentId, onSelect, onCreate, onDelete }: Props) {
  return (
    <nav
      aria-label="Boards"
      className="flex w-60 shrink-0 flex-col gap-1 border-r border-stone-200 bg-white p-3"
    >
      <h1 className="mb-2 px-2 text-sm font-bold tracking-wide text-stone-700">Example Map</h1>
      <ul className="flex flex-col gap-0.5">
        {boards.map((board) => (
          <li key={board.id} className="group relative">
            <button
              type="button"
              aria-current={board.id === currentId ? 'page' : undefined}
              onClick={() => onSelect(board.id)}
              className={`w-full rounded-md px-2 py-1.5 pr-7 text-left text-sm ${
                board.id === currentId
                  ? 'bg-stone-200 font-medium text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              <span className="block truncate">{board.title}</span>
              <span className="text-xs text-stone-400">
                {plural(board.ruleCount, 'rule')} ·{' '}
                {plural(board.openQuestionCount, 'open question')}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Delete board ${board.title}`}
              onClick={() => onDelete(board)}
              className="absolute top-1.5 right-1 rounded px-1.5 text-xs text-stone-400 opacity-0 group-hover:opacity-100 hover:bg-stone-200 hover:text-stone-700 focus:opacity-100"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <AddCard label="New board" placeholder="Board title" onAdd={onCreate} />
      </div>
    </nav>
  );
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
