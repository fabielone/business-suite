import { test, expect, type Page } from '@playwright/test';

/**
 * Walks the showcase story in the browser demo account: every person, the pipeline, an
 * order through production, team queues, money review and the time clock. Fictional data in
 * a fresh browser profile; nothing leaves the browser.
 */
const as = async (page: Page, key: string) => {
  await page.getByLabel('Demo person').selectOption(key);
};
const nav = (page: Page, name: string) =>
  page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('button', { name, exact: true })
    .click();
const save = (page: Page, label = 'Save') =>
  page.locator('form').getByRole('button', { name: label, exact: true }).click();
/** A field in the open form, by its exact label (required fields end in " *"). */
const field = (page: Page, label: string) =>
  page
    .locator('section[role="dialog"] label')
    .filter({
      has: page.locator('span', {
        hasText: new RegExp(`^${label.replace(/[()]/g, '\\$&')}( \\*)?$`),
      }),
    })
    .locator('input, select, textarea');
const card = (page: Page, text: string) => page.locator('article').filter({ hasText: text });

test('the demo account runs the whole showcase end to end', async ({ page }) => {
  // Sign-in screen → demo account.
  await page.goto('/');
  await page.getByRole('button', { name: 'Open the demo account' }).click();
  await expect(page.getByRole('heading', { name: 'Brightline Signs', exact: true })).toBeVisible();
  await expect(page.getByText('Demo account.')).toBeVisible();

  // Sales: a new lead fires the welcome automation; a new deal moves through the pipeline.
  await as(page, 'sales');
  await nav(page, 'People');
  await page.getByRole('button', { name: 'Add contact' }).click();
  await field(page, 'Name').fill('Nadia · example');
  await field(page, 'Contact type').selectOption('lead');
  await save(page);
  await nav(page, 'My work');
  await expect(page.getByText('Call Nadia · example within one business day')).toBeVisible();

  await nav(page, 'Pipeline');
  for (const stage of [
    'New',
    'Contacted',
    'Interested',
    'Site visit',
    'Quote sent',
    'Negotiation',
    'Won',
    'Lost',
  ])
    await expect(
      page.locator('.op-stage header h2', { hasText: new RegExp(`^${stage}$`) }),
    ).toBeVisible();
  await page.getByRole('button', { name: 'New project' }).click();
  await field(page, 'Project').fill('Showcase lobby sign');
  await field(page, 'Customer / contact').selectOption({ label: 'Nadia · example' });
  await field(page, 'Estimated value (MXN)').fill('15000');
  await field(page, 'Pipeline stage').selectOption({ label: 'New' });
  await save(page);
  await card(page, 'Showcase lobby sign').getByRole('button', { name: 'Edit / move' }).click();
  await field(page, 'Pipeline stage').selectOption({ label: 'Quote sent' });
  await save(page);
  await expect(
    page
      .locator('.op-stage')
      .filter({ has: page.locator('h2', { hasText: /^Quote sent$/ }) })
      .getByText('Showcase lobby sign'),
  ).toBeVisible();
  await card(page, 'Showcase lobby sign').getByRole('button', { name: 'Create order' }).click();
  await save(page);

  // Manager: release without deposit, then move the job into Fabrication.
  await as(page, 'manager');
  await nav(page, 'Production');
  await card(page, 'Showcase lobby sign').getByRole('button', { name: 'Release' }).click();
  await field(page, 'Release because').selectOption('manager');
  await field(page, 'Reason').fill('Showcase: approved by the owner.');
  await save(page);
  for (const next of ['Design approved', 'Fabrication'])
    await card(page, 'Showcase lobby sign')
      .getByRole('button', { name: `Move to ${next}` })
      .click();

  // Production lead: the automation assigned the job to Sam and told them; Sam claims queue work.
  await as(page, 'lead');
  await nav(page, 'My work');
  await expect(page.getByText(/Showcase lobby sign.* is ready for fabrication/)).toBeVisible();
  await expect(page.getByText(/Prepare materials for .*Showcase lobby sign/)).toBeVisible();
  await page.getByRole('button', { name: 'Take next' }).first().click();
  await expect(page.getByText('Saved in this browser’s example workspace.')).toBeVisible();

  // Installer: no prices or money, only own jobs and hours; clock out then back in.
  await as(page, 'installer');
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('button', { name: 'Money' }),
  ).toHaveCount(0);
  await nav(page, 'Production');
  await expect(page.getByText(/MX\$/)).toHaveCount(0);
  await nav(page, 'Time clock');
  await expect(page.getByText(/On the clock since/)).toBeVisible();
  await expect(page.locator('.op-clock-chip')).toBeVisible();
  await page.locator('.op-clock').getByRole('button', { name: 'Clock out' }).click();
  await expect(page.getByText('Off the clock')).toBeVisible();
  await page.getByLabel('Working on').selectOption({ index: 1 });
  await page.locator('.op-clock').getByRole('button', { name: 'Clock in' }).click();
  await expect(page.getByText(/On the clock since/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Hours by person' })).toHaveCount(0);

  // Bookkeeper: approve an expense and correct a shift with a reason.
  await as(page, 'finance');
  await nav(page, 'Money');
  await page
    .locator('tr', { hasText: 'Vinyl roll, matte white' })
    .getByRole('button', { name: 'Review' })
    .click();
  await field(page, 'Decision').selectOption('approved');
  await save(page);
  await expect(page.locator('tr', { hasText: 'Vinyl roll, matte white' })).toContainText(
    'Approved',
  );
  await nav(page, 'Time clock');
  await expect(page.getByRole('heading', { name: 'Hours by person' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /On the clock now \(2\)/ })).toBeVisible();
  await page
    .locator('tr', { hasText: 'Sam · example' })
    .getByRole('button', { name: 'Correct' })
    .first()
    .click();
  await field(page, 'Reason').fill('Showcase: forgot to clock out for lunch');
  await save(page, 'Save correction');
  await expect(page.getByText('Corrected: Showcase: forgot to clock out for lunch')).toBeVisible();

  // Owner: the audit trail shows everything; automations are listed; reset starts over.
  await as(page, 'owner');
  await nav(page, 'Activity');
  await expect(page.getByText(/Corrected hours for Sam · example/)).toBeVisible();
  await expect(page.getByText(/Released Showcase lobby sign without deposit/)).toBeVisible();
  await nav(page, 'Automations');
  await expect(page.getByRole('heading', { name: 'Welcome a new lead' })).toBeVisible();

  // Phones: the time clock fits without sideways scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Time clock', exact: true }).first().click();
  await expect(page.locator('.op-clock-timer')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole('button', { name: 'Reset demo' }).click();
  await save(page, 'Reset demo');
  await expect(page.getByText('Demo account reset with fresh fictional data.')).toBeVisible();
  await nav(page, 'Pipeline');
  await expect(page.getByText('Showcase lobby sign')).toHaveCount(0);
});
