import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  outputDir: '../../test-results/desktop',
  webServer: {
    command: 'node --import tsx tests/desktop/server.ts',
    cwd: repository,
    url: 'http://127.0.0.1:4310/healthz',
    reuseExistingServer: false,
    timeout: 30_000,
    ...(process.platform === 'win32'
      ? {}
      : { gracefulShutdown: { signal: 'SIGTERM' as const, timeout: 5000 } }),
  },
});
