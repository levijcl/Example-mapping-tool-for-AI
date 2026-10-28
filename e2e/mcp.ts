import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Board } from '@example-map/shared';

/** A minimal stand-in for an AI agent talking to the board over MCP. */
export class Agent {
  private constructor(private readonly client: Client) {}

  static async connect(baseURL: string): Promise<Agent> {
    const client = new Client({ name: 'e2e-agent', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`)));
    return new Agent(client);
  }

  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = (await this.client.callTool({ name, arguments: args })) as CallToolResult;
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    if (result.isError) throw new Error(`${name} failed: ${text}`);
    return JSON.parse(text) as T;
  }

  async getBoard(): Promise<Board> {
    return (await this.call<{ board: Board }>('get_board')).board;
  }

  close(): Promise<void> {
    return this.client.close();
  }
}
