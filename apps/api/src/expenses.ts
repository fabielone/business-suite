import { randomUUID } from 'node:crypto';
import {
  DomainError,
  type Expense,
  object,
  text,
  uuid,
  money,
  currency,
  version,
} from '@suite/core';
import type { Sql } from './database.js';
import { type Context, requireAction, requireBusinessAction, command, audit } from './context.js';
import { getJob, jobInScope } from './jobs.js';

interface ExpenseRow {
  id: string;
  job_id: string | null;
  description: string;
  amount_minor: string | number;
  currency: 'MXN';
  payer_user_id: string;
  status: Expense['status'];
  missing_receipt_reason: string;
  version: number;
  review_reason: string | null;
}
function view(row: ExpenseRow): Expense {
  return {
    id: row.id,
    jobId: row.job_id,
    description: row.description,
    amountMinor: Number(row.amount_minor),
    currency: row.currency,
    payerUserId: row.payer_user_id,
    status: row.status,
    missingReceiptReason: row.missing_receipt_reason,
    version: row.version,
    reviewReason: row.review_reason,
  };
}
async function getExpense(
  tx: Sql,
  context: Context,
  id: string,
  lock = false,
): Promise<Expense | undefined> {
  const result = await tx.query<ExpenseRow>(
    'SELECT * FROM expenses WHERE business_id=$1 AND id=$2' + (lock ? ' FOR UPDATE' : ''),
    [context.businessId, id],
  );
  return result.rows[0] ? view(result.rows[0]) : undefined;
}
export async function listExpenses(tx: Sql, context: Context): Promise<{ expenses: Expense[] }> {
  const allowed = requireAction(context, 'money.expenses.read');
  if (allowed !== 'own' && allowed !== 'business')
    throw new DomainError(403, 'ACTION_DENIED', 'Expense access scope is not supported.');
  const found = await tx.query<ExpenseRow>(
    'SELECT * FROM expenses WHERE business_id=$1' +
      (allowed === 'own' ? ' AND payer_user_id=$2' : '') +
      ' ORDER BY created_at,id',
    allowed === 'own' ? [context.businessId, context.actorId] : [context.businessId],
  );
  return { expenses: found.rows.map(view) };
}
export async function submitExpense(
  tx: Sql,
  context: Context,
  input: unknown,
  key: unknown,
): Promise<{ expense: Expense }> {
  requireAction(context, 'money.expenses.submit');
  const body = object(input, [
    'jobId',
    'description',
    'amountMinor',
    'currency',
    'missingReceiptReason',
  ]);
  const normalized = {
    jobId: body.jobId === undefined || body.jobId === null ? null : uuid(body.jobId, 'Job'),
    description: text(body.description, 'Description', 500),
    amountMinor: money(body.amountMinor),
    currency: currency(body.currency),
    missingReceiptReason: text(body.missingReceiptReason, 'Missing receipt reason', 1000),
  };
  if (normalized.jobId) {
    const allowed = requireAction(context, 'work.jobs.read');
    const job = await getJob(tx, context, normalized.jobId);
    if (!job || !jobInScope(job, context, allowed))
      throw new DomainError(404, 'NOT_FOUND', 'Job not found.');
  }
  const expense = await command(tx, context, 'expenses.submit', key, normalized, async () => {
    const id = randomUUID();
    await tx.query(
      'INSERT INTO expenses(id,business_id,job_id,description,amount_minor,currency,payer_user_id,missing_receipt_reason) ' +
        'VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        context.businessId,
        normalized.jobId,
        normalized.description,
        normalized.amountMinor,
        normalized.currency,
        context.actorId,
        normalized.missingReceiptReason,
      ],
    );
    const created = (await getExpense(tx, context, id))!;
    await audit(tx, context, 'expense.submitted', 'expense', id, null, created);
    return created;
  });
  return { expense };
}
export async function reviewExpense(
  tx: Sql,
  context: Context,
  rawId: unknown,
  input: unknown,
  key: unknown,
): Promise<{ expense: Expense }> {
  requireBusinessAction(context, 'money.expenses.review');
  const id = uuid(rawId, 'Expense');
  const body = object(input, ['version', 'decision', 'reason']);
  const expectedVersion = version(body.version);
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    throw new DomainError(400, 'INVALID_INPUT', 'Choose approve or reject.');
  }
  const decision = body.decision;
  const reason = body.reason === undefined ? null : text(body.reason, 'Review reason', 1000);
  const previous = await getExpense(tx, context, id, true);
  if (!previous) throw new DomainError(404, 'NOT_FOUND', 'Expense not found.');
  if (decision === 'approve' && previous.payerUserId === context.actorId) {
    throw new DomainError(
      403,
      'SELF_APPROVAL_DENIED',
      'You cannot approve your own missing-receipt expense.',
    );
  }
  const expense = await command(
    tx,
    context,
    'expenses.review',
    key,
    { id, version: expectedVersion, decision, reason },
    async () => {
      if (previous.version !== expectedVersion)
        throw new DomainError(
          409,
          'VERSION_CONFLICT',
          'This expense changed. Reload before reviewing it.',
        );
      if (previous.status !== 'submitted')
        throw new DomainError(409, 'INVALID_TRANSITION', 'This expense has already been reviewed.');
      await tx.query(
        'UPDATE expenses SET status=$3,reviewed_by=$4,review_reason=$5,reviewed_at=now(),version=version+1 WHERE business_id=$1 AND id=$2',
        [
          context.businessId,
          id,
          decision === 'approve' ? 'approved' : 'rejected',
          context.actorId,
          reason,
        ],
      );
      const reviewed = (await getExpense(tx, context, id))!;
      await audit(
        tx,
        context,
        'expense.' + (decision === 'approve' ? 'approved' : 'rejected'),
        'expense',
        id,
        previous,
        reviewed,
      );
      return reviewed;
    },
  );
  return { expense };
}
