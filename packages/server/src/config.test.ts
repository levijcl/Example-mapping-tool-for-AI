import { describe, expect, it } from 'vitest';
import { DEFAULT_DATA_DIR, loadConfig } from './config';

describe('loadConfig', () => {
  it('uses defaults', () => {
    expect(loadConfig({})).toEqual({ host: '127.0.0.1', port: 4319, dataDir: DEFAULT_DATA_DIR });
  });

  it('defaults the data dir to <repo>/boards', () => {
    expect(DEFAULT_DATA_DIR).toMatch(/Example-mapping-tool-for-AI\/boards$/);
  });

  it('reads PORT and DATA_DIR', () => {
    expect(loadConfig({ PORT: '5000', DATA_DIR: '/tmp/x' })).toMatchObject({
      port: 5000,
      dataDir: '/tmp/x',
    });
  });
});
