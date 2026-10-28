import { useCallback, useEffect, useState } from 'react';
import type { BoardSummary } from '@example-map/shared';
import { api } from './api';
import { BoardView } from './components/BoardView';
import { Sidebar } from './components/Sidebar';
import { useBoardSocket } from './useBoardSocket';
import { useHighlights } from './useHighlights';

const ERROR_TIMEOUT_MS = 5000;

export function App() {
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { highlighted, flash } = useHighlights();

  const refreshBoards = useCallback(async () => {
    try {
      const { boards, activeBoardId } = await api.listBoards();
      setBoards(boards);
      setCurrentId((current) =>
        current && boards.some((b) => b.id === current)
          ? current
          : (activeBoardId ?? boards[0]?.id ?? null),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const { status, board, send } = useBoardSocket(currentId, {
    onBoardsChanged: () => void refreshBoards(),
    // Follow the AI when it creates or opens a board; ignore our own (human) navigation.
    onActiveChanged: (boardId, actor) => {
      if (actor === 'ai' && boardId) setCurrentId(boardId);
    },
    onAiChange: flash,
    onError: setError,
  });

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), ERROR_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [error]);

  const createBoard = async (title: string) => {
    try {
      const board = await api.createBoard(title);
      setCurrentId(board.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const deleteBoard = async (target: BoardSummary) => {
    if (!window.confirm(`Delete board "${target.title}"? This cannot be undone.`)) return;
    try {
      await api.deleteBoard(target.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="flex h-screen bg-stone-50 text-stone-800">
      <Sidebar
        boards={boards}
        currentId={currentId}
        onSelect={setCurrentId}
        onCreate={(title) => void createBoard(title)}
        onDelete={(b) => void deleteBoard(b)}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {status !== 'open' && (
          <div
            role="status"
            className="bg-amber-100 px-4 py-1.5 text-center text-sm text-amber-900"
          >
            {status === 'connecting'
              ? 'Connecting to server…'
              : 'Disconnected from server. Reconnecting…'}
          </div>
        )}
        {board ? (
          <BoardView board={board} send={send} highlighted={highlighted} />
        ) : boards.length === 0 ? (
          <EmptyState />
        ) : null}
      </main>

      {error && (
        <div
          role="alert"
          className="fixed right-4 bottom-4 max-w-sm rounded-md bg-rose-600 px-4 py-3 text-sm text-white shadow-lg"
        >
          {error}
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="m-auto max-w-lg p-8 text-center text-stone-600">
      <h2 className="mb-2 text-lg font-semibold text-stone-800">No boards yet</h2>
      <p className="mb-4 text-sm">
        Create one from the sidebar, or connect your AI agent and ask it to start an Example Mapping
        session:
      </p>
      <code className="block rounded bg-stone-800 px-3 py-2 text-left text-xs text-stone-100">
        claude mcp add --transport http example-map {location.origin}/mcp
      </code>
    </div>
  );
}
