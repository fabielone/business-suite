import { createHash, randomUUID } from 'node:crypto';
import { DomainError, type Permission, type Scope, idempotencyKey } from '@suite/core';
import type { Database, Sql } from './database.js';

export interface Context {
  actorId: string;
  businessId: string;
  userName: string;
  businessName: string;
  modules: string[];
  grants: Map<Permission, Scope>;
}
export async function inContext<T>(
  database: Database,
  actorId: string,
  businessId: string,
  run: (tx: Sql, context: Context) => Promise<T>,
): Promise<T> {
  return database.transaction(async (tx) => {
    await tx.query(
      "SELECT set_config('suite.business_id',$1,true), set_config('suite.user_id',$2,true)",
      [businessId, actorId],
    );
    const membership = await tx.query<{ userName: string; businessName: string }>(
      'SELECT u.name AS "userName", b.name AS "businessName" FROM memberships m ' +
        'JOIN suite_users u ON u.id=m.user_id JOIN businesses b ON b.id=m.business_id ' +
        'WHERE m.business_id=$1 AND m.user_id=$2 AND m.active AND b.active',
      [businessId, actorId],
    );
    if (!membership.rows[0])
      throw new DomainError(
        403,
        'BUSINESS_ACCESS_DENIED',
        'Active business membership is required.',
      );
    const modules = await tx.query<{ module: string }>(
      'SELECT module FROM business_modules WHERE business_id=$1 AND enabled ORDER BY module',
      [businessId],
    );
    const grants = await tx.query<{ permission: Permission; scope: Scope }>(
      'SELECT permission,scope FROM membership_grants WHERE business_id=$1 AND user_id=$2 AND active',
      [businessId, actorId],
    );
    const context: Context = {
      actorId,
      businessId,
      ...membership.rows[0],
      modules: modules.rows.map((row) => row.module),
      grants: new Map(grants.rows.map((row) => [row.permission, row.scope])),
    };
    return run(tx, context);
  });
}
export function scope(context: Context, permission: Permission): Scope | undefined {
  if (!context.modules.includes(permission.split('.')[0]!)) return undefined;
  return context.grants.get(permission);
}
export function requireAction(context: Context, permission: Permission): Scope {
  if (!context.modules.includes(permission.split('.')[0]!)) {
    throw new DomainError(403, 'MODULE_DISABLED', 'This module is not enabled for this business.');
  }
  const grant = context.grants.get(permission);
  if (!grant)
    throw new DomainError(403, 'ACTION_DENIED', 'You do not have permission for this action.');
  return grant;
}
export function requireBusinessAction(context: Context, permission: Permission): void {
  if (requireAction(context, permission) !== 'business') {
    throw new DomainError(
      403,
      'ACTION_DENIED',
      'This action requires business-wide authorization.',
    );
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  return value;
}
export async function command<T>(
  tx: Sql,
  context: Context,
  name: string,
  rawKey: unknown,
  body: unknown,
  execute: () => Promise<T>,
): Promise<T> {
  const key = idempotencyKey(rawKey);
  const hash = createHash('sha256')
    .update(JSON.stringify(canonical(body)))
    .digest('hex');
  const args = [context.businessId, context.actorId, name, key];
  const inserted = await tx.query(
    'INSERT INTO command_receipts(business_id,actor_id,command,key,request_hash) VALUES ($1,$2,$3,$4,$5) ' +
      'ON CONFLICT DO NOTHING RETURNING key',
    [...args, hash],
  );
  if (!inserted.rows.length) {
    // Concurrent INSERT waits on the unique key. This subsequent Read Committed
    // statement observes the winner's committed result; failed commands roll back.
    const existing = await tx.query<{ request_hash: string; response: T | null }>(
      'SELECT request_hash,response FROM command_receipts WHERE business_id=$1 AND actor_id=$2 AND command=$3 AND key=$4 FOR UPDATE',
      args,
    );
    const receipt = existing.rows[0];
    if (!receipt || receipt.response === null) {
      throw new DomainError(
        409,
        'COMMAND_IN_PROGRESS',
        'The command has no completed result. Retry shortly.',
      );
    }
    if (receipt.request_hash !== hash) {
      throw new DomainError(
        409,
        'IDEMPOTENCY_CONFLICT',
        'This idempotency key was already used with different input.',
      );
    }
    return receipt.response;
  }
  const result = await execute();
  await tx.query(
    'UPDATE command_receipts SET response=$5::jsonb WHERE business_id=$1 AND actor_id=$2 AND command=$3 AND key=$4',
    [...args, JSON.stringify(result)],
  );
  return result;
}
export async function audit(
  tx: Sql,
  context: Context,
  action: string,
  type: 'job' | 'expense',
  id: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.query(
    'INSERT INTO audit_events(id,business_id,actor_id,action,record_type,record_id,before_state,after_state) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',
    [
      randomUUID(),
      context.businessId,
      context.actorId,
      action,
      type,
      id,
      before === null ? null : JSON.stringify(before),
      JSON.stringify(after),
    ],
  );
}
