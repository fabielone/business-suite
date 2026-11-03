import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleData,
  executeCommand,
  runDueAutomations,
  nextAutomationCheck,
  validateData,
  workspaceData,
  authorizeCommand,
  projectForActor,
  addBusinessMinutes,
  nextQueueAlert,
  DEFAULT_HOURS,
  ROLE_GRANTS,
  type SuiteData,
  type Actor,
  type Task,
} from '../src/operations/index.js';

// Tuesday 3 November 2026, 06:00 in Mexico City (UTC-6, no daylight saving).
const NOW = '2026-11-03T12:00:00Z';
let n = 0;
const as = (role: string, email = ''): Actor => ({ grants: ROLE_GRANTS[role]!, email });
const act = (
  data: SuiteData,
  actor: Actor,
  type: string,
  payload: Record<string, unknown>,
  now = NOW,
) => {
  const command = { id: `team-test-${++n}`, workspaceId: 'insignia', type, payload };
  authorizeCommand(data, command, actor);
  return executeCommand(data, command, now);
};
const member = (d: SuiteData, email: string) => d.contacts.find((c) => c.email === email)!.id;
const task = (d: SuiteData, title: string) => d.tasks.find((t) => t.title === title)!;
const manager = as('manager');
const alex = as('production', 'alex@example.com');
const bea = as('production', 'bea@example.com');
const sam = as('production', 'sam@example.com');
const sara = as('collaborator', 'sara@example.com');

/** Insignia with Alex and Bea in Production (Bea leads it) and Sara in Sales. */
function setup(): SuiteData {
  const all = sampleData(NOW);
  let data = workspaceData(
    all,
    all.workspaces.find((w) => w.id === 'insignia')!,
  );
  for (const [name, email] of [
    ['Bea · example', 'bea@example.com'],
    ['Sara · example', 'sara@example.com'],
  ])
    data = act(data, manager, 'contact.save', { name, kind: 'member', email, weight: 1 });
  const team = (id: string) => data.workspaces[0]!.teams!.find((t) => t.id === id)!;
  data = act(data, manager, 'team.save', {
    id: 'production',
    name: 'Production',
    memberIds: [member(data, 'alex@example.com'), member(data, 'bea@example.com')],
    leadIds: [member(data, 'bea@example.com')],
    alert: team('production').alert,
  });
  data = act(data, manager, 'team.save', {
    id: 'sales',
    name: 'Sales',
    memberIds: [member(data, 'sara@example.com')],
    leadIds: [],
    alert: team('sales').alert,
  });
  return data;
}
const addTask = (data: SuiteData, title: string, extra: Record<string, unknown> = {}, now = NOW) =>
  act(data, manager, 'task.save', { title, teamId: 'production', due: '', ...extra }, now);

test('new signage workspaces start with Production, Sales, Marketing and Office', () => {
  const data = setup();
  assert.deepEqual(
    data.workspaces[0]!.teams!.map((t) => [t.name, t.alert.amount, t.alert.unit]),
    [
      ['Production', 4, 'hours'],
      ['Sales', 2, 'hours'],
      ['Marketing', 1, 'days'],
      ['Office', 1, 'days'],
    ],
  );
  validateData(data);
  assert.throws(
    () => act(data, sara, 'team.save', { name: 'Mine', alert: { amount: 1, unit: 'days' } }),
    /role does not allow/,
  );
  assert.throws(
    () =>
      act(data, manager, 'team.save', {
        id: 'sales',
        name: 'Sales',
        memberIds: [],
        leadIds: [member(data, 'sara@example.com')],
        alert: { amount: 2, unit: 'hours' },
      }),
    /lead must also be a member/,
  );
  assert.throws(
    () =>
      act(data, manager, 'team.save', {
        id: 'sales',
        name: 'Sales',
        alert: { amount: 30, unit: 'hours' },
      }),
    /1 to 23 business hours/,
  );
});

test('production workers cannot edit, reassign or archive tasks they do not hold', () => {
  let data = setup();
  data = act(data, manager, 'task.save', {
    title: 'Office errand',
    assigneeId: member(data, 'sara@example.com'),
  });
  const errand = task(data, 'Office errand');
  for (const [type, payload] of [
    [
      'task.save',
      { id: errand.id, title: 'Hijacked', assigneeId: member(data, 'alex@example.com') },
    ],
    ['record.archive', { collection: 'tasks', id: errand.id }],
    ['task.complete', { id: errand.id }],
  ] as const)
    assert.throws(() => act(data, alex, type, payload), { code: 'ACTION_DENIED' });
  const own = data.tasks.find((t) => t.assigneeId === member(data, 'alex@example.com'))!;
  assert.throws(
    () =>
      act(data, alex, 'task.save', {
        id: own.id,
        title: own.title,
        assigneeId: member(data, 'bea@example.com'),
      }),
    /Only a team lead or a manager can give a task/,
  );
  data = act(data, alex, 'task.save', {
    id: own.id,
    title: 'Renamed by Alex',
    assigneeId: own.assigneeId,
  });
  assert.equal(task(data, 'Renamed by Alex').id, own.id);
  assert.throws(
    () => act(data, manager, 'task.save', { title: 'x', assigneeId: 'pool' }),
    /workspace member/,
  );
  assert.throws(
    () =>
      act(data, manager, 'task.save', {
        title: 'x',
        teamId: 'production',
        assigneeId: member(data, 'sara@example.com'),
      }),
    /not a member of Production/,
  );
});

test('team work: only that team sees it, one member claims it, the second claim is refused', () => {
  let data = addTask(setup(), 'Cut vinyl letters');
  const queued = task(data, 'Cut vinyl letters');
  assert.equal(queued.assigneeId, '');
  assert.equal(queued.queuedAt, NOW);
  const titles = (actor: Actor) => projectForActor(data, actor).tasks.map((t) => t.title);
  assert.ok(titles(alex).includes('Cut vinyl letters'));
  assert.ok(titles(bea).includes('Cut vinyl letters'));
  assert.ok(!titles(sara).includes('Cut vinyl letters'), 'Sales does not see Production work');
  assert.ok(!titles(sam).includes('Cut vinyl letters'), 'not a team member');
  assert.ok(titles(manager).includes('Cut vinyl letters'));
  assert.throws(
    () =>
      act(data, sam, 'task.claim', { id: queued.id, memberId: member(data, 'sam@example.com') }),
    { code: 'ACTION_DENIED' },
  );
  assert.throws(
    () =>
      act(data, alex, 'task.claim', { id: queued.id, memberId: member(data, 'bea@example.com') }),
    /only claim tasks for yourself/,
  );
  data = act(data, alex, 'task.claim', {
    id: queued.id,
    memberId: member(data, 'alex@example.com'),
  });
  const claimed = task(data, 'Cut vinyl letters');
  assert.equal(claimed.assigneeId, member(data, 'alex@example.com'));
  assert.equal(claimed.teamId, 'production', 'the team stays after the claim');
  assert.deepEqual(
    claimed.history!.map((e) => e.action),
    ['queued', 'claimed'],
  );
  // Teammates see who holds it; prices stay hidden from production.
  const beaView = projectForActor(data, bea);
  assert.ok(beaView.tasks.some((t) => t.id === queued.id && t.assigneeId === claimed.assigneeId));
  assert.ok(beaView.projects.every((o) => o.amountMinor === 0));
  assert.throws(
    () =>
      act(data, bea, 'task.claim', { id: queued.id, memberId: member(data, 'bea@example.com') }),
    (e: Error & { code?: string }) =>
      e.code === 'ALREADY_CLAIMED' && /Alex · example claimed this first at 06:00/.test(e.message),
  );
  validateData(data);
});

test('only the holder, a lead or a manager gives work back; completion records who did it', () => {
  let data = addTask(setup(), 'Pack order');
  const id = task(data, 'Pack order').id;
  data = act(data, alex, 'task.claim', { id, memberId: member(data, 'alex@example.com') });
  assert.throws(() => act(data, bea, 'task.unclaim', { id }), /Only the person holding this task/);
  const later = '2026-11-03T16:00:00Z';
  data = act(data, alex, 'task.unclaim', { id, by: member(data, 'alex@example.com') }, later);
  const back = task(data, 'Pack order');
  assert.equal(back.assigneeId, '');
  assert.equal(back.queuedAt, later, 'the unclaimed clock restarts');
  data = act(data, bea, 'task.claim', { id, memberId: member(data, 'bea@example.com') });
  assert.throws(
    () => act(data, bea, 'task.complete', { id, by: member(data, 'alex@example.com') }),
    /only act as yourself/,
  );
  data = act(data, bea, 'task.complete', { id, by: member(data, 'bea@example.com') }, later);
  const done = task(data, 'Pack order');
  assert.equal(done.completedBy, member(data, 'bea@example.com'));
  assert.equal(done.completedAt, later);
  assert.deepEqual(
    done.history!.map((e) => e.action),
    ['queued', 'claimed', 'unclaimed', 'claimed', 'completed'],
  );
});

test('a repeating team chore goes back to the team queue, not to the last person', () => {
  let data = addTask(setup(), 'Clean the plotter', { due: '2026-11-03', recurrence: 'weekly' });
  const id = task(data, 'Clean the plotter').id;
  data = act(data, alex, 'task.claim', { id, memberId: member(data, 'alex@example.com') });
  data = act(data, alex, 'task.complete', { id, by: member(data, 'alex@example.com') });
  const next = data.tasks.find((t) => t.title === 'Clean the plotter' && !t.done)!;
  assert.equal(next.assigneeId, '');
  assert.equal(next.teamId, 'production');
  assert.equal(next.due, '2026-11-10');
  assert.equal(next.completedBy, undefined);
});

test('business time skips nights, weekends and counts in the workspace time zone', () => {
  // Friday 6 Nov 17:00 in Mexico City + 2 business hours = Monday 9 Nov 10:00.
  assert.equal(
    addBusinessMinutes('2026-11-06T23:00:00Z', 120, DEFAULT_HOURS),
    '2026-11-09T16:00:00.000Z',
  );
  // Zero minutes before opening gives the opening moment.
  assert.equal(addBusinessMinutes(NOW, 0, DEFAULT_HOURS), '2026-11-03T15:00:00.000Z');
  // New York changed to winter time on 1 Nov 2026: 09:00 is 14:00 UTC afterwards.
  const ny = { ...DEFAULT_HOURS, timeZone: 'America/New_York' };
  assert.equal(addBusinessMinutes('2026-10-30T22:00:00Z', 60, ny), '2026-11-02T15:00:00.000Z');
  assert.equal(addBusinessMinutes(NOW, 60, { ...DEFAULT_HOURS, days: [] }), '');
});

test('unclaimed work alerts the lead in business hours, then once a day, and stops when claimed', () => {
  let data = addTask(setup(), 'Weld frame');
  const id = task(data, 'Weld frame').id;
  const bea = member(data, 'bea@example.com');
  // Queued 06:00 before opening; Production waits 4 business hours: 13:00 local = 19:00Z.
  assert.equal(
    nextQueueAlert(data.workspaces[0], task(data, 'Weld frame')),
    '2026-11-03T19:00:00.000Z',
  );
  assert.equal(nextAutomationCheck(data, 'insignia', NOW), '2026-11-03T19:00:00.000Z');
  assert.equal(runDueAutomations(data, 'insignia', '2026-11-03T18:59:00Z', 'tick-a'), data);
  data = runDueAutomations(data, 'insignia', '2026-11-03T19:00:00Z', 'tick-b');
  let notes = data.notifications.filter((x) => x.subject.id === id);
  assert.deepEqual(
    notes.map((x) => x.recipientId),
    [bea],
  );
  assert.match(notes[0]!.message, /Nobody in Production has claimed “Weld frame” yet/);
  assert.equal(task(data, 'Weld frame').alerts, 1);
  // Bea sees her alert; Alex does not.
  assert.equal(projectForActor(data, as('production', 'bea@example.com')).notifications.length, 1);
  assert.equal(projectForActor(data, alex).notifications.length, 0);
  // One reminder per business day, never twice for the same moment.
  assert.equal(runDueAutomations(data, 'insignia', '2026-11-03T23:00:00Z', 'tick-c'), data);
  data = runDueAutomations(data, 'insignia', '2026-11-04T19:00:00Z', 'tick-d');
  notes = data.notifications.filter((x) => x.subject.id === id);
  assert.match(notes[1]!.message, /reminder 1 of 4/);
  data = act(data, alex, 'task.claim', { id, memberId: member(data, 'alex@example.com') });
  assert.equal(nextQueueAlert(data.workspaces[0], task(data, 'Weld frame')), '');
  assert.equal(runDueAutomations(data, 'insignia', '2026-11-06T19:00:00Z', 'tick-e'), data);
  validateData(data);
});

test('teams without a lead alert managers; a due date brings the alert forward', () => {
  // Sales has no lead. Created 09:00 local and due today: alert after the 1-hour grace.
  let data = act(
    setup(),
    manager,
    'task.save',
    {
      title: 'Call back walk-in customer',
      teamId: 'sales',
      due: '2026-11-03',
    },
    '2026-11-03T15:00:00Z',
  );
  const t = task(data, 'Call back walk-in customer');
  assert.equal(nextQueueAlert(data.workspaces[0], t), '2026-11-03T16:00:00.000Z');
  const owner = data.contacts.find((c) => c.email === 'sam@example.com')!.id;
  data = runDueAutomations(data, 'insignia', '2026-11-03T16:00:00Z', 'tick-f', [owner]);
  assert.deepEqual(
    data.notifications.filter((x) => x.subject.id === t.id).map((x) => x.recipientId),
    [owner],
  );
  // Due next week: the normal 2-hour Sales wait applies.
  data = act(
    data,
    manager,
    'task.save',
    { title: 'Send brochure', teamId: 'sales', due: '2026-11-10' },
    '2026-11-03T15:00:00Z',
  );
  assert.equal(
    nextQueueAlert(data.workspaces[0], task(data, 'Send brochure')),
    '2026-11-03T17:00:00.000Z',
  );
});

test('business hours and team archiving are validated', () => {
  let data = addTask(setup(), 'Open work');
  assert.throws(
    () => act(data, manager, 'team.archive', { id: 'production' }),
    /open tasks of Production/,
  );
  data = act(data, manager, 'team.archive', { id: 'marketing' });
  assert.ok(data.workspaces[0]!.teams!.find((t) => t.id === 'marketing')!.archived);
  assert.throws(
    () => act(data, manager, 'task.save', { title: 'x', teamId: 'marketing' }),
    /active team/,
  );
  assert.throws(
    () =>
      act(data, manager, 'workspace.hours', {
        timeZone: 'Mars/Base',
        days: [1],
        start: '09:00',
        end: '18:00',
      }),
    /valid time zone/,
  );
  assert.throws(
    () =>
      act(data, manager, 'workspace.hours', {
        timeZone: 'America/Mexico_City',
        days: [1],
        start: '18:00',
        end: '09:00',
      }),
    /after opening/,
  );
  assert.throws(
    () => act(data, sara, 'workspace.hours', { ...DEFAULT_HOURS }),
    /role does not allow/,
  );
  data = act(data, manager, 'workspace.hours', {
    timeZone: 'America/Monterrey',
    days: [1, 2, 3, 4, 5, 6],
    start: '08:00',
    end: '14:00',
  });
  assert.deepEqual(data.workspaces[0]!.businessHours!.days, [1, 2, 3, 4, 5, 6]);
  validateData(data);
  assert.throws(
    () => act(data, manager, 'task.alert', { id: task(data, 'Open work').id, recipientIds: [] }),
    /not supported/,
  );
  const tampered = structuredClone(data);
  (tampered.tasks.find((x) => x.title === 'Open work') as Task).teamId = 'ghost';
  assert.throws(() => validateData(tampered), /unknown team/);
});
