import { defineConfig } from '@playwright/test';

/** The browser demo account, end to end. Fictional data only; no server or credentials. */
export default defineConfig({
  testDir: './tests/demo',
  workers: 1,
  fullyParallel: false,
  timeout: 120000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5191/',
    browserName: 'chromium',
    viewport: { width: 1280, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command:
      'npm run build --workspace @suite/core --workspace @suite/offline && npm run dev --workspace @suite/web -- --mode operations --port 5191',
    url: 'http://127.0.0.1:5191/',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
