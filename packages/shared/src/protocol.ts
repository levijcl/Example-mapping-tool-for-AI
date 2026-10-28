import { z } from 'zod';
import type { Actor, Board, Command } from './schema';

/** Messages sent by the web UI over `/ws`. */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open'), boardId: z.string() }),
  z.object({
    type: z.literal('command'),
    boardId: z.string(),
    requestId: z.string(),
    command: z.unknown(),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/** Messages sent by the server over `/ws`. */
export type ServerMessage =
  | { type: 'snapshot'; board: Board }
  | { type: 'updated'; board: Board; command: Command; actor: Actor; affectedIds: string[] }
  | { type: 'boardsChanged' }
  | { type: 'activeChanged'; boardId: string | null; actor: Actor }
  | { type: 'error'; requestId?: string; message: string };
