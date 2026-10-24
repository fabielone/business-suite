import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('built shell reopens offline, persists expense across reload, syncs exactly once', async ({
  page,
  context,
  request,
}, testInfo) => {
  const description = `Offline toll ${randomUUID().slice(0, 8)}`;
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A clearer view of the day.' })).toBeVisible();
  await page.getByLabel('Demo identity').selectOption('worker');
  await expect(page.getByRole('button', { name: 'Record an expense', exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBeTruthy();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel('Demo identity')).toHaveValue('worker');
  await expect(page.getByRole('region', { name: 'Device sync' })).toContainText('Offline');
  await page.getByRole('button', { name: 'Record an expense', exact: true }).click();
  await page.getByLabel('Description', { exact: true }).fill(description);
  await page.getByLabel('Business amount (MXN)', { exact: false }).fill('77.25');
  await page
    .getByLabel('Why is the receipt missing?', { exact: false })
    .fill('Fictional offline capture.');
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Device sync' })).toContainText(description);
  await page.reload();
  const queue = page.getByRole('region', { name: 'Device sync' });
  await expect(queue).toContainText(description);
  await expect(queue).toContainText('waiting to sync');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath('offline-phone.png'), fullPage: true });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBeTruthy();
  await context.setOffline(false);
  await expect(queue.locator('li')).toHaveCount(0);
  const data = await (
    await request.get('http://127.0.0.1:4310/v1/expenses', { headers: { 'x-demo-user': 'worker' } })
  ).json();
  expect(
    data.expenses.filter((e: { description: string }) => e.description === description),
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Sync now', exact: true }).click();
  await expect(queue.locator('li')).toHaveCount(0);
  const again = await (
    await request.get('http://127.0.0.1:4310/v1/expenses', { headers: { 'x-demo-user': 'worker' } })
  ).json();
  expect(
    again.expenses.filter((e: { description: string }) => e.description === description),
  ).toHaveLength(1);
  // The shell cache must contain only static assets, never API payloads.
  const cached = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (key) =>
          (await (await caches.open(key)).keys()).map((r) => r.url),
        ),
      )
    ).flat(),
  );
  expect(cached.some((url) => url.includes('/api/'))).toBeFalsy();
});

test('offline completion remains pending and role caches do not leak prices', async ({
  page,
  context,
  request,
}) => {
  const result = await request.post('http://127.0.0.1:4310/v1/jobs', {
    headers: { 'x-demo-user': 'manager', 'Idempotency-Key': randomUUID() },
    data: {
      title: `Offline installation ${randomUUID().slice(0, 8)}`,
      customerName: 'Fictional client',
      agreedPriceMinor: 12345,
      currency: 'MXN',
      assignedUserIds: ['20000000-0000-4000-8000-000000000002'],
    },
  });
  const { job } = await result.json();
  await page.goto('/');
  await expect(page.getByLabel('Demo identity')).toBeVisible();
  await page.getByLabel('Demo identity').selectOption('worker');
  await expect(page.getByRole('button', { name: 'Record an expense', exact: true })).toBeEnabled();
  await context.setOffline(true);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^Work/ })
    .click();
  await page.getByTestId('job-row').filter({ hasText: job.title }).click();
  await expect(page.getByText('Agreed customer price', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Complete job', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Device sync' })).toContainText('Job completion');
  await expect(page.getByText('This job is complete.', { exact: false })).toHaveCount(0);
  await context.setOffline(false);
  await expect(page.getByText('This job is complete.', { exact: false })).toBeVisible();
});
