import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleData,
  executeCommand,
  validateData,
  workspaceData,
  authorizeCommand,
  projectForActor,
  parseCsv,
  parseVCards,
  guessMapping,
  mapRows,
  previewImport,
  normalizeLead,
  ROLE_GRANTS,
  type SuiteData,
  type Actor,
} from '../src/operations/index.js';

const NOW = '2026-11-03T12:00:00Z';
const insignia = () => {
  const all = sampleData(NOW);
  return workspaceData(
    all,
    all.workspaces.find((w) => w.id === 'insignia')!,
  );
};
let n = 0;
const as = (role: string, email = ''): Actor => ({ grants: ROLE_GRANTS[role]!, email });
const act = (
  data: SuiteData,
  actor: Actor,
  type: string,
  payload: Record<string, unknown>,
  id = `intake-${++n}`,
) => {
  const command = { id, workspaceId: 'insignia', type, payload };
  authorizeCommand(data, command, actor);
  return executeCommand(data, command, NOW);
};
const people = (d: SuiteData) => d.contacts.filter((c) => c.workspaceId === 'insignia');

test('CSV parsing handles quotes, embedded newlines, BOM and semicolon exports', () => {
  assert.deepEqual(parseCsv('﻿Name,Notes\r\n"Ana, R.","Line 1\nLine ""2"""\r\n\r\n'), [
    ['Name', 'Notes'],
    ['Ana, R.', 'Line 1\nLine "2"'],
  ]);
  assert.deepEqual(parseCsv('Nombre;Correo\nLuis;luis@example.com'), [
    ['Nombre', 'Correo'],
    ['Luis', 'luis@example.com'],
  ]);
  assert.deepEqual(parseCsv('a\tb\n1\t2'), [
    ['a', 'b'],
    ['1', '2'],
  ]);
});

test('common CRM and spreadsheet headers map to Person and Company fields', () => {
  assert.deepEqual(
    guessMapping([
      'First Name',
      'Last Name',
      'Email Address',
      'Phone Number',
      'Company Name',
      'Job Title',
      'Website URL',
      'Unknown',
    ]),
    ['firstName', 'lastName', 'email', 'phone', 'company', 'position', 'companyUrl', ''],
  );
  assert.deepEqual(guessMapping(['Nombre', 'Teléfono', 'Empresa', 'Correo electrónico']), [
    'firstName',
    'phone',
    'company',
    'email',
  ]);
  const [row] = mapRows(
    [['Ana', 'Ruiz', 'ANA@Example.com', 'Acme', 'acme.mx']],
    ['firstName', 'lastName', 'email', 'company', 'companyUrl'],
  );
  const lead = normalizeLead(row!);
  assert.equal(lead.person?.name, 'Ana Ruiz');
  assert.equal(lead.person?.email, 'ana@example.com');
  assert.equal(lead.company?.url, 'https://acme.mx');
});

test('vCards from phone address books become rows', () => {
  const rows = parseVCards(
    'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Ruiz;Ana;;;\r\nFN:Ana Ruiz\r\nORG:Acme\\, S.A.;Ventas\r\nTITLE:Directora\r\nEMAIL;TYPE=WORK:ana@example.com\r\nTEL;TYPE=CELL:+52 55 1234 5678\r\nADR;TYPE=WORK:;;Calle 1;CDMX;;06000;México\r\nEND:VCARD\r\nBEGIN:VCARD\r\nFN:Luis\r\nEND:VCARD',
  );
  assert.equal(rows.length, 2);
  assert.equal(rows[0]!.company, 'Acme, S.A.');
  assert.equal(normalizeLead(rows[0]!).company?.address, 'Calle 1, CDMX, 06000, México');
});

test('import creates companies once, links people and skips or updates duplicates', () => {
  const data = insignia();
  const rows = [
    { name: 'Ana Ruiz', email: 'ana@example.com', company: 'Acme Signs', position: 'Owner' },
    { name: 'Beto Gil', phone: '55 1111 2222', company: 'ACME signs' },
    { name: 'Ana R.', email: 'ANA@example.com', company: 'Acme Signs' },
    { company: 'Solo Co', email: 'hola@solo.example' },
  ];
  const preview = previewImport(data, 'insignia', rows);
  assert.deepEqual(
    preview.map((r) => [r.person, r.company, r.repeated, r.error]),
    [
      ['new', 'new', false, ''],
      ['new', 'new', false, ''],
      ['new', 'new', true, ''],
      ['none', 'new', false, ''],
    ],
  );
  const next = act(data, as('collaborator'), 'contact.import', { rows, source: 'leads.csv' });
  const acme = next.companies.filter((c) => c.name.toLowerCase() === 'acme signs');
  assert.equal(acme.length, 1);
  const ana = people(next).filter((c) => c.email === 'ana@example.com');
  assert.equal(ana.length, 1, 'duplicate email in the same file is skipped');
  assert.equal(ana[0]!.name, 'Ana Ruiz');
  assert.equal(ana[0]!.companyId, acme[0]!.id);
  assert.equal(ana[0]!.source, 'leads.csv');
  assert.equal(acme[0]!.primaryContactId, ana[0]!.id);
  assert.equal(next.companies.find((c) => c.name === 'Solo Co')?.email, 'hola@solo.example');
  validateData(next);

  const updated = act(next, as('collaborator'), 'contact.import', {
    rows: [{ name: 'Ana Ruiz', email: 'ana@example.com', phone: '+52 1' }],
    existing: 'update',
  });
  assert.equal(people(updated).find((c) => c.email === 'ana@example.com')!.phone, '+52 1');
  assert.equal(people(updated).length, people(next).length);
});

test('an invalid row rejects the whole batch with its row number', () => {
  assert.throws(
    () =>
      act(insignia(), as('manager'), 'contact.import', {
        rows: [{ name: 'Ok' }, { name: 'Bad', email: 'not-an-email' }],
        offset: 500,
      }),
    /Row 502: Email is not valid/,
  );
  assert.throws(() => act(insignia(), as('viewer'), 'contact.import', { rows: [{ name: 'X' }] }));
});

test('lead capture adds a person, company and project but never edits known records', () => {
  const data = insignia();
  const next = act(data, as('manager'), 'lead.capture', {
    source: 'Website form',
    fields: {
      fullName: 'Carla Paz',
      email: 'carla@example.com',
      company: 'Paz Café',
      message: 'Need a sign',
      kind: 'member',
    },
    projectTitle: 'Café sign',
    estimatedValueMinor: 150000,
  });
  const carla = people(next).find((c) => c.email === 'carla@example.com')!;
  assert.equal(carla.kind, 'customer', 'public intake never creates team members');
  assert.match(carla.notes, /Website form\] Need a sign/);
  assert.equal(next.companies.find((c) => c.id === carla.companyId)?.name, 'Paz Café');
  const deal = next.deals.find((d) => d.contactId === carla.id)!;
  assert.equal(deal.title, 'Café sign');
  assert.equal(next.workspaces[0]!.stages.find((s) => s.id === deal.stageId)?.outcome, 'open');

  const again = act(next, as('manager'), 'lead.capture', {
    source: 'WhatsApp',
    fields: {
      name: 'Someone Else',
      email: 'carla@example.com',
      phone: '999',
      message: 'Follow-up',
    },
  });
  const same = people(again).find((c) => c.email === 'carla@example.com')!;
  assert.equal(same.name, 'Carla Paz');
  assert.equal(same.phone, '');
  assert.match(same.notes, /WhatsApp\] Follow-up/);
  assert.equal(people(again).length, people(next).length);
  validateData(again);
});

test('companies: unique names, renames flow to people, archive needs contacts.write', () => {
  let data = act(insignia(), as('manager'), 'company.save', { name: 'Norte SA' }, 'co-1');
  data = act(data, as('manager'), 'contact.save', {
    name: 'Dina',
    kind: 'customer',
    companyId: 'co-1',
  });
  assert.throws(
    () => act(data, as('manager'), 'company.save', { name: 'norte sa' }),
    /already exists/,
  );
  data = act(data, as('manager'), 'company.save', { id: 'co-1', name: 'Norte Group' });
  assert.equal(people(data).find((c) => c.name === 'Dina')!.company, 'Norte Group');
  assert.throws(() =>
    act(data, as('viewer'), 'record.archive', { collection: 'companies', id: 'co-1' }),
  );
  data = act(data, as('manager'), 'record.archive', { collection: 'companies', id: 'co-1' });
  validateData(data);
  assert.equal(projectForActor(data, as('finance')).companies.length, data.companies.length);
  assert.equal(projectForActor(data, { grants: ['work.read'], email: '' }).companies.length, 0);
});
