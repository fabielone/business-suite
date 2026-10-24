import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/offline',
  workers: 1,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5178', browserName: 'chromium', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'npm run dev:demo --workspace @suite/api',
      url: 'http://127.0.0.1:4310/healthz',
      timeout: 30000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'npm run build:demo && npm run preview:offline',
      url: 'http://127.0.0.1:5178',
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
  ],
});
