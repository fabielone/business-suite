import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleData,
  executeCommand,
  workspaceData,
  authorizeCommand,
  actorMemberIds,
  ROLE_GRANTS,
  type SuiteData,
  type Actor,
} from '../src/operations/index.js';

// A member contact's email is what links a signed-in person to their own jobs, tasks and
// hours. These tests keep people who merely edit contacts from taking over that link.
const NOW = '2026-11-17T12:00:00Z';
const insignia = () => {
  const all = sampleData(NOW);
  return workspaceData(
    all,
    all.workspaces.find((w) => w.id === 'insignia')!,
  );
};
let n = 0;
const act = (
  data: SuiteData,
  actor: Actor,
  type: string,
  payload: Record<string, unknown>,
  id = `member-identity-${++n}`,
) => {
  const command = { id, workspaceId: 'insignia', type, payload };
  authorizeCommand(data, command, actor);
  return executeCommand(data, command, NOW);
};
const sales: Actor = { grants: ROLE_GRANTS.collaborator!, email: 'priya@example.com' };
const manager: Actor = { grants: ROLE_GRANTS.manager!, email: 'casey@example.com' };
const contact = (over: Record<string, unknown>) => ({
  name: 'Someone',
  kind: 'customer',
  email: '',
  phone: '',
  url: '',
  notes: '',
  company: '',
  ...over,
});
const TEAM_ONLY = /Only an owner or manager can add or change team members/;

test('a contact editor cannot point a team member at their own sign-in', () => {
  const data = insignia();
  const alex = data.contacts.find((c) => c.kind === 'member')!;
  assert.deepEqual(actorMemberIds(data, 'insignia', sales.email), []);
  assert.throws(
    () =>
      act(
        data,
        sales,
        'contact.save',
        contact({ id: alex.id, name: alex.name, kind: 'member', email: sales.email }),
      ),
    TEAM_ONLY,
  );
  // Renaming the member, or turning them into something else, is the same door.
  assert.throws(
    () =>
      act(
        data,
        sales,
        'contact.save',
        contact({ id: alex.id, name: 'X', kind: 'member', email: alex.email }),
      ),
    TEAM_ONLY,
  );
  assert.throws(
    () =>
      act(
        data,
        sales,
        'contact.save',
        contact({ id: alex.id, name: alex.name, kind: 'customer', email: alex.email }),
      ),
    TEAM_ONLY,
  );
  assert.throws(
    () => act(data, sales, 'record.archive', { collection: 'contacts', id: alex.id }),
    TEAM_ONLY,
  );
  // They still cannot record hours in that person's name.
  assert.throws(
    () => act(data, sales, 'time.clockIn', { memberId: alex.id }),
    /only clock yourself/,
  );
});

test('a contact editor cannot create a team member, directly or through an import', () => {
  const data = insignia();
  assert.throws(
    () =>
      act(data, sales, 'contact.save', contact({ name: 'Me', kind: 'member', email: sales.email })),
    TEAM_ONLY,
  );
  const customer = data.contacts.find((c) => c.kind === 'customer')!;
  assert.throws(
    () =>
      act(
        data,
        sales,
        'contact.save',
        contact({ id: customer.id, name: customer.name, kind: 'member', email: sales.email }),
      ),
    TEAM_ONLY,
  );
  assert.throws(
    () =>
      act(data, sales, 'contact.import', {
        rows: [{ name: 'Me', email: sales.email }],
        kind: 'member',
      }),
    TEAM_ONLY,
  );
  for (const kind of ['member', 'Miembro', 'team'])
    assert.throws(
      () =>
        act(data, sales, 'contact.import', { rows: [{ name: 'Me', email: sales.email, kind }] }),
      TEAM_ONLY,
      kind,
    );
});

test('contact editors keep their ordinary work and managers keep managing the team', () => {
  let data = insignia();
  const customer = data.contacts.find((c) => c.kind === 'customer')!;
  data = act(
    data,
    sales,
    'contact.save',
    contact({ id: customer.id, name: 'Renamed customer', email: 'c@example.com' }),
  );
  data = act(data, sales, 'contact.save', contact({ name: 'New lead', kind: 'lead' }));
  data = act(data, sales, 'contact.import', {
    rows: [{ name: 'Imported', email: 'i@example.com', kind: 'supplier' }],
  });
  data = act(data, sales, 'record.archive', { collection: 'contacts', id: customer.id });

  const alex = data.contacts.find((c) => c.kind === 'member')!;
  data = act(
    data,
    manager,
    'contact.save',
    contact({ id: alex.id, name: alex.name, kind: 'member', email: 'alex.new@example.com' }),
  );
  assert.equal(data.contacts.find((c) => c.id === alex.id)!.email, 'alex.new@example.com');
  data = act(
    data,
    manager,
    'contact.save',
    contact({ name: 'New installer', kind: 'member', email: 'n@example.com' }),
  );
  data = act(data, manager, 'contact.import', {
    rows: [{ name: 'Crew', email: 'crew@example.com' }],
    kind: 'member',
  });
  assert.ok(data.contacts.some((c) => c.email === 'crew@example.com' && c.kind === 'member'));
});
