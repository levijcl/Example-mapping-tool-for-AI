import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Board, Example, Question, Rule } from '@example-map/shared';
import { Ability } from '../screenplay';

type History = { canUndo: boolean; canRedo: boolean };

/** Integration layer: lets an actor (a stand-in for an AI agent) use the board over MCP. */
export class CallMcpTools extends Ability {
  private history: History | undefined;

  private constructor(private readonly client: Client) {
    super();
  }

  static async at(baseURL: string): Promise<CallMcpTools> {
    const client = new Client({ name: 'e2e-agent', version: '0.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(`${baseURL}/mcp`)));
    return new CallMcpTools(client);
  }

  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = (await this.client.callTool({ name, arguments: args })) as CallToolResult;
    const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
    if (result.isError) throw new Error(`${name} failed: ${text}`);
    const data = JSON.parse(text) as T & Partial<History>;
    if (typeof data.canUndo === 'boolean')
      this.history = { canUndo: data.canUndo, canRedo: data.canRedo! };
    return data;
  }

  async board(): Promise<Board> {
    return (await this.call<{ board: Board }>('get_board')).board;
  }

  /** The undo/redo state reported by the most recent change. MCP has no tool to query it. */
  lastKnownHistory(): History {
    if (!this.history) throw new Error('No change has been made over MCP yet');
    return this.history;
  }

  close(): Promise<void> {
    return this.client.close();
  }
}

/** MCP tools address cards by id; tasks refer to them by their text. */
export function ruleWithText(board: Board, text: string): Rule {
  return found(
    board.rules.find((r) => r.text === text),
    `rule "${text}"`,
  );
}

export function exampleWithText(board: Board, text: string): Example {
  return found(
    board.rules.flatMap((r) => r.examples).find((e) => e.text === text),
    `example "${text}"`,
  );
}

export function questionWithText(board: Board, text: string): Question {
  return found(
    board.questions.find((q) => q.text === text),
    `question "${text}"`,
  );
}

function found<T>(item: T | undefined, what: string): T {
  if (!item) throw new Error(`No ${what} on the board`);
  return item;
}
