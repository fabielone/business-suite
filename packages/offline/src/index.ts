import {
  currency,
  money,
  object,
  text,
  uuid,
  version,
  type Job,
  type Expense,
  type Workspace,
} from '@suite/core';
export type { Job, Expense, Workspace } from '@suite/core';

export interface Snapshot {
  workspace: Workspace;
  jobs: Job[];
  expenses: Expense[];
  fetchedAt: string;
}
export interface PendingCommand {
  id: string;
  kind: 'expense.submit' | 'job.close';
  path: string;
  body: Record<string, unknown>;
  createdAt: string;
  status: 'queued' | 'conflict' | 'rejected';
  message?: string;
}
export interface LocalState {
  schemaVersion: 1;
  owner: { businessId: string; userId: string } | null;
  snapshot: Snapshot | null;
  commands: PendingCommand[];
  blockedReason: string | null;
  lastSyncAt: string | null;
}
export const emptyState = (): LocalState => ({
  schemaVersion: 1,
  owner: null,
  snapshot: null,
  commands: [],
  blockedReason: null,
  lastSyncAt: null,
});
/** Must commit atomically and serialize concurrent updates, including other tabs. No network in callback. */
export interface LocalStore {
  read(): Promise<LocalState>;
  update(change: (current: LocalState) => LocalState): Promise<LocalState>;
}
export interface TransportOptions {
  businessId: string;
  body?: unknown;
  idempotencyKey?: string;
  demoSessionId?: string;
}
export type Transport = <T>(path: string, options: TransportOptions) => Promise<T>;
export interface OfflineOptions {
  store: LocalStore;
  transport: Transport;
  businessId: string;
  userId: string;
  newId: () => string;
  now?: () => string;
}
export class SyncError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}
export function statusOf(error: unknown): number {
  return typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
    ? error.status
    : 0;
}
export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Sync could not finish.';
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function timestamp(value: unknown): void {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value)))
    throw new Error('Invalid timestamp');
}
/** Local storage is untrusted input. A queue record can express only these two intents. */
function validateStoredCommand(value: unknown): void {
  const c = object(value, ['id', 'kind', 'path', 'body', 'createdAt', 'status', 'message']);
  uuid(c.id, 'Command');
  timestamp(c.createdAt);
  if (typeof c.status !== 'string' || !['queued', 'conflict', 'rejected'].includes(c.status))
    throw new Error('Invalid command status');
  if (c.message !== undefined && typeof c.message !== 'string')
    throw new Error('Invalid command message');
  if (c.kind === 'expense.submit') {
    if (c.path !== '/expenses') throw new Error('Invalid expense route');
    const b = object(c.body, [
      'description',
      'amountMinor',
      'currency',
      'missingReceiptReason',
      'jobId',
    ]);
    text(b.description, 'Description', 240);
    money(b.amountMinor);
    currency(b.currency);
    text(b.missingReceiptReason, 'Missing receipt reason', 1000);
    if (b.jobId !== undefined) uuid(b.jobId, 'Job');
  } else if (c.kind === 'job.close') {
    const match = typeof c.path === 'string' ? /^\/jobs\/([^/]+)\/close$/.exec(c.path) : null;
    if (!match) throw new Error('Invalid completion route');
    uuid(match[1], 'Job');
    const b = object(c.body, ['version']);
    version(b.version);
  } else throw new Error('Unsupported stored intent');
}
function validateStoredState(value: unknown): asserts value is LocalState {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.commands))
    throw new Error('Invalid local format');
  if (value.owner !== undefined && value.owner !== null) {
    const owner = object(value.owner, ['businessId', 'userId']);
    uuid(owner.businessId, 'Business');
    uuid(owner.userId, 'User');
  }
  if (value.snapshot !== null) {
    if (
      !record(value.snapshot) ||
      !record(value.snapshot.workspace) ||
      !Array.isArray(value.snapshot.jobs) ||
      !Array.isArray(value.snapshot.expenses)
    )
      throw new Error('Invalid snapshot');
    const w = value.snapshot.workspace;
    if (
      !record(w.business) ||
      !record(w.user) ||
      !Array.isArray(w.modules) ||
      !Array.isArray(w.permissions) ||
      typeof w.demo !== 'boolean'
    )
      throw new Error('Invalid workspace');
    uuid(w.business.id, 'Business');
    uuid(w.user.id, 'User');
    if (
      record(value.owner) &&
      (value.owner.businessId !== w.business.id || value.owner.userId !== w.user.id)
    )
      throw new Error('Snapshot owner mismatch');
    if (
      !w.modules.every((item) => typeof item === 'string') ||
      !w.permissions.every((item) => typeof item === 'string')
    )
      throw new Error('Invalid workspace grants');
    if (w.demo) uuid(w.demoSessionId, 'Demo session');
    timestamp(value.snapshot.fetchedAt);
    for (const item of [...value.snapshot.jobs, ...value.snapshot.expenses]) {
      if (!record(item)) throw new Error('Invalid cached record');
      uuid(item.id, 'Record');
      version(item.version);
    }
  }
  if (value.blockedReason !== null && typeof value.blockedReason !== 'string')
    throw new Error('Invalid lock reason');
  if (value.lastSyncAt !== null) timestamp(value.lastSyncAt);
  const ids = new Set<string>();
  for (const command of value.commands) {
    validateStoredCommand(command);
    if (ids.has(command.id)) throw new Error('Duplicate command ID');
    ids.add(command.id);
  }
}

/** Reads are confirmed snapshots; queued intents are separate and never counted as approved/paid. */
export class OfflineClient {
  private running: Promise<LocalState> | null = null;
  private readonly now: () => string;
  constructor(private readonly options: OfflineOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
  }
  private validate(s: LocalState): void {
    try {
      validateStoredState(s);
    } catch {
      throw new SyncError(
        400,
        'LOCAL_FORMAT',
        'This local database needs a supported migration or repair. It has not been overwritten.',
      );
    }
    const w = s.snapshot?.workspace;
    const owner = s.owner ?? (w ? { userId: w.user.id, businessId: w.business.id } : null);
    if (
      (!owner && s.commands.length) ||
      (owner &&
        (owner.userId !== this.options.userId || owner.businessId !== this.options.businessId))
    )
      throw new SyncError(
        403,
        'LOCAL_IDENTITY_MISMATCH',
        'The stored workspace belongs to another identity.',
      );
  }
  async read(): Promise<LocalState> {
    const s = await this.options.store.read();
    this.validate(s);
    return s;
  }
  private async lock(reason: string): Promise<void> {
    await this.options.store.update((s) => {
      this.validate(s);
      return {
        ...s,
        owner:
          s.owner ??
          (s.snapshot
            ? { userId: s.snapshot.workspace.user.id, businessId: s.snapshot.workspace.business.id }
            : null),
        snapshot: null,
        blockedReason: reason,
      };
    });
  }
  /** Explicit clear is only for fictional demo reset. Callers must warn about unsynced entries. */
  reset(): Promise<LocalState> {
    return this.options.store.update(() => emptyState());
  }
  async discard(id: string): Promise<LocalState> {
    // Never discard queued/uncertain delivery: the server may already have committed it.
    return this.options.store.update((s) => {
      this.validate(s);
      return { ...s, commands: s.commands.filter((c) => c.id !== id || c.status === 'queued') };
    });
  }
  async enqueue(
    kind: PendingCommand['kind'],
    input: Record<string, unknown>,
  ): Promise<PendingCommand> {
    let command!: PendingCommand;
    await this.options.store.update((s) => {
      this.validate(s);
      const w = s.snapshot?.workspace;
      if (!w || s.blockedReason)
        throw new SyncError(
          403,
          'LOCAL_LOCKED',
          s.blockedReason ?? 'Connect once to prepare this device.',
        );
      if (w.user.id !== this.options.userId || w.business.id !== this.options.businessId)
        throw new SyncError(
          403,
          'IDENTITY_MISMATCH',
          'Stored workspace does not match this account.',
        );
      let path: string;
      let body: Record<string, unknown>;
      if (kind === 'expense.submit') {
        if (!w.modules.includes('money') || !w.permissions.includes('money.expenses.submit'))
          throw new SyncError(403, 'FORBIDDEN', 'Expense submission is unavailable.');
        const b = object(input, [
          'description',
          'amountMinor',
          'currency',
          'missingReceiptReason',
          'jobId',
        ]);
        body = {
          description: text(b.description, 'Description', 240),
          amountMinor: money(b.amountMinor),
          currency: currency(b.currency),
          missingReceiptReason: text(b.missingReceiptReason, 'Missing receipt reason', 1000),
        };
        if (b.jobId) {
          const id = uuid(b.jobId, 'Job');
          if (!s.snapshot!.jobs.some((j) => j.id === id))
            throw new SyncError(400, 'UNKNOWN_JOB', 'Prepare this job online first.');
          body.jobId = id;
        }
        path = '/expenses';
      } else if (kind === 'job.close') {
        if (!w.modules.includes('work') || !w.permissions.includes('work.jobs.close'))
          throw new SyncError(403, 'FORBIDDEN', 'Job completion is unavailable.');
        const b = object(input, ['jobId', 'version']);
        const id = uuid(b.jobId, 'Job');
        const job = s.snapshot!.jobs.find((j) => j.id === id);
        if (!job || job.status === 'completed' || job.version !== version(b.version))
          throw new SyncError(
            409,
            'STALE_JOB',
            'This job cannot be completed from this copy. Refresh it first.',
          );
        path = `/jobs/${id}/close`;
        body = { version: b.version };
        const pending = s.commands.find((c) => c.path === path);
        if (pending) {
          command = pending;
          return s;
        }
      } else throw new SyncError(400, 'UNSUPPORTED', 'This action is not supported offline.');
      command = {
        id: this.options.newId(),
        kind,
        path,
        body,
        createdAt: this.now(),
        status: 'queued',
      };
      return { ...s, commands: [...s.commands, command] };
    });
    return command;
  }
  async refresh(): Promise<LocalState> {
    const { transport, businessId, userId, store } = this.options;
    try {
      await this.read();
      const w = await transport<Workspace>('/workspace', { businessId });
      if (w.business.id !== businessId || w.user.id !== userId || !w.demo || !w.demoSessionId)
        throw new SyncError(
          403,
          'IDENTITY_MISMATCH',
          'This local prototype only accepts the matching fictional demo identity.',
        );
      const previous = await this.read();
      if (previous.blockedReason) throw new SyncError(403, 'LOCAL_LOCKED', previous.blockedReason);
      if (
        previous.commands.length &&
        previous.snapshot?.workspace.demoSessionId !== w.demoSessionId
      )
        throw new SyncError(
          403,
          'DEMO_SESSION_CHANGED',
          'The demo server restarted. Pending entries belong to its previous session. Inspect them before resetting local demo data.',
        );
      const [jobs, expenses] = await Promise.all([
        w.modules.includes('work') && w.permissions.includes('work.jobs.read')
          ? transport<{ jobs: Job[] }>('/jobs', { businessId })
          : { jobs: [] },
        w.modules.includes('money') && w.permissions.includes('money.expenses.read')
          ? transport<{ expenses: Expense[] }>('/expenses', { businessId })
          : { expenses: [] },
      ]);
      return await store.update((s) => {
        this.validate(s);
        if (s.blockedReason) throw new SyncError(403, 'LOCAL_LOCKED', s.blockedReason);
        if (s.commands.length && s.snapshot?.workspace.demoSessionId !== w.demoSessionId)
          throw new SyncError(
            403,
            'DEMO_SESSION_CHANGED',
            'The demo server restarted; pending entries need attention.',
          );
        return {
          ...s,
          owner: { userId, businessId },
          snapshot: {
            workspace: w,
            jobs: jobs.jobs,
            expenses: expenses.expenses,
            fetchedAt: this.now(),
          },
        };
      });
    } catch (error) {
      if (
        [401, 403].includes(statusOf(error)) &&
        !(error instanceof SyncError && error.code === 'LOCAL_IDENTITY_MISMATCH')
      )
        await this.lock(messageOf(error));
      throw error;
    }
  }
  sync(): Promise<LocalState> {
    if (!this.running)
      this.running = this.runSync().finally(() => {
        this.running = null;
      });
    return this.running;
  }
  private async runSync(): Promise<LocalState> {
    const { store, transport, businessId } = this.options;
    await this.refresh(); // Revalidate authorization and ephemeral demo generation before every batch.
    const initial = await this.read();
    for (const candidate of initial.commands.filter((c) => c.status === 'queued')) {
      const current = await this.read();
      if (current.blockedReason || !current.snapshot) break;
      const queued = current.commands.find((c) => c.id === candidate.id && c.status === 'queued');
      if (!queued) continue;
      const sentSession = current.snapshot.workspace.demoSessionId;
      try {
        const result = await transport<{ job?: Job; expense?: Expense }>(queued.path, {
          businessId,
          body: queued.body,
          idempotencyKey: queued.id,
          demoSessionId: sentSession,
        });
        // Commit acknowledgement and returned server projection together. A lost response keeps the same key.
        if (
          (queued.kind === 'job.close' && !result.job?.id) ||
          (queued.kind === 'expense.submit' && !result.expense?.id)
        )
          throw new SyncError(
            502,
            'INVALID_RESPONSE',
            'The server acknowledgement was incomplete. Entry remains queued.',
          );
        await store.update((s) => {
          this.validate(s);
          if (s.blockedReason || !s.snapshot || !s.commands.some((c) => c.id === queued.id))
            return s;
          if (s.snapshot.workspace.demoSessionId !== sentSession)
            throw new SyncError(
              409,
              'DEMO_SESSION_CHANGED',
              'The demo session changed while this command was awaiting confirmation.',
            );
          const snapshot = { ...s.snapshot };
          if (result.job)
            snapshot.jobs = [...snapshot.jobs.filter((j) => j.id !== result.job!.id), result.job];
          if (result.expense)
            snapshot.expenses = [
              ...snapshot.expenses.filter((e) => e.id !== result.expense!.id),
              result.expense,
            ];
          return {
            ...s,
            snapshot,
            commands: s.commands.filter((c) => c.id !== queued.id),
            lastSyncAt: this.now(),
          };
        });
      } catch (error) {
        if (
          error instanceof SyncError &&
          ['LOCAL_FORMAT', 'LOCAL_IDENTITY_MISMATCH'].includes(error.code)
        )
          throw error;
        const status = statusOf(error);
        if ([401, 403].includes(status)) {
          await this.lock(messageOf(error));
          throw error;
        }
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'DEMO_SESSION_CHANGED'
        ) {
          await this.lock(messageOf(error));
          throw error;
        }
        if (status === 0 || status >= 500 || [408, 429].includes(status)) throw error;
        await store.update((s) => {
          this.validate(s);
          return {
            ...s,
            commands: s.commands.map((c) =>
              c.id === queued.id
                ? {
                    ...c,
                    status: status === 409 ? 'conflict' : 'rejected',
                    message: messageOf(error),
                  }
                : c,
            ),
          };
        });
      }
    }
    return this.read();
  }
}
