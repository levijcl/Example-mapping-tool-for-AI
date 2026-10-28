import { EventEmitter } from 'node:events';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  applyCommand,
  BoardSchema,
  changedIds,
  createBoard,
  summarizeBoard,
  type Actor,
  type Board,
  type BoardChange,
  type BoardSummary,
  type HistoryState,
} from '@example-map/shared';

/** Maximum undo steps kept per board; older steps are dropped. */
export const HISTORY_LIMIT = 100;

export type BoardUpdatedEvent = {
  board: Board;
  change: BoardChange;
  actor: Actor;
  affectedIds: string[];
  history: HistoryState;
};

export type ChangeResult =
  | { ok: true; board: Board; change: BoardChange; affectedIds: string[]; history: HistoryState }
  | { ok: false; error: string };

/** Snapshots of whole boards; boards are small, so this is simpler than inverse commands. */
type History = { past: Board[]; future: Board[] };

export type ActiveChangedEvent = {
  boardId: string | null;
  actor: Actor;
};

type StoreEvents = {
  updated: [BoardUpdatedEvent];
  boardsChanged: [];
  activeChanged: [ActiveChangedEvent];
};

/**
 * In-memory source of truth for all boards, persisted as one JSON file per board.
 * Commands are applied synchronously (last write wins); writes to disk are queued per board.
 * Each board has an in-memory undo/redo history shared by humans and the AI.
 */
export class BoardStore extends EventEmitter<StoreEvents> {
  private readonly boards = new Map<string, Board>();
  private readonly writes = new Map<string, Promise<void>>();
  private readonly histories = new Map<string, History>();
  private activeId: string | null = null;

  private constructor(private readonly dataDir: string) {
    super();
  }

  static async open(dataDir: string): Promise<BoardStore> {
    const store = new BoardStore(dataDir);
    await mkdir(dataDir, { recursive: true });
    for (const file of await readdir(dataDir)) {
      if (!file.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(await readFile(path.join(dataDir, file), 'utf8'));
        const board = BoardSchema.parse(raw);
        store.boards.set(board.id, board);
      } catch (error) {
        console.warn(`Skipping invalid board file ${file}:`, error);
      }
    }
    store.activeId = store.list()[0]?.id ?? null;
    return store;
  }

  /** Summaries, most recently updated first. */
  list(): BoardSummary[] {
    return [...this.boards.values()]
      .map(summarizeBoard)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(boardId: string): Board | undefined {
    return this.boards.get(boardId);
  }

  get activeBoardId(): string | null {
    return this.activeId;
  }

  setActive(boardId: string, actor: Actor): void {
    if (!this.boards.has(boardId)) throw new Error(`Board ${boardId} not found.`);
    if (this.activeId === boardId) return;
    this.activeId = boardId;
    this.emit('activeChanged', { boardId, actor });
  }

  create(title: string, story: string, actor: Actor): Board {
    const board = createBoard(title, story);
    this.boards.set(board.id, board);
    this.persist(board);
    this.emit('boardsChanged');
    this.setActive(board.id, actor);
    return board;
  }

  delete(boardId: string): boolean {
    if (!this.boards.delete(boardId)) return false;
    this.histories.delete(boardId);
    this.enqueue(boardId, () => rm(this.filePath(boardId), { force: true }));
    if (this.activeId === boardId) {
      this.activeId = this.list()[0]?.id ?? null;
      this.emit('activeChanged', { boardId: this.activeId, actor: 'human' });
    }
    this.emit('boardsChanged');
    return true;
  }

  apply(boardId: string, command: unknown, actor: Actor): ChangeResult {
    const board = this.boards.get(boardId);
    if (!board) return { ok: false, error: `Board ${boardId} not found.` };

    const result = applyCommand(board, command);
    if (!result.ok) return result;

    const history = this.historyOf(boardId);
    history.past.push(board);
    if (history.past.length > HISTORY_LIMIT) history.past.shift();
    history.future = [];

    return this.commit(result.board, result.command, actor, result.affectedIds);
  }

  undo(boardId: string, actor: Actor): ChangeResult {
    return this.travel(boardId, 'undo', actor);
  }

  redo(boardId: string, actor: Actor): ChangeResult {
    return this.travel(boardId, 'redo', actor);
  }

  history(boardId: string): HistoryState {
    const history = this.histories.get(boardId);
    return { canUndo: !!history?.past.length, canRedo: !!history?.future.length };
  }

  private travel(boardId: string, direction: 'undo' | 'redo', actor: Actor): ChangeResult {
    const board = this.boards.get(boardId);
    if (!board) return { ok: false, error: `Board ${boardId} not found.` };

    const history = this.historyOf(boardId);
    const [from, to] =
      direction === 'undo' ? [history.past, history.future] : [history.future, history.past];
    const target = from.pop();
    if (!target) return { ok: false, error: `Nothing to ${direction}.` };
    to.push(board);

    // Restored content gets a new version so versions only ever increase.
    const next: Board = {
      ...target,
      version: board.version + 1,
      updatedAt: new Date().toISOString(),
    };
    return this.commit(next, { type: direction }, actor, changedIds(board, next));
  }

  private commit(
    board: Board,
    change: BoardChange,
    actor: Actor,
    affectedIds: string[],
  ): ChangeResult {
    this.boards.set(board.id, board);
    this.persist(board);
    const history = this.history(board.id);
    this.emit('updated', { board, change, actor, affectedIds, history });
    this.emit('boardsChanged');
    return { ok: true, board, change, affectedIds, history };
  }

  private historyOf(boardId: string): History {
    let history = this.histories.get(boardId);
    if (!history) {
      history = { past: [], future: [] };
      this.histories.set(boardId, history);
    }
    return history;
  }

  /** Resolves once all queued disk writes have finished. */
  async flush(): Promise<void> {
    await Promise.all(this.writes.values());
  }

  private persist(board: Board): void {
    const json = JSON.stringify(board, null, 2) + '\n';
    const file = this.filePath(board.id);
    this.enqueue(board.id, async () => {
      const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(tmp, json, 'utf8');
      await rename(tmp, file);
    });
  }

  private enqueue(boardId: string, task: () => Promise<unknown>): void {
    const previous = this.writes.get(boardId) ?? Promise.resolve();
    const next = previous
      .then(task)
      .then(() => undefined)
      .catch((error) => console.error(`Failed to persist board ${boardId}:`, error));
    this.writes.set(boardId, next);
  }

  private filePath(boardId: string): string {
    return path.join(this.dataDir, `${boardId}.json`);
  }
}
