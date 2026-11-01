import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/operations',
  workers: 1,
  fullyParallel: false,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8002/apps/business_suite/api/app/',
    browserName: 'chromium',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
