import { z } from 'zod';
import type { Actor, Board, BoardChange, HistoryState } from './schema';

/** Messages sent by the web UI over `/ws`. */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open'), boardId: z.string() }),
  z.object({
    type: z.literal('command'),
    boardId: z.string(),
    requestId: z.string(),
    command: z.unknown(),
  }),
  z.object({ type: z.literal('undo'), boardId: z.string() }),
  z.object({ type: z.literal('redo'), boardId: z.string() }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Messages sent by the server over `/ws`. */
export type ServerMessage =
  | { type: 'snapshot'; board: Board; history: HistoryState }
  | {
      type: 'updated';
      board: Board;
      change: BoardChange;
      actor: Actor;
      affectedIds: string[];
      history: HistoryState;
    }
  | { type: 'boardsChanged' }
  | { type: 'activeChanged'; boardId: string | null; actor: Actor }
  | { type: 'error'; requestId?: string; message: string };
