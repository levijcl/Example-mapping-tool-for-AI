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
    // Cross-platform (Windows cmd has no `rm -rf` or `VAR=value cmd`): clear data with Node, pass env via `env`.
    command: `node -e "require('fs').rmSync('e2e/.data', { recursive: true, force: true })" && pnpm --filter @example-map/web build && pnpm exec tsx packages/server/src/main.ts`,
    env: { PORT: String(PORT), DATA_DIR: 'e2e/.data' },
    url: `http://127.0.0.1:${PORT}/api/boards`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
