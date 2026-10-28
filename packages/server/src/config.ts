import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from '@example-map/shared';

export type ServerConfig = {
  host: string;
  port: number;
  dataDir: string;
};

/** `<repo>/boards`, independent of the working directory. */
export const DEFAULT_DATA_DIR = fileURLToPath(new URL('../../../boards', import.meta.url));

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  return {
    host: '127.0.0.1',
    port: env.PORT ? Number(env.PORT) : DEFAULT_PORT,
    dataDir: env.DATA_DIR ?? DEFAULT_DATA_DIR,
  };
}
