import { loadConfig } from './config';

const config = loadConfig();
// HTTP / WS / MCP server is wired up in T5–T6.
console.log(`example-map server config: ${JSON.stringify(config)}`);
