import { test, expect } from '@playwright/test';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('three examples persist edits, export drafts and adapt to a phone', async ({ page }) => {
  await page.goto('?examples=1');
  await expect(page.getByRole('heading', { name: 'Insignia', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
  await expect(page.getByText('Reception signage', { exact: true })).toBeVisible();
  await page.getByLabel('Choose workspace').selectOption('household');
  await page.getByRole('button', { name: 'Money', exact: true }).click();
  await page.getByRole('button', { name: 'Record expense', exact: true }).click();
  await page.getByLabel('Description', { exact: false }).fill('Test shared groceries');
  await page.getByLabel('Business / shared amount', { exact: false }).fill('100.01');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Test shared groceries', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Money', exact: true }).click();
  await expect(page.getByText('Test shared groceries', { exact: true })).toBeVisible();
  await page.getByLabel('Choose workspace').selectOption('referrals');
  await page.getByRole('button', { name: 'Referrals', exact: true }).click();
  await page.getByRole('button', { name: 'Compose', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Email draft' })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export draft' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.eml$/);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByRole('button', { name: /Drafts/ }).click();
  await expect(page.getByText('Draft · not sent')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('shared activation, encrypted offline capture and reconnection preserve intent', async ({
  page,
  context,
}) => {
  test.skip(process.env.SUITE_LOCAL_E2E !== '1', 'Explicit local backend opt-in required.');
  const backend = resolve(process.env.SUITE_BACKEND_ROOT || '../backend');
  const config = JSON.parse(readFileSync(resolve(backend, '.local/suite/config.json'), 'utf8'));
  expect(config.suite_local_profile).toBe(1);
  expect(config.public_url).toBe('http://localhost:8002');
  const compose = resolve(backend, '.local/suite/compose.json');
  const sql = (input: string) =>
    execFileSync(
      'docker',
      [
        'compose',
        '-f',
        compose,
        'exec',
        '-T',
        'db',
        'psql',
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-U',
        'postgres',
        '-d',
        'business_suite',
      ],
      { input, encoding: 'utf8' },
    );
  const id = randomUUID(),
    token = randomBytes(32).toString('base64url');
  const email = `browser-${id}@example.com`,
    password = randomBytes(24).toString('base64url');
  const devicePassphrase = randomBytes(24).toString('base64url');
  let userId = '';
  sql(
    `INSERT INTO suite_invitations(id,token_hash,email,role,expires_at) VALUES('${id}','${createHash('sha256').update(token).digest('hex')}','${email}','owner',now()+interval '1 hour');`,
  );
  try {
    await page.goto('#activate=' + token);
    await page.getByLabel('Name · new accounts only').fill('Fictional browser owner');
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Create account & accept' }).click();
    await expect(page.getByLabel('Choose workspace')).toBeVisible();
    const api = '/apps/business_suite/api/v2';
    const identity = await (await context.request.get(api + '/auth/me')).json();
    userId = identity.user.id;
    const workspaceList = await (await context.request.get(api + '/workspaces')).json();
    const home = workspaceList.workspaces.find(
      (e: any) => e.workspace.preset === 'household',
    ).workspace;
    for (const name of ['Example housemate A', 'Example housemate B']) {
      const response = await context.request.post(api + `/workspaces/${home.id}/commands`, {
        data: {
          id: randomUUID(),
          workspaceId: home.id,
          type: 'contact.save',
          payload: { name, kind: 'member' },
        },
      });
      expect(response.ok()).toBeTruthy();
    }
    await page.getByLabel('Choose workspace').selectOption(home.id);
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Enable / unlock offline storage' }).click();
    await page.getByLabel('Device passphrase', { exact: false }).fill(devicePassphrase);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText('Encrypted offline storage is ready on this device.'),
    ).toBeVisible();
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Money', exact: true }).click();
    await page.getByRole('button', { name: 'Record expense', exact: true }).click();
    await page.getByLabel('Description', { exact: false }).fill('Private offline expense fixture');
    await page.getByLabel('Business / shared amount', { exact: false }).fill('90.01');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByText('1 change(s) saved on this device and awaiting acceptance.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Sign out / lock' }).click();
    await page.reload();
    await page.getByRole('button', { name: 'Use saved offline workspace' }).click();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Device passphrase', { exact: true }).fill(devicePassphrase);
    await page.getByRole('button', { name: 'Unlock this device' }).click();
    await expect(
      page.getByText('1 change(s) saved on this device and awaiting acceptance.', { exact: false }),
    ).toBeVisible();
    await context.setOffline(false);
    await page.getByRole('button', { name: /^Device sync/ }).click();
    await page.getByRole('button', { name: 'Synchronize now' }).click();
    await expect(page.getByText('Workspace is up to date.')).toBeVisible();
    await page.getByRole('button', { name: 'Money', exact: true }).click();
    await expect(page.getByText('Private offline expense fixture', { exact: true })).toBeVisible();
    const result = await (await context.request.get(api + `/workspaces/${home.id}`)).json();
    expect(result.data.expenses).toHaveLength(1);
    expect(result.data.expenses[0].amountMinor).toBe(9001);
    await page.getByRole('button', { name: 'Sign out / lock' }).click();
  } finally {
    await context.setOffline(false);
    if (!userId)
      userId =
        sql(`SELECT id FROM auth.users WHERE email='${email}';`).match(
          /[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}/,
        )?.[0] || '';
    if (userId) {
      const tables = [
        'suite_contacts',
        'suite_deals',
        'suite_projects',
        'suite_expense_entries',
        'suite_payments',
        'suite_tasks',
        'suite_referrals',
        'suite_message_templates',
        'suite_message_drafts',
        'suite_companies',
        'suite_intake_keys',
        'suite_space_commands',
        'suite_space_audit',
        'suite_invitations',
        'suite_space_members',
      ];
      sql(
        `BEGIN; SET LOCAL session_replication_role=replica; ${tables.map((table) => `DELETE FROM ${table} WHERE space_id IN (SELECT id FROM suite_spaces WHERE owner_id='${userId}');`).join('\n')} DELETE FROM suite_spaces WHERE owner_id='${userId}'; DELETE FROM suite_invitations WHERE accepted_by='${userId}' OR id='${id}'; DELETE FROM auth.users WHERE id='${userId}'; COMMIT;`,
      );
    } else sql(`DELETE FROM suite_invitations WHERE id='${id}';`);
  }
});
