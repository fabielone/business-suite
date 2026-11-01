import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleData,
  executeCommand,
  emptyData,
  validateData,
  moneyInput,
  allocate,
  expenseRemaining,
  projectMoney,
  householdBalances,
  poolBalance,
  csvCell,
  workspaceData,
} from '../src/operations/index.js';

test('samples validate and household ledgers reconcile without counting contributions twice', () => {
  const data = validateData(sampleData('2026-10-30T12:00:00Z'));
  const household = data.workspaces.find((w) => w.preset === 'household')!;
  const balances = householdBalances(data, household, '2026-10');
  assert.deepEqual(
    balances.map((b) => b.balance),
    [120000, 140000, -60000],
  );
  assert.deepEqual(
    balances.map((b) => b.target),
    [750000, 375000, 375000],
  );
  assert.equal(
    balances.reduce((a, b) => a + b.balance, 0),
    poolBalance(
      data.expenses.filter((e) => e.workspaceId === household.id),
      data.payments.filter((p) => p.workspaceId === household.id),
    ),
  );
});
test('minor units and deterministic equal/weighted rounding preserve every cent', () => {
  assert.equal(moneyInput('12.01'), 1201);
  for (const invalid of ['1.001', '-1', '1e3', 'Infinity', '1,200'])
    assert.throws(() => moneyInput(invalid));
  const members = [
    { id: 'a', weight: 2 },
    { id: 'b', weight: 1 },
    { id: 'c', weight: 1 },
  ];
  assert.deepEqual(
    allocate(101, members).map((s) => s.amountMinor),
    [51, 25, 25],
  );
  assert.deepEqual(
    allocate(100, members, true).map((s) => s.amountMinor),
    [34, 33, 33],
  );
});
test('financial retries, partial reimbursement, overpayment and corrections preserve balances', () => {
  let data = sampleData();
  const expense = data.expenses.find((e) => e.workspaceId === 'insignia')!;
  const command = {
    id: 'pay-one',
    workspaceId: 'insignia',
    type: 'payment.add',
    payload: {
      kind: 'reimbursement',
      amountMinor: 10000,
      toId: expense.payerId,
      date: '2026-10-30',
      method: 'transfer',
      reference: 'TEST payment',
      allocations: [{ expenseId: expense.id, amountMinor: 10000 }],
    },
  };
  data = executeCommand(data, command);
  assert.equal(expenseRemaining(data, expense), 410000);
  assert.deepEqual(executeCommand(data, command), data);
  assert.throws(
    () =>
      executeCommand(data, {
        ...command,
        payload: { ...command.payload, reference: 'changed' },
      }),
    /already used/,
  );
  assert.throws(
    () =>
      executeCommand(data, {
        ...command,
        id: 'overpay',
        payload: {
          ...command.payload,
          amountMinor: 420000,
          allocations: [{ expenseId: expense.id, amountMinor: 420000 }],
        },
      }),
    /Allocation exceeds/,
  );
  assert.throws(
    () =>
      executeCommand(data, {
        id: 'void-expense',
        workspaceId: 'insignia',
        type: 'money.void',
        payload: {
          collection: 'expenses',
          id: expense.id,
          reason: 'Correction',
        },
      }),
    /Void linked/,
  );
  data = executeCommand(data, {
    id: 'void-payment',
    workspaceId: 'insignia',
    type: 'money.void',
    payload: {
      collection: 'payments',
      id: 'pay-one',
      reason: 'Incorrect payment record',
    },
  });
  assert.equal(expenseRemaining(data, expense), 420000);
});
test('job price stays independent from costs and cannot fall below collections', () => {
  const data = sampleData();
  const job = data.projects[0]!;
  assert.deepEqual(projectMoney(data, job.id), {
    agreed: 2800000,
    received: 1000000,
    due: 1800000,
    cost: 420000,
    pendingCost: 0,
    margin: 2380000,
  });
  assert.throws(
    () =>
      executeCommand(data, {
        id: 'lower-price',
        workspaceId: job.workspaceId,
        type: 'project.save',
        payload: { ...job, amountMinor: 900000 },
      }),
    /lower than/,
  );
  assert.throws(
    () =>
      executeCommand(data, {
        id: 'too-much',
        workspaceId: job.workspaceId,
        type: 'payment.add',
        payload: {
          kind: 'receipt',
          amountMinor: 1800001,
          projectId: job.id,
          method: 'cash',
          date: '2026-10-30',
          reference: 'Excess',
        },
      }),
    /remaining balance/,
  );
});
test('household settlements cannot exceed a debt and members with balances remain visible', () => {
  let data = sampleData();
  const ws = data.workspaces.find((w) => w.preset === 'household')!;
  const balances = householdBalances(data, ws);
  const debtor = balances.find((b) => b.balance < 0)!;
  const creditor = balances[0]!;
  const payload = {
    kind: 'settlement',
    fromId: debtor.member.id,
    toId: creditor.member.id,
    amountMinor: 60001,
    date: '2026-10-30',
    method: 'cash',
    reference: 'Household settlement',
  };
  assert.throws(
    () =>
      executeCommand(data, {
        id: 'settle',
        workspaceId: ws.id,
        type: 'payment.add',
        payload,
      }),
    /outstanding share/,
  );
  assert.throws(
    () =>
      executeCommand(data, {
        id: 'archive-debtor',
        workspaceId: ws.id,
        type: 'record.archive',
        payload: { collection: 'contacts', id: debtor.member.id },
      }),
    /Settle/,
  );
  data = executeCommand(data, {
    id: 'settle',
    workspaceId: ws.id,
    type: 'payment.add',
    payload: { ...payload, amountMinor: 60000 },
  });
  assert.equal(
    householdBalances(data, ws).find((b) => b.member.id === debtor.member.id)?.balance,
    0,
  );
});
test('monthly recurring chores clamp dates and retry without duplicating the next chore', () => {
  let data = executeCommand(emptyData(), {
    id: 'create',
    workspaceId: 'home',
    type: 'workspace.create',
    payload: { name: 'Household', preset: 'household' },
  });
  data = executeCommand(data, {
    id: 'monthly',
    workspaceId: 'home',
    type: 'task.save',
    payload: { title: 'Pay rent', recurrence: 'monthly', due: '2026-01-31' },
  });
  const complete = {
    id: 'complete',
    workspaceId: 'home',
    type: 'task.complete',
    payload: { id: 'monthly' },
  };
  data = executeCommand(data, complete);
  assert.equal(data.tasks[1]?.due, '2026-02-28');
  assert.equal(executeCommand(data, complete).tasks.length, 2);
});
test('disabled modules retain records, enforce entitlements, and reject stale revisions', () => {
  const data = sampleData();
  const ws = data.workspaces[0]!;
  const disabled = executeCommand(data, {
    id: 'settings',
    workspaceId: ws.id,
    type: 'workspace.settings',
    payload: { ...ws, modules: ws.modules.filter((m) => m !== 'crm') },
  });
  assert.equal(disabled.deals.length, data.deals.length);
  assert.throws(
    () =>
      executeCommand(disabled, {
        id: 'deal',
        workspaceId: ws.id,
        type: 'deal.save',
        payload: { title: 'No', stageId: 'new', amountMinor: 0 },
      }),
    /Enable crm/,
  );
  assert.throws(
    () =>
      executeCommand(data, {
        id: 'downgrade',
        workspaceId: ws.id,
        type: 'workspace.settings',
        payload: { ...ws, plan: 'personal' },
      }),
    /plan does not include/,
  );
  assert.throws(
    () =>
      executeCommand(data, {
        id: 'stale',
        workspaceId: ws.id,
        type: 'contact.save',
        payload: { name: 'Stale', kind: 'member' },
        expectedRevision: 0,
      }),
    /workspace changed/,
  );
});
test('backup validation rejects cross-workspace links and over-reimbursements', () => {
  const data = sampleData();
  const backup = workspaceData(data, data.workspaces[0]!);
  assert.equal(validateData(backup).workspaces.length, 1);
  const bad = structuredClone(data);
  bad.projects[0]!.contactId = data.contacts.find((c) => c.workspaceId === 'household')!.id;
  assert.throws(() => validateData(bad), /another workspace/);
  assert.equal(csvCell('=SUM(A1:A2)'), '"\'=SUM(A1:A2)"');
});
