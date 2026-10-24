import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const apiBase = 'http://127.0.0.1:4310/v1';
async function openWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'A clearer view of the day.' })).toBeVisible();
  await expect(page.getByText('Refreshing workspace data…')).toHaveCount(0);
}
async function switchRole(page: Page, role: 'manager' | 'worker') {
  await page.getByLabel('Demo identity').selectOption(role);
  await expect(page.getByRole('heading', { name: 'A clearer view of the day.' })).toBeVisible();
  await expect(page.getByText('Refreshing workspace data…')).toHaveCount(0);
}
async function fillExpense(page: Page, description: string) {
  await page.getByLabel('Description', { exact: true }).fill(description);
  await page.getByLabel('Business amount (MXN)', { exact: false }).fill('128.50');
  await page
    .getByLabel('Why is the receipt missing?', { exact: false })
    .fill('Fictional example: the paper receipt was lost.');
}

test.beforeEach(async ({ request }) => {
  await expect
    .poll(
      async () => {
        try {
          return (
            await request.get(`${apiBase}/workspace`, { headers: { 'x-demo-user': 'manager' } })
          ).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);
});

test('manager assigns a job; worker completes it and submits an expense; manager reviews', async ({
  page,
}) => {
  const jobTitle = `Installation ${randomUUID().slice(0, 8)}`;
  const expenseTitle = `Materials ${randomUUID().slice(0, 8)}`;
  await openWorkspace(page);
  await expect(page.getByText('LOCAL DEMO', { exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^Work/ })
    .click();
  await page.getByRole('button', { name: 'New job', exact: true }).click();
  await page.getByLabel('Job title', { exact: true }).fill(jobTitle);
  await page.getByLabel('Customer name', { exact: true }).fill('Fictional storefront');
  await page.getByLabel('Agreed price (MXN)', { exact: false }).fill('3500.00');
  await page.getByRole('dialog').getByRole('checkbox', { name: /Sam/ }).check();
  await page.getByRole('button', { name: 'Create job', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A clearer view of the day.' })).toBeVisible();
  await switchRole(page, 'worker');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^Work/ })
    .click();
  await expect(page.getByRole('button', { name: 'New job', exact: true })).toHaveCount(0);
  await expect(page.getByText('AGREED PRICE', { exact: true })).toHaveCount(0);
  await page.getByTestId('job-row').filter({ hasText: jobTitle }).click();
  await expect(page.getByText('Agreed customer price', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Complete job', exact: true }).click();
  await expect(page.getByText('This job is complete.', { exact: false })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Money', exact: true })
    .click();
  await page.getByRole('button', { name: 'Add expense', exact: true }).click();
  await fillExpense(page, expenseTitle);
  await page.getByLabel('Related job', { exact: false }).selectOption({ label: jobTitle });
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const submitted = page.getByTestId('expense-row').filter({ hasText: expenseTitle });
  await expect(submitted).toContainText('Needs review');
  await expect(submitted.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await switchRole(page, 'manager');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Money', exact: true })
    .click();
  await page
    .getByTestId('expense-row')
    .filter({ hasText: expenseTitle })
    .getByRole('button', { name: 'Approve', exact: true })
    .click();
  await page.getByLabel(/Review note/).fill('Materials confirmed for the assigned work.');
  await page.getByRole('button', { name: 'Approve expense', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('expense-row').filter({ hasText: expenseTitle })).toContainText(
    'Approved',
  );
  await expect(
    page.getByRole('status').filter({ hasText: 'Approval does not record a payment.' }),
  ).toBeVisible();
  await switchRole(page, 'worker');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Money', exact: true })
    .click();
  await expect(page.getByTestId('expense-row').filter({ hasText: expenseTitle })).toContainText(
    'Materials confirmed for the assigned work.',
  );
});

test('lost response keeps the draft and retries one expense with the same command key', async ({
  page,
  request,
}) => {
  const description = `Retry expense ${randomUUID().slice(0, 8)}`;
  const keys: string[] = [];
  let attempts = 0;
  await openWorkspace(page);
  await switchRole(page, 'worker');
  await page.getByRole('button', { name: 'Record an expense', exact: true }).click();
  await fillExpense(page, description);
  await page.route('**/api/v1/expenses', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts++;
    keys.push(route.request().headers()['idempotency-key']);
    if (attempts === 1) {
      const response = await route.fetch(); // Commit on the API, then lose only the response.
      expect(response.ok()).toBeTruthy();
      return route.abort('failed');
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('could not be reached');
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue(description);
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[0]).toBe(keys[1]);
  const response = await request.get(`${apiBase}/expenses`, {
    headers: { 'x-demo-user': 'worker' },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(
    body.expenses.filter((expense: { description: string }) => expense.description === description),
  ).toHaveLength(1);
});

test('stale job completion is rejected and refresh resolves the conflict', async ({
  page,
  request,
}) => {
  const header = { 'x-demo-user': 'manager', 'Idempotency-Key': randomUUID() };
  const created = await request.post(`${apiBase}/jobs`, {
    headers: header,
    data: {
      title: `Conflict ${randomUUID().slice(0, 8)}`,
      customerName: 'Fictional customer',
      agreedPriceMinor: 45000,
      currency: 'MXN',
      assignedUserIds: [],
    },
  });
  expect(created.ok()).toBeTruthy();
  const { job } = await created.json();
  await openWorkspace(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: /^Work/ })
    .click();
  await page.getByTestId('job-row').filter({ hasText: job.title }).click();
  const closed = await request.post(`${apiBase}/jobs/${job.id}/close`, {
    headers: { ...header, 'Idempotency-Key': randomUUID() },
    data: { version: job.version },
  });
  expect(closed.ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Complete job', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByText('This job is complete.', { exact: false })).toBeVisible();
});

test('API unavailability shows an error instead of substituting demo records', async ({ page }) => {
  await page.route('**/api/v1/workspace', (route) => route.abort('failed'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Let’s get connected.' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('could not be reached');
  await expect(page.getByTestId('job-row')).toHaveCount(0);
  await page.unroute('**/api/v1/workspace');
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'A clearer view of the day.' })).toBeVisible();
});

test('membership rejection clears previously visible workspace data', async ({ page }) => {
  await openWorkspace(page);
  await page.route('**/api/v1/workspace', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'BUSINESS_ACCESS_DENIED', message: 'Active membership required.' },
      }),
    }),
  );
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Let’s get connected.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Work in motion' })).toHaveCount(0);
});

test('desktop and phone layouts expose usable actions without horizontal overflow', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openWorkspace(page);
  await page.screenshot({ path: testInfo.outputPath('desktop-overview.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await switchRole(page, 'worker');
  await expect(page.getByLabel('Demo identity')).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  await expect(
    page.getByRole('heading', { name: 'Keep the details close to the work.', exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('phone-overview.png'), fullPage: true });
  await page.getByRole('button', { name: 'Record an expense', exact: true }).click();
  await fillExpense(page, 'Fictional phone expense');
  await expect(page.getByRole('button', { name: 'Submit for review', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('phone-expense.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test('production-mode web refuses the demo identity switch and makes no data requests', async ({
  page,
}) => {
  const businessRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/')) businessRequests.push(request.url());
  });
  await page.goto('http://127.0.0.1:5179');
  await expect(
    page.getByRole('heading', { name: 'A foundation for your business.' }),
  ).toBeVisible();
  await expect(page.getByLabel('Demo identity')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
  expect(businessRequests).toEqual([]);
});

test('expense review conflict can refresh in place without losing the reviewer draft', async ({
  page,
  request,
}) => {
  const created = await request.post(`${apiBase}/expenses`, {
    headers: { 'x-demo-user': 'worker', 'Idempotency-Key': randomUUID() },
    data: {
      description: `Review conflict ${randomUUID().slice(0, 8)}`,
      amountMinor: 7200,
      currency: 'MXN',
      missingReceiptReason: 'Fictional receipt missing.',
    },
  });
  expect(created.ok()).toBeTruthy();
  const { expense } = await created.json();
  await openWorkspace(page);
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name: 'Money', exact: true })
    .click();
  await page
    .getByTestId('expense-row')
    .filter({ hasText: expense.description })
    .getByRole('button', { name: 'Reject', exact: true })
    .click();
  await page.getByLabel(/Review note/).fill('Keep this draft while resolving the conflict.');
  const reviewed = await request.post(`${apiBase}/expenses/${expense.id}/review`, {
    headers: { 'x-demo-user': 'manager', 'Idempotency-Key': randomUUID() },
    data: {
      version: expense.version,
      decision: 'approve',
      reason: 'Approved from a second session.',
    },
  });
  expect(reviewed.ok()).toBeTruthy();
  await page.getByRole('button', { name: 'Reject expense', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('changed');
  await page.getByRole('button', { name: 'Refresh expense', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('already approved');
  await expect(page.getByLabel(/Review note/)).toHaveValue(
    'Keep this draft while resolving the conflict.',
  );
  await expect(page.getByRole('button', { name: 'Reject expense', exact: true })).toBeDisabled();
});
