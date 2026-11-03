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
  orderJobs,
  ROLE_GRANTS,
  AUTOMATION_COMMANDS,
  type SuiteData,
  type Command,
  type Actor,
} from '../src/operations/index.js';

const NOW = '2026-11-03T12:00:00.000Z';
const at = (hours: number) => new Date(Date.parse(NOW) + hours * 3600000).toISOString();
const insignia = () => {
  const all = sampleData(NOW);
  return workspaceData(
    all,
    all.workspaces.find((w) => w.id === 'insignia')!,
  );
};
let n = 0;
const cmd = (type: string, payload: Record<string, unknown>): Command => ({
  id: `auto-test-${++n}`,
  workspaceId: 'insignia',
  type,
  payload,
});
const as = (role: string, email = ''): Actor => ({ grants: ROLE_GRANTS[role]!, email });
const act = (
  data: SuiteData,
  actor: Actor,
  type: string,
  payload: Record<string, unknown>,
  now = NOW,
) => {
  const command = cmd(type, payload);
  authorizeCommand(data, command, actor);
  return executeCommand(data, command, now);
};
const tick = (data: SuiteData, now: string) =>
  runDueAutomations(data, 'insignia', now, `tick-${++n}`);
const member = (d: SuiteData, email: string) => d.contacts.find((c) => c.email === email)!.id;
const rule = (d: SuiteData, name: string) => d.automations.find((a) => a.name === name)!;
const runs = (d: SuiteData, name: string) =>
  d.automationRuns.filter((r) => r.automationId === rule(d, name).id);
const released = (d: SuiteData) => d.projects.find((o) => o.release)!;
const job = (d: SuiteData, name: string) => orderJobs(released(d)).find((j) => j.name === name)!;
const deal = (d: SuiteData, title: string) => d.deals.find((x) => x.title === title)!;
const moveDeal = (d: SuiteData, title: string, stageId: string, now = NOW) => {
  const x = deal(d, title);
  return act(d, as('collaborator'), 'deal.save', { ...x, stageId }, now);
};

test('a job reaching Fabrication is assigned, gets a task and notifies its new assignee', () => {
  let data = insignia();
  const sam = member(data, 'sam@example.com');
  const installation = job(data, 'Installation');
  const revision = data.revision;
  data = act(data, as('manager'), 'job.move', {
    orderId: released(data).id,
    jobId: installation.id,
    stage: 'Fabrication',
  });
  assert.equal(data.revision, revision + 1, 'one revision per person’s command');
  assert.equal(job(data, 'Installation').assigneeId, sam);
  const task = data.tasks.find((t) => t.title.startsWith('Prepare materials'))!;
  assert.equal(task.assigneeId, sam, 'the assignee is read after the assignment');
  assert.equal(task.projectId, released(data).id);
  assert.equal(data.notifications.length, 1);
  assert.equal(data.notifications[0]!.recipientId, sam);
  assert.equal(runs(data, 'Fabrication goes to the shop')[0]!.status, 'done');
  const automated = data.audit.filter((a) => a.automationId);
  assert.equal(automated.length, 3);
  assert.ok(automated.every((a) => a.summary.startsWith('Fabrication goes to the shop: ')));
  validateData(data);
  // Sam (lead) reads the notification; Alex does not; nobody but managers reads rules.
  const lead = projectForActor(data, as('lead', 'sam@example.com'));
  assert.equal(lead.notifications.length, 1);
  assert.deepEqual(lead.automations, []);
  assert.deepEqual(lead.automationRuns, []);
  assert.equal(projectForActor(data, as('production', 'alex@example.com')).notifications.length, 0);
  assert.equal(projectForActor(data, as('manager')).automations.length, 3);
  // Only the recipient marks it read.
  const id = data.notifications[0]!.id;
  assert.throws(
    () => act(data, as('production', 'alex@example.com'), 'notification.read', { id }),
    /not addressed to you/,
  );
  data = act(data, as('lead', 'sam@example.com'), 'notification.read', { id });
  assert.equal(data.notifications[0]!.read, true);
});

test('a sent quote waits three days, then creates a follow-up only if nothing happened', () => {
  const name = 'Follow up a sent quote';
  let data = moveDeal(insignia(), 'Storefront refresh', 'quoted');
  const [waiting] = runs(data, name);
  assert.equal(waiting!.status, 'waiting');
  assert.equal(waiting!.dueAt, at(72));
  assert.equal(nextAutomationCheck(data, 'insignia', NOW), at(72));
  assert.equal(tick(data, at(71)), data, 'nothing due: same document, nothing to save');
  const due = tick(data, at(72));
  assert.equal(runs(due, name)[0]!.status, 'done');
  assert.ok(due.tasks.some((t) => t.title === 'Follow up on the quote: Storefront refresh'));
  assert.equal(due.revision, data.revision + 1);
  assert.equal(tick(due, at(80)), due, 'a finished run never repeats');
  validateData(due);

  // Someone touched the project during the wait: the If step skips it.
  data = act(
    data,
    as('collaborator'),
    'deal.save',
    { ...deal(data, 'Storefront refresh'), notes: 'Called' },
    at(24),
  );
  const skipped = tick(data, at(72));
  assert.equal(runs(skipped, name)[0]!.status, 'skipped');
  assert.equal(skipped.tasks.length, data.tasks.length);
});

test('a repeated trigger restarts the wait; switching a rule off cancels its waits', () => {
  const name = 'Follow up a sent quote';
  let data = moveDeal(insignia(), 'Storefront refresh', 'quoted');
  data = moveDeal(data, 'Storefront refresh', 'negotiation', at(1));
  data = moveDeal(data, 'Storefront refresh', 'quoted', at(2));
  assert.deepEqual(
    runs(data, name).map((r) => r.status),
    ['cancelled', 'waiting'],
  );
  data = act(
    data,
    as('manager'),
    'automation.enable',
    { id: rule(data, name).id, enabled: false },
    at(3),
  );
  assert.deepEqual(
    runs(data, name).map((r) => r.status),
    ['cancelled', 'cancelled'],
  );
  assert.equal(tick(data, at(200)), data);
});

test('all tasks of an order done moves its Installation jobs to Delivered', () => {
  let data = insignia();
  const order = released(data);
  const installation = job(data, 'Installation');
  const task = data.tasks.find((t) => t.projectId === order.id)!;
  // Not at Installation yet: the rule records why it skipped.
  let next = act(data, as('manager'), 'task.complete', { id: task.id });
  assert.equal(runs(next, 'Installation done, mark delivered')[0]!.status, 'skipped');
  data = act(data, as('manager'), 'job.move', {
    orderId: order.id,
    jobId: installation.id,
    stage: 'Installation',
  });
  next = act(data, as('manager'), 'task.complete', { id: task.id });
  assert.equal(job(next, 'Installation').stage, 'Delivered');
  assert.equal(
    job(next, 'Fabrication').stage,
    'Fabrication',
    'only jobs at the condition stage move',
  );
  assert.equal(runs(next, 'Installation done, mark delivered')[0]!.status, 'done');
  validateData(next);
});

test('guardrails: no won/lost moves, no release, no money; failures leave the person’s change intact', () => {
  const data = insignia();
  const base = {
    name: 'Bad',
    enabled: true,
    conditions: [],
    wait: { amount: 0, unit: 'days' },
  };
  assert.throws(
    () =>
      act(data, as('manager'), 'automation.save', {
        ...base,
        trigger: { type: 'deal.stage', stageId: 'quoted' },
        actions: [{ type: 'stage.move', stage: 'won' }],
      }),
    /open stage/,
  );
  assert.throws(
    () =>
      act(data, as('manager'), 'automation.save', {
        ...base,
        trigger: { type: 'job.stage', stage: 'Design' },
        actions: [{ type: 'stage.move', stage: 'Awaiting release' }],
      }),
    /never release/,
  );
  assert.throws(
    () =>
      act(data, as('manager'), 'automation.save', {
        ...base,
        trigger: { type: 'deal.stage', stageId: 'quoted' },
        actions: [{ type: 'payment.add' }],
      }),
    /valid action/,
  );
  for (const type of [
    'payment.add',
    'expense.review',
    'order.release',
    'deal.convert',
    'project.save',
  ])
    assert.ok(!AUTOMATION_COMMANDS.has(type), type);
  for (const type of ['notification.create', 'automation.note'])
    assert.throws(
      () => executeCommand(data, cmd(type, { recordId: 'x', text: 'x' }), NOW),
      /not supported/,
    );

  // A rule that would move an unreleased order's job fails as a whole, but the order is still created.
  let next = act(data, as('manager'), 'automation.save', {
    ...base,
    name: 'Rush new orders',
    trigger: { type: 'job.stage', stage: 'Awaiting release' },
    actions: [
      { type: 'note.add', text: 'Rushing {record}' },
      { type: 'stage.move', stage: 'Design' },
    ],
  });
  const orders = next.projects.length;
  next = act(next, as('manager'), 'deal.convert', {
    id: deal(next, 'Reception signage').id,
    title: 'Phase 3',
  });
  assert.equal(next.projects.length, orders + 1);
  const created = next.projects.at(-1)!;
  assert.equal(orderJobs(created)[0]!.stage, 'Awaiting release');
  assert.equal(created.release, undefined);
  const run = runs(next, 'Rush new orders')[0]!;
  assert.equal(run.status, 'failed');
  assert.match(run.outcome, /Release the order/);
  assert.ok(!next.audit.some((a) => a.summary.includes('Rushing')), 'all actions or none');
});

test('only owners and managers manage automations', () => {
  const data = insignia();
  const payload = {
    name: 'Note',
    enabled: true,
    trigger: { type: 'task.completed' },
    conditions: [],
    wait: { amount: 0, unit: 'days' },
    actions: [{ type: 'note.add', text: 'Done' }],
  };
  for (const role of ['collaborator', 'finance', 'viewer', 'lead', 'production'])
    assert.throws(
      () => act(data, as(role), 'automation.save', payload),
      /role does not allow/,
      role,
    );
  act(data, as('owner'), 'automation.save', payload);
  act(data, as('manager'), 'automation.save', payload);
  assert.equal(projectForActor(data, as('collaborator')).automations.length, 0);
});

test('time triggers count from when a rule was turned on and fire once per date', () => {
  let data = act(insignia(), as('manager'), 'automation.save', {
    name: 'Follow-up date',
    enabled: true,
    trigger: { type: 'date.reached', field: 'deal.due', offsetDays: 0 },
    conditions: [],
    wait: { amount: 0, unit: 'days' },
    actions: [{ type: 'note.add', text: 'Follow-up date reached for {record}' }],
  });
  // Sample projects are due in three days.
  assert.equal(nextAutomationCheck(data, 'insignia', NOW), at(0.25));
  assert.equal(tick(data, at(48)), data);
  const fired = tick(data, at(73));
  const notes = fired.audit.filter((a) => a.summary.includes('Follow-up date reached'));
  assert.equal(notes.length, 2, 'the two open projects; the won one is not followed up');
  assert.equal(tick(fired, at(97)), fired, 'never twice for the same date');

  // A project already stale when the rule is created waits the full period from then.
  data = act(
    insignia(),
    as('manager'),
    'automation.save',
    {
      name: 'Quiet project',
      enabled: true,
      trigger: { type: 'deal.inactive', days: 7 },
      conditions: [],
      wait: { amount: 0, unit: 'days' },
      actions: [{ type: 'task.create', title: 'Check in on {record}', memberId: '', dueInDays: 0 }],
    },
    at(24 * 30),
  );
  assert.equal(tick(data, at(24 * 36)), data);
  const stale = tick(data, at(24 * 37));
  assert.equal(stale.tasks.filter((t) => t.title.startsWith('Check in on')).length, 2);
  assert.equal(tick(stale, at(24 * 40)), stale);
  validateData(stale);
});

test('automations that trigger each other stop after a fixed depth', () => {
  let data = insignia();
  const loop = (from: string, to: string) => ({
    name: `${from} to ${to}`,
    enabled: true,
    trigger: { type: 'deal.stage', stageId: from },
    conditions: [],
    wait: { amount: 0, unit: 'days' },
    actions: [{ type: 'stage.move', stage: to }],
  });
  data = act(data, as('manager'), 'automation.save', loop('contacted', 'interested'));
  data = act(data, as('manager'), 'automation.save', loop('interested', 'contacted'));
  const next = moveDeal(data, 'Storefront refresh', 'contacted');
  assert.equal(next.revision, data.revision + 1);
  assert.equal(next.automationRuns.length, 3);
  validateData(next);
});

test('settings keep stages that automations use; replays and old documents are safe', () => {
  let data = insignia();
  const ws = data.workspaces[0]!;
  // No project is at Contacted, so only the automation keeps the stage.
  const without = { ...ws, stages: ws.stages.filter((s) => s.id !== 'contacted') };
  act(data, as('owner'), 'workspace.settings', without);
  const guarded = act(data, as('manager'), 'automation.save', {
    name: 'Contacted note',
    enabled: true,
    trigger: { type: 'deal.stage', stageId: 'contacted' },
    conditions: [],
    wait: { amount: 0, unit: 'days' },
    actions: [{ type: 'note.add', text: 'Contacted' }],
  });
  assert.throws(
    () => act(guarded, as('owner'), 'workspace.settings', without),
    /An automation uses this stage/,
  );
  // Replaying a command does not run its automations again.
  const command = cmd('deal.save', { ...deal(data, 'Storefront refresh'), stageId: 'quoted' });
  data = executeCommand(data, command, NOW);
  assert.equal(executeCommand(data, command, NOW), data);
  // Documents saved before automations existed still load and run commands.
  const old = structuredClone(insignia()) as Partial<SuiteData>;
  delete old.automations;
  delete old.automationRuns;
  delete old.notifications;
  const loaded = validateData(old);
  assert.deepEqual(loaded.automations, []);
  executeCommand(
    old as SuiteData,
    cmd('task.save', { title: 'Old data', recurrence: 'none' }),
    NOW,
  );
});

test('adding a person or company can create a task and notify, filtered by type', () => {
  let data = insignia();
  const sam = member(data, 'sam@example.com');
  data = act(data, as('manager'), 'automation.save', {
    name: 'Welcome new customers',
    enabled: true,
    trigger: { type: 'contact.created', kind: 'customer' },
    conditions: [],
    wait: { amount: 0, unit: 'days' },
    actions: [
      { type: 'task.create', title: 'Call {record}', memberId: sam, dueInDays: 1 },
      { type: 'notify', memberId: sam, message: 'New customer: {record}' },
    ],
  });
  const added = act(data, as('collaborator'), 'contact.save', {
    name: 'Rita · example',
    kind: 'customer',
    company: 'Example Bakery',
  });
  const task = added.tasks.find((t) => t.title === 'Call Rita · example (Example Bakery)')!;
  assert.equal(task.assigneeId, sam);
  assert.equal(task.due, '2026-11-04');
  assert.equal(
    added.notifications.at(-1)!.message,
    'New customer: Rita · example (Example Bakery)',
  );
  assert.equal(runs(added, 'Welcome new customers')[0]!.status, 'done');
  validateData(added);
  // Other types and edits of an existing person do not trigger it.
  const supplier = act(data, as('collaborator'), 'contact.save', {
    name: 'Supplier · example',
    kind: 'supplier',
  });
  assert.equal(runs(supplier, 'Welcome new customers').length, 0);
  const rita = added.contacts.at(-1)!;
  const edited = act(added, as('collaborator'), 'contact.save', {
    ...rita,
    notes: 'Prefers mornings',
  });
  assert.equal(runs(edited, 'Welcome new customers').length, 1);
  // Moving a stage does not apply to people.
  assert.throws(
    () =>
      act(data, as('manager'), 'automation.save', {
        name: 'Bad',
        enabled: true,
        trigger: { type: 'contact.created', kind: '' },
        conditions: [],
        wait: { amount: 0, unit: 'days' },
        actions: [{ type: 'stage.move', stage: 'contacted' }],
      }),
    /does not apply/,
  );
});

test('task actions: a checklist, notes/repeat/link, and completing or reassigning open tasks', () => {
  let data = insignia();
  const sam = member(data, 'sam@example.com');
  const alex = member(data, 'alex@example.com');
  const order = released(data);
  const rule = (name: string, trigger: Record<string, unknown>, actions: unknown[]) =>
    act(data, as('manager'), 'automation.save', {
      name,
      enabled: true,
      trigger,
      conditions: [],
      wait: { amount: 0, unit: 'days' },
      actions,
    });
  data = rule('Design kit', { type: 'job.stage', stage: 'Design approved' }, [
    {
      type: 'tasks.create',
      link: 'record',
      items: [
        { title: 'Order vinyl for {record}', memberId: sam, dueInDays: 1 },
        { title: 'Book installers', memberId: 'assignee', dueInDays: 2 },
      ],
    },
    {
      type: 'task.create',
      title: 'Weekly site check',
      memberId: alex,
      dueInDays: 7,
      notes: 'Photos for {record}',
      recurrence: 'weekly',
      link: 'none',
    },
  ]);
  const installation = job(data, 'Installation');
  data = act(data, as('manager'), 'job.move', {
    orderId: order.id,
    jobId: installation.id,
    stage: 'Design approved',
  });
  const created = data.tasks.slice(-3);
  assert.deepEqual(
    created.map((t) => [t.title.split(' for ')[0], t.assigneeId, t.due, t.projectId]),
    [
      ['Order vinyl', sam, '2026-11-04', order.id],
      ['Book installers', alex, '2026-11-05', order.id],
      ['Weekly site check', alex, '2026-11-10', ''],
    ],
  );
  assert.equal(created[2]!.recurrence, 'weekly');
  assert.match(created[2]!.notes, /^Photos for Order 1 Reception signage \/ Installation/);
  validateData(data);

  // Reassign only matching open tasks, then complete all open tasks of the order.
  data = rule('Hand over', { type: 'job.stage', stage: 'Installation' }, [
    { type: 'tasks.update', change: 'reassign', memberId: sam, titleContains: 'book' },
  ]);
  data = act(data, as('manager'), 'job.move', {
    orderId: order.id,
    jobId: installation.id,
    stage: 'Installation',
  });
  assert.equal(data.tasks.find((t) => t.title === 'Book installers')!.assigneeId, sam);
  assert.equal(data.tasks.find((t) => t.title.startsWith('Order vinyl'))!.assigneeId, sam);
  data = rule('Wrap up', { type: 'job.stage', stage: 'Delivered' }, [
    { type: 'tasks.update', change: 'complete', memberId: '', titleContains: '' },
  ]);
  data = act(data, as('manager'), 'job.move', {
    orderId: order.id,
    jobId: installation.id,
    stage: 'Delivered',
  });
  const open = data.tasks.filter((t) => t.projectId === order.id && !t.done);
  assert.deepEqual(open, []);
  assert.ok(!data.tasks.find((t) => t.title === 'Weekly site check')!.done, 'unlinked task kept');
  assert.match(runs(data, 'Wrap up')[0]!.outcome, /Completed \d+ task\(s\)/);
  validateData(data);

  // People have no order, so they cannot complete or reassign tasks.
  assert.throws(
    () =>
      rule('Bad', { type: 'contact.created', kind: '' }, [
        { type: 'tasks.update', change: 'complete', memberId: '', titleContains: '' },
      ]),
    /does not apply/,
  );
});
