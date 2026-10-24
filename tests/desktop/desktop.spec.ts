import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../..', import.meta.url));
const desktop = join(repository, 'apps/desktop');
const executablePath = createRequire(import.meta.url)('electron') as string;
const api = 'http://127.0.0.1:4310';
const workerId = '20000000-0000-4000-8000-000000000002';
const applications = new Set<ElectronApplication>();
const temporaryPaths: string[] = [];

async function temporaryDirectory() {
  const path = await mkdtemp(join(tmpdir(), 'suite-desktop-test-'));
  temporaryPaths.push(path);
  return path;
}

async function appFixture(mode: 'demo' | 'setup') {
  const fixture = await temporaryDirectory();
  await mkdir(join(fixture, 'dist'));
  for (const name of ['main.js', 'preload.js', 'security.js', 'bridge.js']) {
    await cp(join(desktop, 'dist', name), join(fixture, 'dist', name));
  }
  await cp(
    join(repository, 'apps/web', mode === 'demo' ? 'dist-desktop-demo' : 'dist-desktop'),
    join(fixture, 'dist/renderer'),
    { recursive: true },
  );
  await writeFile(join(fixture, 'dist/build-info.json'), JSON.stringify({ mode }));
  await writeFile(
    join(fixture, 'package.json'),
    JSON.stringify({ name: `suite-desktop-${mode}-test`, main: 'dist/main.js', type: 'commonjs' }),
  );
  return fixture;
}

async function launch(profile: string, appDirectory?: string) {
  appDirectory ??= await appFixture('demo');
  const app = await electron.launch({
    executablePath,
    args: [appDirectory, '--demo'],
    cwd: repository,
    env: { ...process.env, SUITE_DESKTOP_TEST_PROFILE: profile },
    chromiumSandbox: true,
    timeout: 30_000,
  });
  applications.add(app);
  const page = await app.firstWindow();
  await page.waitForURL('suite://app/');
  return { app, page };
}

async function close(app: ElectronApplication) {
  await app.close();
  applications.delete(app);
}

async function ready(page: Page) {
  await expect(page.getByRole('heading', { name: 'A clearer view of the day.' })).toBeVisible();
  await expect(page.getByText('Refreshing workspace data…')).toHaveCount(0);
}

async function pendingIds(page: Page) {
  return page.evaluate(async (userId) => {
    const states = await new Promise<
      { owner?: { userId: string }; commands: { id: string; kind: string }[] }[]
    >((resolve, reject) => {
      const opening = indexedDB.open('business-suite-demo-v1');
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const database = opening.result;
        const request = database
          .transaction('workspaces', 'readonly')
          .objectStore('workspaces')
          .getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          resolve(request.result);
          database.close();
        };
      };
    });
    return (
      states
        .find((state) => state.owner?.userId === userId)
        ?.commands.map((command) => command.id)
        .sort() ?? []
    );
  }, workerId);
}

test.beforeEach(async ({ request }) => {
  expect(
    (await request.post(`${api}/__test/network`, { data: { unavailable: false } })).ok(),
  ).toBeTruthy();
});

test.afterEach(async ({ request }, info) => {
  for (const app of applications) {
    if (info.status !== info.expectedStatus) {
      const page = app.windows()[0];
      if (page)
        await page
          .screenshot({ path: info.outputPath('failure.png'), fullPage: true })
          .catch(() => undefined);
    }
    await app.close().catch(() => undefined);
  }
  applications.clear();
  await request
    .post(`${api}/__test/network`, { data: { unavailable: false } })
    .catch(() => undefined);
  for (const path of temporaryPaths.splice(0)) await rm(path, { recursive: true, force: true });
});

test('sandboxed desktop renderer exposes only the narrow bridge and blocks navigation/windows', async ({
  request,
}, info) => {
  const { app, page } = await launch(await temporaryDirectory());
  await ready(page);
  const preferences = await app.evaluate(({ BrowserWindow, app }) => {
    const preferences = BrowserWindow.getAllWindows()[0]!.webContents.getLastWebPreferences();
    return {
      sandbox: preferences.sandbox,
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      webSecurity: preferences.webSecurity,
      webviewTag: preferences.webviewTag,
      noSandboxFlag: app.commandLine.hasSwitch('no-sandbox'),
    };
  });
  expect(preferences).toEqual({
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    webSecurity: true,
    webviewTag: false,
    noSandboxFlag: false,
  });
  const surface = await page.evaluate(() => {
    const global = window as unknown as Record<string, unknown>;
    return {
      require: typeof global.require,
      process: typeof global.process,
      Buffer: typeof global.Buffer,
      ipcRenderer: typeof global.ipcRenderer,
      bridge: Object.keys(global.suiteDesktop as object).sort(),
      frozen: Object.isFrozen(global.suiteDesktop),
    };
  });
  expect(surface).toEqual({
    require: 'undefined',
    process: 'undefined',
    Buffer: 'undefined',
    ipcRenderer: 'undefined',
    bridge: ['mode', 'platform', 'request'],
    frozen: true,
  });
  await page.getByRole('link', { name: 'Skip to content' }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => location.href)).toBe('suite://app/#main');
  expect(
    await page.evaluate(
      async () =>
        (
          await (
            window as unknown as {
              suiteDesktop: { request: (input: unknown) => Promise<{ status: number }> };
            }
          ).suiteDesktop.request({ path: '/workspace', role: 'manager' })
        ).status,
    ),
  ).toBe(200);
  const trafficBefore = (await (await request.get(`${api}/__test/traffic`)).json()).traffic.length;
  const invalidStatuses = await page.evaluate(async () => {
    const bridge = (
      window as unknown as {
        suiteDesktop: { request: (input: unknown) => Promise<{ status: number }> };
      }
    ).suiteDesktop;
    const invalid = [
      null,
      { path: 'https://example.invalid/', role: 'worker' },
      { path: '/workspace', role: 'worker', url: 'file:///etc/passwd' },
      { path: '/workspace', role: 'admin' },
      { path: '/expenses', role: 'worker', body: { description: 'missing command key' } },
    ];
    return Promise.all(invalid.map(async (input) => (await bridge.request(input)).status));
  });
  expect(invalidStatuses).toEqual([400, 400, 400, 400, 400]);
  expect((await (await request.get(`${api}/__test/traffic`)).json()).traffic.length).toBe(
    trafficBefore,
  );
  const blockedFetch = await page.evaluate(async () => {
    try {
      await fetch('http://127.0.0.1:4310/v1/workspace');
      return false;
    } catch {
      return true;
    }
  });
  expect(blockedFetch).toBeTruthy();
  expect(await page.evaluate(() => window.open('https://example.invalid/') === null)).toBeTruthy();
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  await page.screenshot({ path: info.outputPath('desktop-workspace.png'), fullPage: true });
  await page.evaluate(() => {
    window.location.href = 'https://example.invalid/';
  });
  // Electron cancellation can leave Playwright's pending-navigation URL empty;
  // inspect both the actual document and Electron's committed webContents URL.
  await expect.poll(() => page.evaluate(() => location.href)).toBe('suite://app/#main');
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0]!.webContents.getURL(),
    ),
  ).toBe('suite://app/#main');
  expect(await page.evaluate(() => document.querySelector('h1')?.textContent)).toBe(
    'A clearer view of the day.',
  );
});

test('setup artifact refuses business requests even when launched with --demo', async ({
  request,
}, info) => {
  const fixture = await appFixture('setup');
  const before = (await (await request.get(`${api}/__test/traffic`)).json()).traffic.length;
  const { page } = await launch(await temporaryDirectory(), fixture);
  await expect(
    page.getByRole('heading', { name: 'A foundation for your business.' }),
  ).toBeVisible();
  const result = await page.evaluate(async () => {
    const bridge = (
      window as unknown as {
        suiteDesktop: { mode: string; request: (input: unknown) => Promise<{ status: number }> };
      }
    ).suiteDesktop;
    return {
      mode: bridge.mode,
      status: (await bridge.request({ path: '/workspace', role: 'manager' })).status,
    };
  });
  expect(result).toEqual({ mode: 'setup', status: 403 });
  await expect(page.getByLabel('Demo identity')).toHaveCount(0);
  expect((await (await request.get(`${api}/__test/traffic`)).json()).traffic.length).toBe(before);
  await page.screenshot({ path: info.outputPath('desktop-setup.png'), fullPage: true });
});

test('offline expense and completion survive app restart, stay account-scoped and sync exactly once', async ({
  request,
}, info) => {
  const profile = await temporaryDirectory();
  const description = `Desktop toll ${randomUUID().slice(0, 8)}`;
  const created = await request.post(`${api}/v1/jobs`, {
    headers: { 'x-demo-user': 'manager', 'Idempotency-Key': randomUUID() },
    data: {
      title: `Desktop installation ${randomUUID().slice(0, 8)}`,
      customerName: 'Fictional desktop client',
      agreedPriceMinor: 34567,
      currency: 'MXN',
      assignedUserIds: [workerId],
    },
  });
  expect(created.status()).toBe(201);
  const { job } = await created.json();
  const beforeWorkspace = await (
    await request.get(`${api}/v1/workspace`, { headers: { 'x-demo-user': 'worker' } })
  ).json();
  let { app, page } = await launch(profile);
  await ready(page);
  await page.getByLabel('Demo identity').selectOption('worker');
  await ready(page);
  await expect(page.getByRole('button', { name: 'Record an expense', exact: true })).toBeEnabled();
  await request.post(`${api}/__test/network`, { data: { unavailable: true } });
  expect((await request.get(`${api}/v1/workspace`)).status()).toBe(503);
  await page.getByRole('button', { name: 'Record an expense', exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill(description);
  await page.getByLabel('Business amount (MXN)', { exact: false }).fill('77.25');
  await page
    .getByLabel('Why is the receipt missing?', { exact: false })
    .fill('Fictional desktop outage test.');
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Device sync' })).toContainText(description);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^Work/ })
    .click();
  await page.getByTestId('job-row').filter({ hasText: job.title }).click();
  await expect(page.getByText('Agreed customer price', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Complete job', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Device sync' }).locator('li')).toHaveCount(2);
  await expect(page.getByText('This job is complete.', { exact: false })).toHaveCount(0);
  const idsBefore = await pendingIds(page);
  expect(idsBefore).toHaveLength(2);
  await page.getByLabel('Demo identity').selectOption('manager');
  await ready(page);
  await expect(page.getByRole('region', { name: 'Device sync' })).not.toContainText(description);
  await page.getByLabel('Demo identity').selectOption('worker');
  await ready(page);
  await expect(page.getByRole('region', { name: 'Device sync' })).toContainText(description);
  await close(app);

  ({ app, page } = await launch(profile));
  await ready(page);
  // The fictional picker is tab-session state, while each account's queue is durable.
  if ((await page.getByLabel('Demo identity').inputValue()) !== 'worker')
    await page.getByLabel('Demo identity').selectOption('worker');
  await ready(page);
  await expect(page.getByLabel('Demo identity')).toHaveValue('worker');
  const queue = page.getByRole('region', { name: 'Device sync' });
  await expect(queue.locator('li')).toHaveCount(2);
  expect(await pendingIds(page)).toEqual(idsBefore);
  await expect(queue).toContainText(description);
  await page.screenshot({ path: info.outputPath('desktop-offline-reopened.png'), fullPage: true });
  await request.post(`${api}/__test/network`, { data: { unavailable: false } });
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(queue.locator('li')).toHaveCount(0);
  const afterWorkspace = await (
    await request.get(`${api}/v1/workspace`, { headers: { 'x-demo-user': 'worker' } })
  ).json();
  expect(afterWorkspace.demoSessionId).toBe(beforeWorkspace.demoSessionId);
  const records = await (
    await request.get(`${api}/v1/expenses`, { headers: { 'x-demo-user': 'worker' } })
  ).json();
  const expense = records.expenses.filter(
    (entry: { description: string }) => entry.description === description,
  );
  expect(expense).toHaveLength(1);
  expect(expense[0]).toMatchObject({
    amountMinor: 7725,
    status: 'submitted',
    payerUserId: workerId,
  });
  const jobs = await (
    await request.get(`${api}/v1/jobs`, { headers: { 'x-demo-user': 'worker' } })
  ).json();
  expect(jobs.jobs.find((entry: { id: string }) => entry.id === job.id)).toMatchObject({
    status: 'completed',
    version: job.version + 1,
  });
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(queue.locator('li')).toHaveCount(0);
  const again = await (
    await request.get(`${api}/v1/expenses`, { headers: { 'x-demo-user': 'worker' } })
  ).json();
  expect(
    again.expenses.filter((entry: { description: string }) => entry.description === description),
  ).toHaveLength(1);
  const writes = (await (await request.get(`${api}/__test/traffic`)).json()).traffic.filter(
    (entry: { method: string; key: string }) =>
      entry.method === 'POST' && idsBefore.includes(entry.key),
  );
  expect(new Set(writes.map((entry: { key: string }) => entry.key)).size).toBe(2);
  await page.screenshot({ path: info.outputPath('desktop-reconnected.png'), fullPage: true });
});
