import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleData,
  executeCommand,
  validateData,
  workspaceData,
  authorizeCommand,
  projectForActor,
  orderJobs,
  ROLE_GRANTS,
  type SuiteData,
  type Command,
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
const cmd = (type: string, payload: Record<string, unknown>): Command => ({
  id: `test-${++n}`,
  workspaceId: 'insignia',
  type,
  payload,
});
const as = (role: string, email = ''): Actor => ({ grants: ROLE_GRANTS[role]!, email });
/** Authorize then execute, the same order the API uses. */
const act = (data: SuiteData, actor: Actor, type: string, payload: Record<string, unknown>) => {
  const command = cmd(type, payload);
  authorizeCommand(data, command, actor);
  return executeCommand(data, command, NOW);
};
const orders = (d: SuiteData) => d.projects.filter((o) => o.workspaceId === 'insignia');
const member = (d: SuiteData, email: string) => d.contacts.find((c) => c.email === email)!.id;

test('one Project leads to several numbered Orders, each created explicitly', () => {
  const data = insignia();
  const deal = data.deals.find((d) => d.title === 'Reception signage')!;
  assert.deepEqual(
    orders(data)
      .filter((o) => o.dealId === deal.id)
      .map((o) => o.number),
    [1, 2],
  );
  const next = act(data, as('manager'), 'deal.convert', { id: deal.id, title: 'Phase 3' });
  const created = orders(next).at(-1)!;
  assert.equal(created.number, 3);
  assert.equal(created.status, 'planned');
  assert.deepEqual(
    orderJobs(created).map((j) => j.stage),
    ['Awaiting release'],
  );
  assert.equal(deal.projectId, orders(next)[0]!.id, 'first order link is preserved');
  validateData(next);
});

test('release needs a recorded deposit, or a manager with a reason', () => {
  const data = insignia();
  const phase2 = orders(data).find((o) => o.number === 2)!;
  assert.throws(
    () => act(data, as('manager'), 'order.release', { id: phase2.id, basis: 'deposit' }),
    /Record the deposit first/,
  );
  assert.throws(
    () =>
      act(data, as('manager'), 'order.release', { id: phase2.id, basis: 'manager', reason: '' }),
    /reason is required/,
  );
  assert.throws(
    () =>
      act(data, as('collaborator'), 'order.release', {
        id: phase2.id,
        basis: 'manager',
        reason: 'Trusted customer',
      }),
    /does not allow/,
  );
  const released = act(data, as('manager'), 'order.release', {
    id: phase2.id,
    basis: 'manager',
    reason: 'Trusted repeat customer; deposit waived',
  });
  const order = orders(released).find((o) => o.id === phase2.id)!;
  assert.equal(order.release?.basis, 'manager');
  assert.equal(order.status, 'active');
  assert.deepEqual(
    orderJobs(order).map((j) => j.stage),
    ['Design'],
  );
  assert.equal(
    released.payments.filter((p) => p.projectId === phase2.id).length,
    0,
    'release does not create a payment',
  );
  validateData(released);
});

test('jobs cannot move before release; only the assignee, a lead or a manager moves them', () => {
  const data = insignia();
  const phase2 = orders(data).find((o) => o.number === 2)!;
  assert.throws(
    () =>
      act(data, as('manager'), 'job.move', {
        orderId: phase2.id,
        jobId: orderJobs(phase2)[0]!.id,
        stage: 'Design',
      }),
    /Release the order/,
  );
  const first = orders(data).find((o) => o.number === 1)!;
  const [fabrication, installation] = orderJobs(first);
  const alex = as('production', 'alex@example.com');
  const moved = act(data, alex, 'job.move', {
    orderId: first.id,
    jobId: installation!.id,
    stage: 'Installation',
  });
  assert.equal(
    orderJobs(orders(moved)[0]!).find((j) => j.id === installation!.id)!.stage,
    'Installation',
  );
  assert.throws(
    () =>
      act(data, alex, 'job.move', {
        orderId: first.id,
        jobId: fabrication!.id,
        stage: 'Delivered',
      }),
    /Only the assigned team member/,
  );
  act(data, as('lead'), 'job.move', {
    orderId: first.id,
    jobId: fabrication!.id,
    stage: 'Delivered',
  });
  assert.throws(
    () => act(data, alex, 'job.save', { orderId: first.id, name: 'Extra', assigneeId: '' }),
    /does not allow/,
    'only managers assign team members',
  );
});

test('closing every job completes the order', () => {
  let data = insignia();
  const first = orders(data).find((o) => o.number === 1)!;
  for (const job of orderJobs(first))
    data = act(data, as('manager'), 'job.move', {
      orderId: first.id,
      jobId: job.id,
      stage: 'Closed',
    });
  assert.equal(orders(data).find((o) => o.id === first.id)!.status, 'completed');
});

test('tasks are completed by the assignee, their team lead or a manager', () => {
  const data = insignia();
  const task = data.tasks.find((t) => t.workspaceId === 'insignia')!;
  assert.equal(task.assigneeId, member(data, 'alex@example.com'));
  assert.throws(
    () => act(data, as('production', 'sam@example.com'), 'task.complete', { id: task.id }),
    /Only the assigned person/,
  );
  for (const actor of [
    as('production', 'ALEX@example.com'),
    as('lead', 'sam@example.com'),
    as('manager'),
  ])
    assert.equal(
      act(data, actor, 'task.complete', { id: task.id }).tasks.find((t) => t.id === task.id)!.done,
      true,
    );
});

test('production sees only its assigned pieces of released and unreleased orders, never prices', () => {
  const data = insignia();
  const alex = projectForActor(data, as('production', 'alex@example.com'));
  assert.equal(alex.deals.length, 0, 'no sales pipeline');
  assert.equal(alex.payments.length + alex.expenses.length, 0, 'no money');
  assert.deepEqual(
    alex.projects.map((o) => [o.number, o.amountMinor, orderJobs(o).map((j) => j.name)]),
    [[1, 0, ['Installation']]],
  );
  assert.ok(!alex.contacts.some((c) => c.kind === 'customer' && c.name !== 'Marina · example'));
  const nobody = projectForActor(data, as('production', 'someone@example.com'));
  assert.equal(nobody.projects.length, 0);
  const lead = projectForActor(data, as('lead', 'sam@example.com'));
  assert.equal(lead.projects.length, 2, 'team lead sees all production work');
  assert.ok(lead.projects.every((o) => o.amountMinor === 0));
  assert.equal(lead.deals.length, 0);
  const manager = projectForActor(data, as('manager'));
  assert.ok(manager.projects.some((o) => o.amountMinor > 0));
});

test('orders saved before jobs existed keep working and gain jobs on first change', () => {
  let data = insignia();
  const legacy = orders(data).find((o) => o.number === 1)!;
  delete legacy.jobs;
  delete legacy.release;
  delete legacy.number;
  legacy.status = 'active';
  validateData(data);
  const [only] = orderJobs(legacy);
  assert.equal(only!.stage, 'Design', 'active legacy orders count as released');
  data = act(data, as('manager'), 'job.move', {
    orderId: legacy.id,
    jobId: only!.id,
    stage: 'Fabrication',
  });
  assert.equal(orders(data).find((o) => o.id === legacy.id)!.jobs!.length, 1);
  validateData(data);
});
