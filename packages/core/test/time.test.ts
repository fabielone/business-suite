import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  demoData,
  DEMO_PEOPLE,
  emptyData,
  executeCommand,
  validateData,
  workspaceData,
  authorizeCommand,
  projectForActor,
  openEntry,
  workedMs,
  formatDuration,
  ROLE_GRANTS,
  type SuiteData,
  type Actor,
} from '../src/operations/index.js';

// Tuesday 3 November 2026, 10:00 in Mexico City.
const NOW = '2026-11-03T16:00:00Z';
const HOUR = 60 * 60 * 1000;
const at = (offsetHours: number) => new Date(Date.parse(NOW) + offsetHours * HOUR).toISOString();
let n = 0;
const person = (key: string): Actor => {
  const p = DEMO_PEOPLE.find((x) => x.key === key)!;
  return { grants: ROLE_GRANTS[p.role]!, email: p.email };
};
const act = (
  data: SuiteData,
  actor: Actor,
  type: string,
  payload: Record<string, unknown>,
  now = NOW,
) => {
  const command = { id: `time-test-${++n}`, workspaceId: 'insignia', type, payload };
  authorizeCommand(data, command, actor);
  return executeCommand(data, command, now);
};
const id = (d: SuiteData, key: string) =>
  d.contacts.find(
    (c) =>
      c.workspaceId === 'insignia' && c.email === DEMO_PEOPLE.find((x) => x.key === key)!.email,
  )!.id;
/** The demo company with nobody on the clock and no history, for exact arithmetic. */
function setup(): SuiteData {
  const all = demoData(NOW);
  const data = workspaceData(
    all,
    all.workspaces.find((w) => w.id === 'insignia')!,
  );
  data.timeEntries = [];
  return data;
}

test('the demo account validates, has every role, a full pipeline and people on the clock', () => {
  const data = validateData(demoData(NOW));
  const ws = data.workspaces.find((w) => w.id === 'insignia')!;
  for (const p of DEMO_PEOPLE) assert.ok(ROLE_GRANTS[p.role], p.role);
  for (const stage of ws.stages)
    assert.ok(
      data.deals.some((d) => d.workspaceId === ws.id && d.stageId === stage.id),
      `a deal in ${stage.name}`,
    );
  assert.equal(data.timeEntries.filter((e) => !e.end).length, 2);
  assert.ok(data.timeEntries.every((e) => !e.end || e.end <= NOW));
});

test('a person clocks in and out once; a second clock-in is refused until they clock out', () => {
  let data = setup();
  const alex = person('installer');
  data = act(data, alex, 'time.clockIn', { memberId: id(data, 'installer') }, at(-3));
  assert.throws(
    () => act(data, alex, 'time.clockIn', { memberId: id(data, 'installer') }, at(-2)),
    /already on the clock/,
  );
  const running = openEntry(data, 'insignia', id(data, 'installer'))!;
  assert.equal(running.start, at(-3));
  assert.equal(
    formatDuration(workedMs(data, 'insignia', running.memberId, at(-24), NOW, NOW)),
    '3:00',
  );
  data = act(data, alex, 'time.clockOut', { id: running.id, note: 'Measured 3 walls' }, at(-0.5));
  assert.equal(openEntry(data, 'insignia', running.memberId), undefined);
  const done = data.timeEntries.find((e) => e.id === running.id)!;
  assert.equal(done.end, at(-0.5));
  assert.equal(done.note, 'Measured 3 walls');
  assert.equal(
    formatDuration(workedMs(data, 'insignia', done.memberId, at(-24), NOW, NOW)),
    '2:30',
  );
  assert.throws(() => act(data, alex, 'time.clockOut', { id: done.id }), /already clocked out/);
});

test('only reviewers clock other people; workers log time only on their own jobs', () => {
  const data = setup();
  const alex = person('installer');
  assert.throws(
    () => act(data, alex, 'time.clockIn', { memberId: id(data, 'designer') }),
    /only clock yourself/,
  );
  assert.throws(
    () => act(data, person('sales'), 'time.clockIn', { memberId: id(data, 'installer') }),
    /only clock yourself/,
  );
  // The designer's order has no job for Alex.
  const doorSigns = data.projects.find((o) => o.title === 'Classroom door signs')!;
  assert.throws(
    () =>
      act(data, alex, 'time.clockIn', { memberId: id(data, 'installer'), orderId: doorSigns.id }),
    /jobs assigned to you/,
  );
  const reception = data.projects.find((o) => o.title === 'Reception signage')!;
  const ok = act(data, alex, 'time.clockIn', {
    memberId: id(data, 'installer'),
    orderId: reception.id,
  });
  assert.equal(ok.timeEntries[0]!.orderId, reception.id);
  // The production lead may start someone's clock for them, e.g. a forgotten punch.
  const lead = act(data, person('lead'), 'time.clockIn', { memberId: id(data, 'designer') });
  assert.equal(lead.timeEntries[0]!.memberId, id(data, 'designer'));
  // A viewer has no clock.
  assert.throws(
    () =>
      act(data, { grants: ROLE_GRANTS.viewer!, email: 'nobody@example.com' }, 'time.clockIn', {
        memberId: id(data, 'installer'),
      }),
    /does not allow/,
  );
});

test('workers read only their own hours; reviewers read everyone’s', () => {
  const data = demoData(NOW);
  const ws = data.workspaces.find((w) => w.id === 'insignia')!;
  const scoped = workspaceData(data, ws);
  const total = scoped.timeEntries.length;
  const alexOnly = projectForActor(scoped, person('installer')).timeEntries;
  assert.ok(alexOnly.length > 0 && alexOnly.length < total);
  assert.ok(alexOnly.every((e) => e.memberId === id(data, 'installer')));
  assert.equal(projectForActor(scoped, person('finance')).timeEntries.length, total);
  assert.equal(projectForActor(scoped, person('lead')).timeEntries.length, total);
  assert.equal(
    projectForActor(scoped, { grants: ROLE_GRANTS.viewer!, email: '' }).timeEntries.length,
    0,
  );
});

test('offline punches keep device time within 24 hours and never overlap recorded hours', () => {
  let data = setup();
  const alex = person('installer');
  const me = id(data, 'installer');
  assert.throws(
    () => act(data, alex, 'time.clockIn', { memberId: me, at: at(1) }),
    /device clock is ahead/,
  );
  assert.throws(
    () => act(data, alex, 'time.clockIn', { memberId: me, at: at(-30) }),
    /more than 24 hours old/,
  );
  data = act(data, alex, 'time.clockIn', { memberId: me, at: at(-6) });
  const entry = openEntry(data, 'insignia', me)!;
  data = act(data, alex, 'time.clockOut', { id: entry.id, at: at(-4) });
  assert.throws(
    () => act(data, alex, 'time.clockIn', { memberId: me, at: at(-5) }),
    /earlier than the last recorded clock-out/,
  );
});

test('corrections need a reviewer and a reason, and the audit keeps the old times', () => {
  let data = setup();
  const me = id(data, 'installer');
  data = act(data, person('installer'), 'time.clockIn', { memberId: me }, at(-2));
  const entry = openEntry(data, 'insignia', me)!;
  const fix = { id: entry.id, start: at(-3), end: at(-1), reason: 'Forgot to clock in on site' };
  assert.throws(() => act(data, person('installer'), 'time.adjust', fix), /does not allow/);
  assert.throws(
    () => act(data, person('finance'), 'time.adjust', { ...fix, reason: '' }),
    /reason is required/,
  );
  assert.throws(
    () => act(data, person('finance'), 'time.adjust', { ...fix, end: at(2) }),
    /future/,
  );
  data = act(data, person('finance'), 'time.adjust', { ...fix, by: id(data, 'finance') });
  const fixed = data.timeEntries.find((e) => e.id === entry.id)!;
  assert.deepEqual([fixed.start, fixed.end, fixed.adjustedReason], [at(-3), at(-1), fix.reason]);
  assert.equal(fixed.adjustedBy, id(data, 'finance'));
  assert.match(data.audit.at(-1)!.summary, new RegExp(`was ${at(-2)}–running`));
});

test('documents saved before the time clock load with an empty clock', () => {
  const old = structuredClone(emptyData()) as Partial<SuiteData>;
  delete old.timeEntries;
  assert.deepEqual(validateData(old).timeEntries, []);
});
