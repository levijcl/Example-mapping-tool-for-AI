import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardStore, HISTORY_LIMIT } from './board-store';

let dir: string;
let stores: BoardStore[] = [];

async function openStore(): Promise<BoardStore> {
  const store = await BoardStore.open(dir);
  stores.push(store);
  return store;
}

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'board-store-'));
});

afterEach(async () => {
  await Promise.all(stores.map((s) => s.flush()));
  stores = [];
  await rm(dir, { recursive: true, force: true });
});

describe('BoardStore', () => {
  it('creates a board, makes it active, and persists it', async () => {
    const store = await openStore();
    const board = store.create('Coupons', 'Pay with coupon', 'ai');
    await store.flush();

    expect(store.activeBoardId).toBe(board.id);
    const saved = JSON.parse(await readFile(path.join(dir, `${board.id}.json`), 'utf8'));
    expect(saved).toEqual(board);
  });

  it('applies commands, persists them, and reloads after restart', async () => {
    const store = await openStore();
    const board = store.create('Coupons', '', 'human');
    const result = store.apply(
      board.id,
      { type: 'addRule', text: 'Min spend', examples: ['$900'] },
      'ai',
    );
    expect(result.ok).toBe(true);
    await store.flush();

    const reopened = await openStore();
    expect(reopened.get(board.id)?.rules[0]?.text).toBe('Min spend');
    expect(reopened.get(board.id)?.version).toBe(1);
    expect(reopened.activeBoardId).toBe(board.id);
  });

  it('keeps only the latest state on disk after rapid writes and leaves no tmp files', async () => {
    const store = await openStore();
    const board = store.create('B', '', 'human');
    for (let i = 0; i < 20; i++)
      store.apply(board.id, { type: 'addQuestion', text: `q${i}` }, 'human');
    await store.flush();

    const saved = JSON.parse(await readFile(path.join(dir, `${board.id}.json`), 'utf8'));
    expect(saved.questions).toHaveLength(20);
    expect(await readdir(dir)).toEqual([`${board.id}.json`]);
  });

  it('returns errors without changing state', async () => {
    const store = await openStore();
    const board = store.create('B', '', 'human');
    expect(store.apply(board.id, { type: 'deleteRule', ruleId: 'r_x' }, 'ai')).toMatchObject({
      ok: false,
    });
    expect(store.apply('b_missing', { type: 'addQuestion', text: 'q' }, 'ai')).toEqual({
      ok: false,
      error: 'Board b_missing not found.',
    });
    expect(store.get(board.id)?.version).toBe(0);
  });

  it('emits updated, boardsChanged, and activeChanged events', async () => {
    const store = await openStore();
    const updated = vi.fn();
    const boardsChanged = vi.fn();
    const activeChanged = vi.fn();
    store.on('updated', updated);
    store.on('boardsChanged', boardsChanged);
    store.on('activeChanged', activeChanged);

    const board = store.create('B', '', 'ai');
    expect(activeChanged).toHaveBeenLastCalledWith({ boardId: board.id, actor: 'ai' });
    expect(boardsChanged).toHaveBeenCalledTimes(1);

    store.apply(board.id, { type: 'addQuestion', text: 'q' }, 'ai');
    expect(updated).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'ai', affectedIds: [expect.stringMatching(/^q_/)] }),
    );
    await store.flush();
  });

  it('lists boards by most recent update and deletes them', async () => {
    const store = await openStore();
    const a = store.create('A', '', 'human');
    await new Promise((r) => setTimeout(r, 5));
    const b = store.create('B', '', 'human');
    expect(store.list().map((s) => s.id)).toEqual([b.id, a.id]);

    expect(store.delete(b.id)).toBe(true);
    expect(store.activeBoardId).toBe(a.id);
    await store.flush();
    expect(await readdir(dir)).toEqual([`${a.id}.json`]);
    expect(store.delete('b_missing')).toBe(false);
  });

  it('skips invalid board files on load', async () => {
    await writeFile(path.join(dir, 'broken.json'), '{ not json');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = await openStore();
    expect(store.list()).toEqual([]);
  });

  describe('undo / redo', () => {
    const texts = (store: BoardStore, id: string) => store.get(id)!.questions.map((q) => q.text);

    it('undoes and redoes commands from any actor, always bumping the version', async () => {
      const store = await openStore();
      const board = store.create('B', '', 'human');
      expect(store.history(board.id)).toEqual({ canUndo: false, canRedo: false });

      store.apply(board.id, { type: 'addQuestion', text: 'human q' }, 'human');
      store.apply(board.id, { type: 'addQuestion', text: 'ai q' }, 'ai');
      expect(store.history(board.id)).toEqual({ canUndo: true, canRedo: false });

      const undone = store.undo(board.id, 'human');
      expect(undone).toMatchObject({
        ok: true,
        change: { type: 'undo' },
        history: { canUndo: true, canRedo: true },
      });
      expect(texts(store, board.id)).toEqual(['human q']);
      expect(store.get(board.id)?.version).toBe(3);

      store.undo(board.id, 'ai');
      expect(texts(store, board.id)).toEqual([]);
      expect(store.undo(board.id, 'human')).toEqual({ ok: false, error: 'Nothing to undo.' });

      const redone = store.redo(board.id, 'ai');
      expect(redone.ok && redone.affectedIds).toEqual([store.get(board.id)!.questions[0]!.id]);
      store.redo(board.id, 'ai');
      expect(texts(store, board.id)).toEqual(['human q', 'ai q']);
      expect(store.get(board.id)?.version).toBe(6);
      expect(store.redo(board.id, 'human')).toEqual({ ok: false, error: 'Nothing to redo.' });
    });

    it('treats one command as one step, even a rule added with examples', async () => {
      const store = await openStore();
      const board = store.create('B', '', 'human');
      store.apply(board.id, { type: 'addRule', text: 'R', examples: ['a', 'b'] }, 'ai');
      store.undo(board.id, 'human');
      expect(store.get(board.id)?.rules).toEqual([]);
    });

    it('clears redo after a new change', async () => {
      const store = await openStore();
      const board = store.create('B', '', 'human');
      store.apply(board.id, { type: 'addQuestion', text: 'a' }, 'human');
      store.undo(board.id, 'human');
      store.apply(board.id, { type: 'addQuestion', text: 'b' }, 'human');
      expect(store.history(board.id).canRedo).toBe(false);
      expect(texts(store, board.id)).toEqual(['b']);
    });

    it('does not record failed commands', async () => {
      const store = await openStore();
      const board = store.create('B', '', 'human');
      store.apply(board.id, { type: 'deleteRule', ruleId: 'r_x' }, 'ai');
      expect(store.history(board.id).canUndo).toBe(false);
    });

    it(`keeps at most ${HISTORY_LIMIT} steps`, async () => {
      const store = await openStore();
      const board = store.create('B', '', 'human');
      for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
        store.apply(board.id, { type: 'addQuestion', text: `q${i}` }, 'human');
      }
      let undos = 0;
      while (store.undo(board.id, 'human').ok) undos++;
      expect(undos).toBe(HISTORY_LIMIT);
      expect(store.get(board.id)?.questions).toHaveLength(5);
    });

    it('emits updated events for undo and persists the result', async () => {
      const store = await openStore();
      const board = store.create('B', '', 'human');
      store.apply(board.id, { type: 'setStory', text: 'story' }, 'human');
      const updated = vi.fn();
      store.on('updated', updated);

      store.undo(board.id, 'ai');
      expect(updated).toHaveBeenCalledWith(
        expect.objectContaining({ change: { type: 'undo' }, actor: 'ai', affectedIds: [board.id] }),
      );
      await store.flush();

      const reopened = await openStore();
      expect(reopened.get(board.id)?.story).toBe('');
      expect(reopened.history(board.id)).toEqual({ canUndo: false, canRedo: false });
    });

    it('drops history when a board is deleted', async () => {
      const store = await openStore();
      const board = store.create('B', '', 'human');
      store.apply(board.id, { type: 'addQuestion', text: 'q' }, 'human');
      store.delete(board.id);
      expect(store.history(board.id)).toEqual({ canUndo: false, canRedo: false });
      expect(store.undo(board.id, 'human')).toEqual({
        ok: false,
        error: `Board ${board.id} not found.`,
      });
    });
  });
});
