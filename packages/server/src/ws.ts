import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { ClientMessageSchema, formatZodError, type ServerMessage } from '@example-map/shared';
import type { ActiveChangedEvent, BoardStore, BoardUpdatedEvent } from './board-store';

export type BoardSocketServer = {
  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void;
  close(): void;
};

export function createBoardSocketServer(store: BoardStore): BoardSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const subscriptions = new Map<WebSocket, string>();

  const send = (ws: WebSocket, message: ServerMessage) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };
  const broadcast = (message: ServerMessage, boardId?: string) => {
    for (const ws of wss.clients) {
      if (boardId === undefined || subscriptions.get(ws) === boardId) send(ws, message);
    }
  };

  const onUpdated = ({ board, change, actor, affectedIds, history }: BoardUpdatedEvent) =>
    broadcast({ type: 'updated', board, change, actor, affectedIds, history }, board.id);
  const onBoardsChanged = () => broadcast({ type: 'boardsChanged' });
  const onActiveChanged = ({ boardId, actor }: ActiveChangedEvent) =>
    broadcast({ type: 'activeChanged', boardId, actor });

  store.on('updated', onUpdated);
  store.on('boardsChanged', onBoardsChanged);
  store.on('activeChanged', onActiveChanged);

  wss.on('connection', (ws) => {
    ws.on('close', () => subscriptions.delete(ws));
    ws.on('message', (data) => {
      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        return send(ws, { type: 'error', message: 'Message is not valid JSON.' });
      }
      const parsed = ClientMessageSchema.safeParse(raw);
      if (!parsed.success) {
        return send(ws, {
          type: 'error',
          message: `Invalid message: ${formatZodError(parsed.error)}`,
        });
      }

      const message = parsed.data;
      if (message.type === 'open') {
        const board = store.get(message.boardId);
        if (!board)
          return send(ws, { type: 'error', message: `Board ${message.boardId} not found.` });
        subscriptions.set(ws, board.id);
        store.setActive(board.id, 'human');
        return send(ws, { type: 'snapshot', board, history: store.history(board.id) });
      }

      if (message.type === 'undo' || message.type === 'redo') {
        const result = store[message.type](message.boardId, 'human');
        if (!result.ok) send(ws, { type: 'error', message: result.error });
        return;
      }

      const result = store.apply(message.boardId, message.command, 'human');
      if (!result.ok)
        send(ws, { type: 'error', requestId: message.requestId, message: result.error });
    });
  });

  return {
    handleUpgrade(req, socket, head) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    },
    close() {
      store.off('updated', onUpdated);
      store.off('boardsChanged', onBoardsChanged);
      store.off('activeChanged', onActiveChanged);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
    },
  };
}
