import { test as base } from '@playwright/test';
import { BrowseTheWeb } from './integration/browse-the-web';
import { CallMcpTools } from './integration/call-mcp-tools';
import { Actor } from './screenplay';

/** The cast: a human at the browser and an AI agent connected over MCP, sharing one board. */
export const test = base.extend<{ human: Actor; ai: Actor }>({
  human: async ({ page }, use) => {
    await use(new Actor('Human').whoCan(BrowseTheWeb.using(page)));
  },
  ai: async ({ baseURL }, use) => {
    const mcp = await CallMcpTools.at(baseURL!);
    await use(new Actor('AI').whoCan(mcp));
    await mcp.close();
  },
});

export { expect } from '@playwright/test';
