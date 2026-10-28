import { loadConfig } from './config';
import { startServer } from './server';

const config = loadConfig();
const server = await startServer(config);

console.log(`Example Map running at ${server.url}`);
console.log(`  MCP endpoint: ${server.url}/mcp`);
console.log(`  Data dir:     ${config.dataDir}`);

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
