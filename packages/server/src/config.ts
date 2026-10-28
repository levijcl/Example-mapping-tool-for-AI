import { DEFAULT_PORT } from '@example-map/shared';

export type ServerConfig = {
  host: string;
  port: number;
  dataDir: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: '127.0.0.1',
    port: env.PORT ? Number(env.PORT) : DEFAULT_PORT,
    dataDir: env.DATA_DIR ?? 'boards',
  };
}
