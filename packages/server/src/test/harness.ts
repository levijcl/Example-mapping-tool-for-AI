import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import type { ServerMessage } from '@example-map/shared';
import { startServer, type RunningServer } from '../server';

export type TestServer = RunningServer & { dispose(): Promise<void> };

export async function startTestServer(): Promise<TestServer> {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'example-map-'));
  const server = await startServer({
    host: '127.0.0.1',
    port: 0,
    dataDir,
    webDist: path.join(dataDir, 'no-web-dist'),
  });
  return {
    ...server,
    async dispose() {
      await server.close();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}

/** WebSocket client that buffers received messages so tests can await specific ones. */
export class TestSocket {
  private readonly messages: ServerMessage[] = [];
  private readonly waiters: Array<() => void> = [];

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()));
      for (const wake of this.waiters.splice(0)) wake();
    });
  }

  static async connect(baseUrl: string): Promise<TestSocket> {
    const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws`);
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return new TestSocket(ws);
  }

  send(message: unknown): void {
    this.ws.send(JSON.stringify(message));
  }

  /** Resolves with the first not-yet-consumed message of the given type. */
  async next<T extends ServerMessage['type']>(
    type: T,
    timeoutMs = 2000,
  ): Promise<Extract<ServerMessage, { type: T }>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const index = this.messages.findIndex((m) => m.type === type);
      if (index !== -1)
        return this.messages.splice(index, 1)[0] as Extract<ServerMessage, { type: T }>;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Timed out waiting for "${type}" message`);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, remaining);
        this.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  received(type: ServerMessage['type']): boolean {
    return this.messages.some((m) => m.type === type);
  }

  close(): void {
    this.ws.close();
  }
}
