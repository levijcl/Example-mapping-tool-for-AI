import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardStore } from './board-store';

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
});
