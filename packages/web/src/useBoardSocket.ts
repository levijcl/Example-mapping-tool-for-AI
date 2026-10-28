import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyCommand,
  type Actor,
  type Board,
  type ClientMessage,
  type Command,
  type ServerMessage,
} from '@example-map/shared';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

type Handlers = {
  onBoardsChanged: () => void;
  onActiveChanged: (boardId: string | null, actor: Actor) => void;
  onAiChange: (affectedIds: string[]) => void;
  onError: (message: string) => void;
};

const RECONNECT_DELAY_MS = 1000;

/** Commands applied locally before the server confirms, so drag-and-drop doesn't snap back. */
const OPTIMISTIC: ReadonlySet<Command['type']> = new Set(['moveRule', 'moveExample']);

function socketUrl(): string {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws`;
}

/**
 * Keeps one WebSocket to the board server, subscribed to `boardId`.
 * Reconnects automatically and re-subscribes after reconnecting.
 */
export function useBoardSocket(boardId: string | null, handlers: Handlers) {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [board, setBoard] = useState<Board | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const boardIdRef = useRef(boardId);
  const handlersRef = useRef(handlers);
  const requestId = useRef(0);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  const sendMessage = useCallback((message: ClientMessage) => {
    const ws = wsRef.current;
    if (ws?.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  useEffect(() => {
    let disposed = false;
    let retryTimer: number | undefined;

    const handle = (message: ServerMessage) => {
      const h = handlersRef.current;
      switch (message.type) {
        case 'snapshot':
          if (message.board.id === boardIdRef.current) setBoard(message.board);
          break;
        case 'updated':
          if (message.board.id !== boardIdRef.current) break;
          setBoard(message.board);
          if (message.actor === 'ai') h.onAiChange(message.affectedIds);
          break;
        case 'boardsChanged':
          h.onBoardsChanged();
          break;
        case 'activeChanged':
          h.onActiveChanged(message.boardId, message.actor);
          break;
        case 'error':
          h.onError(message.message);
          break;
      }
    };

    const connect = () => {
      setStatus('connecting');
      const ws = new WebSocket(socketUrl());
      wsRef.current = ws;
      ws.onopen = () => {
        setStatus('open');
        if (boardIdRef.current) sendMessage({ type: 'open', boardId: boardIdRef.current });
        handlersRef.current.onBoardsChanged();
      };
      ws.onmessage = (event) => handle(JSON.parse(event.data as string) as ServerMessage);
      ws.onclose = () => {
        if (disposed) return;
        setStatus('closed');
        retryTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retryTimer);
      wsRef.current?.close();
    };
  }, [sendMessage]);

  useEffect(() => {
    boardIdRef.current = boardId;
    if (boardId) sendMessage({ type: 'open', boardId });
  }, [boardId, sendMessage]);

  const send = useCallback(
    (command: Command) => {
      const id = boardIdRef.current;
      if (!id) return;
      if (OPTIMISTIC.has(command.type)) {
        setBoard((current) => {
          if (current?.id !== id) return current;
          const result = applyCommand(current, command);
          return result.ok ? result.board : current;
        });
      }
      const sent = sendMessage({
        type: 'command',
        boardId: id,
        requestId: String(++requestId.current),
        command,
      });
      if (!sent) handlersRef.current.onError('Not connected to the server.');
    },
    [sendMessage],
  );

  // A board from a previous subscription is never shown for a different boardId.
  return { status, board: board?.id === boardId ? board : null, send };
}
