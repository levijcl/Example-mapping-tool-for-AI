import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
  ],
  webServer: {
    command: `rm -rf e2e/.data && pnpm --filter @example-map/web build && PORT=${PORT} DATA_DIR=e2e/.data pnpm exec tsx packages/server/src/main.ts`,
    url: `http://127.0.0.1:${PORT}/api/boards`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
