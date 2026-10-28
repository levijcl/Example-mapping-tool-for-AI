import { EventEmitter } from 'node:events';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  applyCommand,
  BoardSchema,
  createBoard,
  summarizeBoard,
  type Actor,
  type ApplyResult,
  type Board,
  type BoardSummary,
  type Command,
} from '@example-map/shared';

export type BoardUpdatedEvent = {
  board: Board;
  command: Command;
  actor: Actor;
  affectedIds: string[];
};

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
 */
export class BoardStore extends EventEmitter<StoreEvents> {
  private readonly boards = new Map<string, Board>();
  private readonly writes = new Map<string, Promise<void>>();
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
    this.enqueue(boardId, () => rm(this.filePath(boardId), { force: true }));
    if (this.activeId === boardId) {
      this.activeId = this.list()[0]?.id ?? null;
      this.emit('activeChanged', { boardId: this.activeId, actor: 'human' });
    }
    this.emit('boardsChanged');
    return true;
  }

  apply(boardId: string, command: unknown, actor: Actor): ApplyResult {
    const board = this.boards.get(boardId);
    if (!board) return { ok: false, error: `Board ${boardId} not found.` };

    const result = applyCommand(board, command);
    if (!result.ok) return result;

    this.boards.set(boardId, result.board);
    this.persist(result.board);
    this.emit('updated', {
      board: result.board,
      command: result.command,
      actor,
      affectedIds: result.affectedIds,
    });
    this.emit('boardsChanged');
    return result;
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
