import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleData,
  executeCommand,
  workspaceData,
  authorizeCommand,
  guessRecordMapping,
  mapRecordRows,
  normalizeRecordRow,
  parseImportAmount,
  parseImportDate,
  previewRecordImport,
  ROLE_GRANTS,
  type SuiteData,
  type Actor,
} from '../src/operations/index.js';

const NOW = '2026-11-17T12:00:00Z';
const insignia = () => {
  const all = sampleData(NOW);
  return workspaceData(
    all,
    all.workspaces.find((w) => w.id === 'insignia')!,
  );
};
let n = 0;
const as = (role: string): Actor => ({ grants: ROLE_GRANTS[role]!, email: '' });
const act = (
  data: SuiteData,
  actor: Actor,
  type: string,
  payload: Record<string, unknown>,
  id = `record-import-${++n}`,
) => {
  const command = { id, workspaceId: 'insignia', type, payload };
  authorizeCommand(data, command, actor);
  return executeCommand(data, command, NOW);
};
const ws = (d: SuiteData) => d.workspaces[0]!;
const row = (over: Record<string, unknown>) => ({
  title: '',
  amountMinor: 0,
  stage: '',
  due: '',
  notes: '',
  customerName: '',
  customerEmail: '',
  customerPhone: '',
  company: '',
  ...over,
});

test('amounts become integer minor units and ambiguous text is refused', () => {
  assert.equal(parseImportAmount('12500'), 1250000);
  assert.equal(parseImportAmount('$12,500.50'), 1250050);
  assert.equal(parseImportAmount('1,234,567.8 MXN'), 123456780);
  assert.equal(parseImportAmount('1200,5'), 120050);
  assert.equal(parseImportAmount('0.07'), 7);
  assert.equal(parseImportAmount('19.99'), 1999);
  assert.equal(parseImportAmount(''), 0);
  // 1.234 could be one thousand or one and a bit; negative and worded amounts are not money.
  for (const bad of ['1.234', '1.234,56', '-50', '12k', 'abc', '$', '1,23,456', '9999999999999'])
    assert.equal(parseImportAmount(bad), null, bad);
});

test('dates follow the chosen day/month order and impossible dates are refused', () => {
  assert.equal(parseImportDate('2026-03-04'), '2026-03-04');
  assert.equal(parseImportDate('2026-3-4 10:00'), '2026-03-04');
  assert.equal(parseImportDate('03/04/2026', 'dmy'), '2026-04-03');
  assert.equal(parseImportDate('03/04/2026', 'mdy'), '2026-03-04');
  assert.equal(parseImportDate(''), '');
  for (const bad of ['31/02/2026', '2026-13-01', 'next week', '03/04/26'])
    assert.equal(parseImportDate(bad), null, bad);
});

test('English and Spanish headers map to record fields; orders have no stage column', () => {
  assert.deepEqual(
    guessRecordMapping(['Deal Name', 'Amount', 'Deal Stage', 'Close Date', 'Email'], 'deals'),
    ['title', 'amount', 'stage', 'due', 'customerEmail'],
  );
  assert.deepEqual(
    guessRecordMapping(['Pedido', 'Precio', 'Estado', 'Fecha de entrega', 'Cliente'], 'orders'),
    ['title', 'amount', '', 'due', 'customerName'],
  );
  assert.deepEqual(mapRecordRows([['Sign', ' 100 ']], ['title', 'amount']), [
    { title: 'Sign', amount: '100' },
  ]);
  assert.equal(normalizeRecordRow({ amount: '5' }).error, 'Needs a title.');
  assert.match(normalizeRecordRow({ title: 'A', amount: '5k' }).error, /Amount/);
  assert.match(normalizeRecordRow({ title: 'A', due: '31/02/2026' }).error, /Date/);
});

test('project import adds deals in the named stage, creates customers once and is repeatable', () => {
  const data = insignia();
  const stage = ws(data).stages[1]!;
  const rows = [
    row({
      row: 2,
      title: 'Lobby sign',
      amountMinor: 1250050,
      stage: stage.name,
      due: '2026-12-01',
      customerName: 'Nora Vale',
      customerEmail: 'nora@example.com',
      company: 'Vale Studio',
    }),
    row({
      row: 3,
      title: 'Window vinyl',
      customerName: 'Nora Vale',
      customerEmail: 'NORA@example.com',
    }),
    row({ row: 4, title: 'Banner', customerName: 'Walk-in Person' }),
  ];
  const next = act(data, as('collaborator'), 'deal.import', { rows, source: 'old-pipeline.csv' });
  const added = next.deals.filter((d) => !data.deals.some((o) => o.id === d.id));
  assert.equal(added.length, 3);
  const lobby = added.find((d) => d.title === 'Lobby sign')!;
  assert.equal(lobby.amountMinor, 1250050);
  assert.equal(lobby.stageId, stage.id);
  assert.equal(lobby.projectId, '');
  // No stage in the file means the first stage.
  assert.equal(added.find((d) => d.title === 'Banner')!.stageId, ws(data).stages[0]!.id);
  const nora = next.contacts.filter((c) => c.email === 'nora@example.com');
  assert.equal(nora.length, 1);
  assert.equal(nora[0]!.kind, 'lead');
  assert.equal(nora[0]!.source, 'old-pipeline.csv');
  assert.equal(added.filter((d) => d.contactId === nora[0]!.id).length, 2);
  assert.equal(next.companies!.filter((c) => c.name === 'Vale Studio').length, 1);
  assert.match(next.audit.at(-1)!.summary, /old-pipeline\.csv: 3 projects added, 0 already here/);
  // No order, payment or task appears because of an import.
  assert.equal(next.projects.length, data.projects.length);
  assert.equal(next.payments.length, data.payments.length);
  assert.equal(next.tasks.length, data.tasks.length);

  const preview = previewRecordImport(next, ws(next), 'deals', [
    { title: 'Lobby sign', customerEmail: 'nora@example.com' },
    { title: 'Banner', customerName: 'walk-in person' },
    { title: 'New thing', customerEmail: 'nora@example.com' },
    { title: 'New thing', customerEmail: 'nora@example.com' },
    { title: 'Odd', stage: 'No such stage' },
  ]);
  assert.deepEqual(
    preview.map((r) => r.status),
    ['existing', 'existing', 'new', 'repeated', 'new'],
  );
  assert.match(preview[4]!.error, /not in this pipeline/);

  const again = act(next, as('collaborator'), 'deal.import', { rows, source: 'old-pipeline.csv' });
  assert.equal(again.deals.length, next.deals.length);
  assert.equal(again.contacts.length, next.contacts.length);
  assert.match(again.audit.at(-1)!.summary, /0 projects added, 3 already here/);
});

test('order import creates unreleased orders with the agreed price and nothing else', () => {
  const data = insignia();
  const next = act(data, as('manager'), 'project.import', {
    rows: [
      row({
        title: 'Storefront letters',
        amountMinor: 4800000,
        due: '2026-12-15',
        customerName: 'Omar Pike',
        customerPhone: '+52 55 1234 5678',
      }),
      row({ title: 'Fleet decals', amountMinor: 900000, company: 'Pike Logistics' }),
      row({ title: 'Fleet decals', amountMinor: 700000, company: 'Other Fleet Co' }),
    ],
    source: 'orders.csv',
  });
  const added = next.projects.filter((o) => !data.projects.some((x) => x.id === o.id));
  assert.equal(added.length, 3);
  for (const order of added) {
    assert.equal(order.status, 'planned');
    assert.equal(order.release, undefined);
    assert.equal(order.dealId, '');
    assert.deepEqual(
      order.jobs!.map((j) => j.stage),
      ['Awaiting release'],
    );
  }
  assert.equal(new Set(added.map((o) => o.number)).size, 3);
  assert.equal(added[0]!.amountMinor, 4800000);
  assert.equal(next.contacts.find((c) => c.name === 'Omar Pike')!.kind, 'customer');
  // Company-only rows keep the company name and are told apart by it.
  assert.equal(added[1]!.contactId, '');
  assert.match(added[1]!.notes, /Company: Pike Logistics/);
  assert.match(added[2]!.notes, /Company: Other Fleet Co/);
  assert.equal(next.payments.length, data.payments.length);
  assert.equal(next.expenses.length, data.expenses.length);
});

test('imports need the record permission and contacts.write, and reject bad rows whole', () => {
  const data = insignia();
  const one = { rows: [row({ title: 'X' })] };
  // Viewer and production cannot import; finance has no pipeline or order write access.
  for (const role of ['viewer', 'production', 'lead', 'finance']) {
    assert.throws(() => act(data, as(role), 'deal.import', one), role);
    assert.throws(() => act(data, as(role), 'project.import', one), role);
  }
  const noContacts: Actor = { grants: ['crm.write', 'work.write'], email: '' };
  assert.throws(() => act(data, noContacts, 'deal.import', one));
  assert.throws(() => act(data, noContacts, 'project.import', one));

  const bad = (rows: unknown[]) => () => act(data, as('manager'), 'deal.import', { rows });
  assert.throws(bad([row({ title: 'Ok' }), row({ row: 9, title: '' })]), /Row 9/);
  assert.throws(bad([row({ title: 'A', amountMinor: 12.5 })]), /Row 1.*minor units/);
  assert.throws(bad([row({ title: 'A', amountMinor: -1 })]), /Row 1/);
  assert.throws(bad([row({ title: 'A', due: '12/01/2026' })]), /Row 1.*calendar date/);
  assert.throws(bad([row({ title: 'A', stage: 'Nope' })]), /not in this pipeline/);
  assert.throws(
    bad([row({ title: 'A', customerName: 'B', customerEmail: 'not-an-email' })]),
    /Row 1/,
  );
  assert.throws(bad([]), /between 1 and/);
  assert.throws(bad(Array.from({ length: 501 }, () => row({ title: 'A' }))), /between 1 and/);
});

test('imports do not start automations', () => {
  let data = insignia();
  const stage = ws(data).stages[1]!;
  data = act(data, as('manager'), 'automation.save', {
    name: 'Stage note',
    enabled: true,
    trigger: { type: 'deal.stage', stageId: stage.id },
    conditions: [],
    wait: { amount: 0, unit: 'days' },
    actions: [{ type: 'note.add', text: 'Rule ran' }],
  });
  // Control: the rule does fire for a project a person saves into that stage.
  const saved = act(data, as('manager'), 'deal.save', {
    title: 'Saved by hand',
    contactId: '',
    amountMinor: 0,
    stageId: stage.id,
    due: '',
    notes: '',
  });
  const ruleNotes = (d: SuiteData) =>
    d.audit.filter((e) => e.summary.endsWith('Note: Rule ran')).length;
  assert.equal(ruleNotes(saved), ruleNotes(data) + 1);
  assert.equal(saved.automationRuns.length, data.automationRuns.length + 1);

  const next = act(data, as('manager'), 'deal.import', {
    rows: [row({ title: 'Imported into stage', stage: stage.name })],
  });
  assert.ok(next.deals.some((d) => d.title === 'Imported into stage'));
  assert.equal(ruleNotes(next), ruleNotes(data));
  assert.equal(next.automationRuns.length, data.automationRuns.length);
});
