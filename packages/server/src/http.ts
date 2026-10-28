import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { z } from 'zod';
import { formatZodError } from '@example-map/shared';
import type { BoardStore } from './board-store';

const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url));

const CreateBoardSchema = z.object({ title: z.string().trim().min(1).max(500) });

export function createHttpApp(store: BoardStore, webDist = WEB_DIST): Hono {
  const app = new Hono();

  app.get('/api/boards', (c) =>
    c.json({ boards: store.list(), activeBoardId: store.activeBoardId }),
  );

  app.post('/api/boards', async (c) => {
    const parsed = CreateBoardSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: formatZodError(parsed.error) }, 400);
    return c.json(store.create(parsed.data.title, '', 'human'), 201);
  });

  app.delete('/api/boards/:id', (c) =>
    store.delete(c.req.param('id'))
      ? c.body(null, 204)
      : c.json({ error: 'Board not found.' }, 404),
  );

  if (existsSync(webDist)) {
    app.use('/*', serveStatic({ root: webDist }));
    app.get('*', serveStatic({ root: webDist, path: 'index.html' }));
  }

  return app;
}
