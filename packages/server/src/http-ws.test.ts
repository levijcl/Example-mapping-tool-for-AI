import type { Board } from '@example-map/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startTestServer, TestSocket, type TestServer } from './test/harness';

let server: TestServer;
const sockets: TestSocket[] = [];

async function connect(): Promise<TestSocket> {
  const socket = await TestSocket.connect(server.url);
  sockets.push(socket);
  return socket;
}

beforeEach(async () => {
  server = await startTestServer();
});

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.close();
  await server.dispose();
});

describe('REST /api/boards', () => {
  it('creates, lists, and deletes boards', async () => {
    const created = await fetch(`${server.url}/api/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Coupons' }),
    });
    expect(created.status).toBe(201);
    const board = (await created.json()) as Board;
    expect(board).toMatchObject({ title: 'Coupons', version: 0 });

    const list = await (await fetch(`${server.url}/api/boards`)).json();
    expect(list).toEqual({
      activeBoardId: board.id,
      boards: [expect.objectContaining({ id: board.id, title: 'Coupons', ruleCount: 0 })],
    });

    expect((await fetch(`${server.url}/api/boards/${board.id}`, { method: 'DELETE' })).status).toBe(
      204,
    );
    expect((await fetch(`${server.url}/api/boards/${board.id}`, { method: 'DELETE' })).status).toBe(
      404,
    );
  });

  it('rejects a board without a title', async () => {
    const res = await fetch(`${server.url}/api/boards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: '  ' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('WebSocket /ws', () => {
  it('sends a snapshot on open and broadcasts human commands to subscribers', async () => {
    const board = server.store.create('Coupons', '', 'human');
    const [a, b] = [await connect(), await connect()];
    a.send({ type: 'open', boardId: board.id });
    b.send({ type: 'open', boardId: board.id });
    expect((await a.next('snapshot')).board.id).toBe(board.id);
    await b.next('snapshot');

    a.send({
      type: 'command',
      boardId: board.id,
      requestId: '1',
      command: { type: 'addRule', text: 'Min spend' },
    });

    const update = await b.next('updated');
    expect(update.actor).toBe('human');
    expect(update.board.rules[0]?.text).toBe('Min spend');
    expect(update.affectedIds).toEqual([update.board.rules[0]?.id]);
    await a.next('updated');
  });

  it('broadcasts store changes made by the AI', async () => {
    const board = server.store.create('Coupons', '', 'human');
    const ws = await connect();
    ws.send({ type: 'open', boardId: board.id });
    await ws.next('snapshot');

    server.store.apply(board.id, { type: 'addQuestion', text: 'Tax?' }, 'ai');
    expect((await ws.next('updated')).actor).toBe('ai');
    await ws.next('boardsChanged');
  });

  it('only sends board updates to clients subscribed to that board', async () => {
    const one = server.store.create('One', '', 'human');
    const two = server.store.create('Two', '', 'human');
    const ws = await connect();
    ws.send({ type: 'open', boardId: one.id });
    await ws.next('snapshot');

    server.store.apply(two.id, { type: 'addQuestion', text: 'q' }, 'ai');
    server.store.apply(one.id, { type: 'addQuestion', text: 'q' }, 'ai');
    expect((await ws.next('updated')).board.id).toBe(one.id);
    expect(ws.received('updated')).toBe(false);
  });

  it('announces active board changes with the actor', async () => {
    const ws = await connect();
    const board = server.store.create('From AI', '', 'ai');
    expect(await ws.next('activeChanged')).toEqual({
      type: 'activeChanged',
      boardId: board.id,
      actor: 'ai',
    });
  });

  it('reports errors for invalid commands, unknown boards, and malformed messages', async () => {
    const board = server.store.create('Coupons', '', 'human');
    const ws = await connect();

    ws.send({
      type: 'command',
      boardId: board.id,
      requestId: 'r1',
      command: { type: 'deleteRule', ruleId: 'r_x' },
    });
    expect(await ws.next('error')).toMatchObject({
      requestId: 'r1',
      message: expect.stringContaining('r_x'),
    });

    ws.send({ type: 'open', boardId: 'b_missing' });
    expect((await ws.next('error')).message).toBe('Board b_missing not found.');

    ws.send({ type: 'nope' });
    expect((await ws.next('error')).message).toMatch(/Invalid message/);
  });
});
