import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Board, Hint } from '@example-map/shared';
import { startTestServer, TestSocket, type TestServer } from './test/harness';

let server: TestServer;
let client: Client;

beforeEach(async () => {
  server = await startTestServer();
  client = new Client({ name: 'test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`)));
});

afterEach(async () => {
  await client.close();
  await server.dispose();
});

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as CallToolResult;
  const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
  return { isError: result.isError ?? false, text, json: () => JSON.parse(text) };
}

describe('MCP server', () => {
  it('exposes instructions, all tools, and the facilitation prompt', async () => {
    expect(client.getInstructions()).toContain('Example Mapping facilitator');

    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        'add_example',
        'add_question',
        'add_rule',
        'create_board',
        'delete_example',
        'delete_question',
        'delete_rule',
        'export_markdown',
        'get_board',
        'list_boards',
        'move_example',
        'move_rule',
        'open_board',
        'reopen_question',
        'resolve_question',
        'set_story',
        'set_title',
        'update_example',
        'update_question',
        'update_rule',
      ].sort(),
    );

    const prompt = await client.getPrompt({
      name: 'facilitate-example-mapping',
      arguments: { story: 'Pay with coupon' },
    });
    expect(JSON.stringify(prompt.messages)).toContain('Pay with coupon');
  });

  it('creates a board, adds a rule with examples, and reads it back with hints', async () => {
    const created = (
      await call('create_board', { title: 'Coupons', story: 'Pay with coupon' })
    ).json();
    expect(created.isActive).toBe(true);

    const added = await call('add_rule', {
      text: 'Min spend $1000',
      examples: ['$900 → rejected'],
    });
    expect(added.isError).toBe(false);
    expect(added.json().changed).toEqual([
      expect.objectContaining({ kind: 'rule', text: 'Min spend $1000' }),
      expect.objectContaining({ kind: 'example', text: '$900 → rejected' }),
    ]);

    await call('add_rule', { text: 'One coupon per order' });

    const { board, hints } = (await call('get_board')).json() as { board: Board; hints: Hint[] };
    expect(board.rules.map((r) => r.text)).toEqual(['Min spend $1000', 'One coupon per order']);
    expect(hints).toEqual([
      expect.objectContaining({ code: 'rule-without-examples', targetId: board.rules[1]?.id }),
    ]);
  });

  it('broadcasts AI changes to the UI with actor "ai" and switches the UI to new boards', async () => {
    const ws = await TestSocket.connect(server.url);
    try {
      const { board } = (await call('create_board', { title: 'Coupons' })).json() as {
        board: Board;
      };
      expect(await ws.next('activeChanged')).toEqual({
        type: 'activeChanged',
        boardId: board.id,
        actor: 'ai',
      });

      ws.send({ type: 'open', boardId: board.id });
      await ws.next('snapshot');
      await call('add_question', { text: 'Does tax count?' });

      const update = await ws.next('updated');
      expect(update.actor).toBe('ai');
      expect(update.board.questions[0]?.text).toBe('Does tax count?');
    } finally {
      ws.close();
    }
  });

  it('sees edits the human made through the store', async () => {
    const { board } = (await call('create_board', { title: 'Coupons' })).json() as { board: Board };
    server.store.apply(board.id, { type: 'setStory', text: 'Edited by human' }, 'human');
    expect((await call('get_board')).json().board.story).toBe('Edited by human');
  });

  it('returns tool errors the AI can act on', async () => {
    expect(await call('get_board')).toMatchObject({
      isError: true,
      text: 'No active board. Call list_boards or create_board first.',
    });

    await call('create_board', { title: 'Coupons' });
    expect(await call('delete_rule', { ruleId: 'r_missing' })).toMatchObject({
      isError: true,
      text: 'Rule r_missing not found. Call get_board to refresh.',
    });
    expect((await call('get_board', { boardId: 'b_missing' })).text).toMatch(
      /Board b_missing not found/,
    );
  });

  it('targets an explicit board and makes it active', async () => {
    const first = (await call('create_board', { title: 'First' })).json().board as Board;
    await call('create_board', { title: 'Second' });

    await call('add_question', { boardId: first.id, text: 'q' });
    expect(server.store.activeBoardId).toBe(first.id);
    expect(server.store.get(first.id)?.questions).toHaveLength(1);

    const list = (await call('list_boards')).json();
    expect(list.activeBoardId).toBe(first.id);
    expect(list.boards).toHaveLength(2);
  });

  it('exports markdown', async () => {
    await call('create_board', { title: 'Coupons', story: 'Pay with coupon' });
    expect((await call('export_markdown')).text).toContain('# Coupons');
  });
});

describe('local-only protection', () => {
  it('rejects requests with a non-local Host or Origin', async () => {
    const res = await fetch(`${server.url}/api/boards`, {
      headers: { origin: 'https://evil.com' },
    });
    expect(res.status).toBe(403);
  });

  it('rejects WebSocket connections from a non-local Origin', async () => {
    const { default: WebSocket } = await import('ws');
    const ws = new WebSocket(`${server.url.replace('http', 'ws')}/ws`, {
      origin: 'https://evil.com',
    });
    await expect(
      new Promise((resolve, reject) => {
        ws.once('open', resolve);
        ws.once('error', reject);
      }),
    ).rejects.toThrow();
  });
});
