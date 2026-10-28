import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getRequestListener } from '@hono/node-server';
import { BoardStore } from './board-store';
import type { ServerConfig } from './config';
import { createHttpApp } from './http';
import { isLocalHost, isLocalOrigin } from './local-only';
import { createBoardSocketServer } from './ws';

export type RunningServer = {
  url: string;
  store: BoardStore;
  close(): Promise<void>;
};

export type ServerOptions = ServerConfig & {
  webDist?: string;
};

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const store = await BoardStore.open(options.dataDir);
  const honoListener = getRequestListener(createHttpApp(store, options.webDist).fetch);
  const sockets = createBoardSocketServer(store);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void honoListener(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    const isWs = new URL(req.url ?? '/', 'http://localhost').pathname === '/ws';
    if (isWs && isLocalHost(req.headers.host) && isLocalOrigin(req.headers.origin)) {
      sockets.handleUpgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://${options.host}:${port}`,
    store,
    async close() {
      sockets.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await store.flush();
    },
  };
}
