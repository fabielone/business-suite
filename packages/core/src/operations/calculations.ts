import type { SuiteData, Workspace, Contact, Expense, Payment } from './types.js';

export class OperationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  condition: unknown,
  message: string,
  code = 'INVALID_INPUT',
): asserts condition {
  if (!condition) throw new OperationError(code, message);
}
export const active = <T extends { archived: boolean }>(rows: T[]) =>
  rows.filter((r) => !r.archived);
export const posted = <T extends { voidReason: string }>(rows: T[]) =>
  rows.filter((r) => !r.voidReason);
export function moneyInput(value: string): number {
  ensure(
    /^\d{1,10}(\.\d{1,2})?$/.test(value.trim()),
    'Enter a positive amount with at most two decimal places.',
  );
  const [whole = '0', fraction = ''] = value.trim().split('.');
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  ensure(Number.isSafeInteger(amount), 'Amount is too large.');
  return amount;
}
export function sum(values: number[]): number {
  const result = values.reduce((a, b) => a + b, 0);
  ensure(Number.isSafeInteger(result), 'The total exceeds the supported amount range.');
  return result;
}
/** Largest-remainder allocation: every cent belongs to exactly one person. */
export function allocate(amount: number, members: Pick<Contact, 'id' | 'weight'>[], equal = false) {
  ensure(members.length > 0, 'Add at least one household member before splitting expenses.');
  const weights = members.map((m) => (equal ? 1 : m.weight));
  ensure(
    weights.every((w) => Number.isInteger(w) && w > 0 && w <= 100000),
    'Each member needs a positive contribution weight.',
  );
  const total = sum(weights);
  const shares = members.map((m, i) => {
    const numerator = BigInt(amount) * BigInt(weights[i]!);
    return {
      contactId: m.id,
      amountMinor: Number(numerator / BigInt(total)),
      remainder: Number(numerator % BigInt(total)),
    };
  });
  let left = amount - sum(shares.map((s) => s.amountMinor));
  const order = [...shares].sort(
    (a, b) => b.remainder - a.remainder || a.contactId.localeCompare(b.contactId),
  );
  for (const share of order) {
    if (left-- > 0) share.amountMinor++;
  }
  return shares.map(({ contactId, amountMinor }) => ({
    contactId,
    amountMinor,
  }));
}
export function expenseRemaining(data: SuiteData, expense: Expense): number {
  if (expense.voidReason || expense.status !== 'approved' || expense.payerId === 'pool') return 0;
  return (
    expense.amountMinor -
    sum(
      posted(data.payments)
        .filter((p) => p.workspaceId === expense.workspaceId && p.kind === 'reimbursement')
        .flatMap((p) =>
          p.allocations.filter((a) => a.expenseId === expense.id).map((a) => a.amountMinor),
        ),
    )
  );
}
export function projectMoney(data: SuiteData, projectId: string) {
  const p = data.projects.find((p) => p.id === projectId);
  ensure(p, 'Job not found.');
  const expenses = posted(data.expenses).filter(
    (e) => e.workspaceId === p.workspaceId && e.projectId === projectId,
  );
  const received = sum(
    posted(data.payments)
      .filter(
        (x) => x.workspaceId === p.workspaceId && x.kind === 'receipt' && x.projectId === projectId,
      )
      .map((x) => x.amountMinor),
  );
  const cost = sum(expenses.filter((e) => e.status === 'approved').map((e) => e.amountMinor));
  return {
    agreed: p.amountMinor,
    received,
    due: p.amountMinor - received,
    cost,
    pendingCost: sum(expenses.filter((e) => e.status === 'submitted').map((e) => e.amountMinor)),
    margin: p.amountMinor - cost,
  };
}
export function householdBalances(data: SuiteData, workspace: Workspace, month?: string) {
  const members = data.contacts.filter(
    (c) => c.workspaceId === workspace.id && c.kind === 'member',
  );
  const expenses = posted(data.expenses).filter(
    (e) => e.workspaceId === workspace.id && e.status === 'approved',
  );
  const payments = posted(data.payments).filter((p) => p.workspaceId === workspace.id);
  const budget = active(members).length
    ? allocate(workspace.monthlyBudgetMinor, active(members))
    : [];
  return members.map((member) => {
    const paid = sum(expenses.filter((e) => e.payerId === member.id).map((e) => e.amountMinor));
    const share = sum(
      expenses.flatMap((e) =>
        e.shares.filter((s) => s.contactId === member.id).map((s) => s.amountMinor),
      ),
    );
    const contributions = sum(
      payments
        .filter((p) => p.kind === 'contribution' && p.fromId === member.id)
        .map((p) => p.amountMinor),
    );
    const contributedThisMonth = sum(
      payments
        .filter(
          (p) =>
            p.kind === 'contribution' &&
            p.fromId === member.id &&
            (!month || p.date.startsWith(month)),
        )
        .map((p) => p.amountMinor),
    );
    const settlements = payments.filter((p) => p.kind === 'settlement');
    const sent = sum(settlements.filter((p) => p.fromId === member.id).map((p) => p.amountMinor));
    const received = sum(settlements.filter((p) => p.toId === member.id).map((p) => p.amountMinor));
    const target = budget.find((s) => s.contactId === member.id)?.amountMinor ?? 0;
    return {
      member,
      paid,
      share,
      contributions,
      target,
      contributedThisMonth,
      contributionDue: Math.max(0, target - contributedThisMonth),
      balance: paid + contributions + sent - share - received,
    };
  });
}
export function poolBalance(expenses: Expense[], payments: Payment[]): number {
  return (
    sum(
      posted(payments).map(
        (p) => (p.toId === 'pool' ? p.amountMinor : 0) - (p.fromId === 'pool' ? p.amountMinor : 0),
      ),
    ) -
    sum(
      posted(expenses)
        .filter((e) => e.payerId === 'pool')
        .map((e) => e.amountMinor),
    )
  );
}
export function renderMessage(template: string, values: Record<string, string>): string {
  return template.replace(
    /\{\{\s*(\w+)\s*\}\}/g,
    (_all, key: string) => values[key] ?? `{{${key}}}`,
  );
}
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
