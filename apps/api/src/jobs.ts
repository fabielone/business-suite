import { randomUUID } from 'node:crypto';
import {
  DomainError,
  type Job,
  type JobStatus,
  type Scope,
  object,
  text,
  uuid,
  money,
  currency,
  version,
} from '@suite/core';
import type { Sql } from './database.js';
import {
  type Context,
  scope,
  requireAction,
  requireBusinessAction,
  command,
  audit,
} from './context.js';

interface JobRow {
  id: string;
  business_id: string;
  title: string;
  customer_name: string;
  status: JobStatus;
  agreed_price_minor: string | number;
  currency: 'MXN';
  created_by: string;
  version: number;
}
export interface InternalJob extends Job {
  agreedPriceMinor: number;
  createdBy: string;
}
export async function getJob(
  tx: Sql,
  context: Context,
  id: string,
  lock = false,
): Promise<InternalJob | undefined> {
  const result = await tx.query<JobRow>(
    'SELECT * FROM jobs WHERE business_id=$1 AND id=$2' + (lock ? ' FOR UPDATE' : ''),
    [context.businessId, id],
  );
  const row = result.rows[0];
  if (!row) return undefined;
  const assignments = await tx.query<{ user_id: string }>(
    'SELECT user_id FROM job_assignments WHERE business_id=$1 AND job_id=$2 ORDER BY user_id',
    [context.businessId, id],
  );
  return {
    id: row.id,
    title: row.title,
    customerName: row.customer_name,
    status: row.status,
    agreedPriceMinor: Number(row.agreed_price_minor),
    currency: row.currency,
    assignedUserIds: assignments.rows.map((item) => item.user_id),
    version: row.version,
    createdBy: row.created_by,
  };
}
export function jobInScope(
  job: InternalJob,
  context: Context,
  allowed: Scope | undefined,
): boolean {
  return (
    allowed === 'business' ||
    (allowed === 'assigned' && job.assignedUserIds.includes(context.actorId)) ||
    (allowed === 'own' && job.createdBy === context.actorId)
  );
}
export function publicJob(job: InternalJob, context: Context): Job {
  const { createdBy: _createdBy, agreedPriceMinor, ...result } = job;
  return jobInScope(job, context, scope(context, 'work.prices.read'))
    ? { ...result, agreedPriceMinor }
    : result;
}
export async function listJobs(tx: Sql, context: Context): Promise<{ jobs: Job[] }> {
  const allowed = requireAction(context, 'work.jobs.read');
  const where =
    allowed === 'assigned'
      ? ' AND EXISTS (SELECT 1 FROM job_assignments a WHERE a.business_id=j.business_id AND a.job_id=j.id AND a.user_id=$2)'
      : allowed === 'own'
        ? ' AND j.created_by=$2'
        : '';
  const found = await tx.query<{ id: string }>(
    'SELECT j.id FROM jobs j WHERE j.business_id=$1' + where + ' ORDER BY j.created_at,j.id',
    allowed === 'business' ? [context.businessId] : [context.businessId, context.actorId],
  );
  const jobs: Job[] = [];
  for (const row of found.rows) {
    const job = await getJob(tx, context, row.id);
    if (job) jobs.push(publicJob(job, context));
  }
  return { jobs };
}
export async function createJob(
  tx: Sql,
  context: Context,
  input: unknown,
  key: unknown,
): Promise<{ job: Job }> {
  requireBusinessAction(context, 'work.jobs.create');
  const body = object(input, [
    'title',
    'customerName',
    'agreedPriceMinor',
    'currency',
    'assignedUserIds',
  ]);
  if (!Array.isArray(body.assignedUserIds) || body.assignedUserIds.length > 50) {
    throw new DomainError(400, 'INVALID_INPUT', 'Choose at most 50 assigned members.');
  }
  const normalized = {
    title: text(body.title, 'Title', 200),
    customerName: text(body.customerName, 'Customer name', 200),
    agreedPriceMinor: money(body.agreedPriceMinor, true),
    currency: currency(body.currency),
    assignedUserIds: [
      ...new Set(body.assignedUserIds.map((id) => uuid(id, 'Assigned user'))),
    ].sort(),
  };
  const job = await command(tx, context, 'jobs.create', key, normalized, async () => {
    for (const userId of normalized.assignedUserIds) {
      const member = await tx.query(
        'SELECT user_id FROM memberships WHERE business_id=$1 AND user_id=$2 AND active',
        [context.businessId, userId],
      );
      if (!member.rows.length)
        throw new DomainError(
          400,
          'INVALID_ASSIGNEE',
          'Assignments require active members of this business.',
        );
    }
    const id = randomUUID();
    await tx.query(
      'INSERT INTO jobs(id,business_id,title,customer_name,agreed_price_minor,currency,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        id,
        context.businessId,
        normalized.title,
        normalized.customerName,
        normalized.agreedPriceMinor,
        normalized.currency,
        context.actorId,
      ],
    );
    for (const userId of normalized.assignedUserIds) {
      await tx.query('INSERT INTO job_assignments(business_id,job_id,user_id) VALUES ($1,$2,$3)', [
        context.businessId,
        id,
        userId,
      ]);
    }
    const created = (await getJob(tx, context, id))!;
    await audit(tx, context, 'job.created', 'job', id, null, created);
    return created;
  });
  return { job: publicJob(job, context) };
}
export async function closeJob(
  tx: Sql,
  context: Context,
  rawId: unknown,
  input: unknown,
  key: unknown,
): Promise<{ job: Job }> {
  const allowed = requireAction(context, 'work.jobs.close');
  const id = uuid(rawId, 'Job');
  const body = object(input, ['version']);
  const expectedVersion = version(body.version);
  const previous = await getJob(tx, context, id, true);
  if (!previous || !jobInScope(previous, context, allowed)) {
    throw new DomainError(404, 'NOT_FOUND', 'Job not found.');
  }
  const job = await command(
    tx,
    context,
    'jobs.close',
    key,
    { id, version: expectedVersion },
    async () => {
      if (previous.version !== expectedVersion)
        throw new DomainError(
          409,
          'VERSION_CONFLICT',
          'This job changed. Reload before closing it.',
        );
      if (previous.status === 'completed')
        throw new DomainError(409, 'INVALID_TRANSITION', 'This job is already completed.');
      await tx.query(
        "UPDATE jobs SET status='completed',closed_by=$3,closed_at=now(),version=version+1 WHERE business_id=$1 AND id=$2",
        [context.businessId, id, context.actorId],
      );
      const closed = (await getJob(tx, context, id))!;
      await audit(tx, context, 'job.closed', 'job', id, previous, closed);
      return closed;
    },
  );
  return { job: publicJob(job, context) };
}
