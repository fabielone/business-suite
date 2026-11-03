import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { DomainError, uuid } from '@suite/core';
import {
  emptyData,
  executeCommand,
  runDueAutomations,
  nextAutomationCheck,
  ROLE_GRANTS,
  authorizeCommand,
  projectForActor,
  validateData,
  type SuiteData,
  type Command,
  type Workspace,
  type Access,
  type Row,
} from '@suite/core/operations';
import type { Database, Sql } from './database.js';
import type { AuthConfig } from './auth.js';
import { operationsAuth, type Identity } from './operations-auth.js';

const TABLES = {
  contacts: 'suite_contacts',
  deals: 'suite_deals',
  projects: 'suite_projects',
  expenses: 'suite_expense_entries',
  payments: 'suite_payments',
  tasks: 'suite_tasks',
  referrals: 'suite_referrals',
  templates: 'suite_message_templates',
  drafts: 'suite_message_drafts',
  automations: 'suite_automations',
  automationRuns: 'suite_automation_runs',
  notifications: 'suite_notifications',
} as const;
/** Audit actor for changes the scheduler makes; no person has this ID. */
const AUTOMATION_ACTOR = '00000000-0000-0000-0000-000000000000';
const SCHEDULER_INTERVAL_MS = 60_000;
const permitted = (grants: Access[], grant: Access) => {
  if (!grants.includes(grant))
    throw new DomainError(
      403,
      'ACTION_DENIED',
      'Your role does not allow this action. Ask the workspace owner.',
    );
};
type Membership = {
  role: string;
  name: string;
  email: string;
  user_id: string;
};
export function registerOperations(
  app: FastifyInstance,
  db: Database,
  auth: AuthConfig,
  secureCookies = true,
) {
  const { authenticate, hash } = operationsAuth(app, db, auth, secureCookies);
  async function context<T>(
    user: Identity,
    rawId: string,
    operation: (tx: Sql, member: Membership, grants: Access[]) => Promise<T>,
  ): Promise<T> {
    const spaceId = uuid(rawId, 'Workspace');
    return db.transaction(async (tx) => {
      await tx.query(
        "SELECT set_config('suite.space_id',$1,true),set_config('suite.user_id',$2,true)",
        [spaceId, user.id],
      );
      // Lock membership before all commands so revocation cannot race an authorized write.
      const membership = (
        await tx.query<Membership>(
          'SELECT role,name,email,user_id FROM suite_space_members WHERE space_id=$1 AND user_id=$2 AND active FOR SHARE',
          [spaceId, user.id],
        )
      ).rows[0];
      if (!membership)
        throw new DomainError(
          403,
          'WORKSPACE_DENIED',
          'You do not have active access to this workspace.',
        );
      return operation(tx, membership, ROLE_GRANTS[membership.role] ?? []);
    });
  }
  async function read(tx: Sql, spaceId: string, lock = false): Promise<SuiteData> {
    const workspace = (
      await tx.query<{ config: Workspace; revision: number }>(
        'SELECT config,revision FROM suite_spaces WHERE id=$1' + (lock ? ' FOR UPDATE' : ''),
        [spaceId],
      )
    ).rows[0];
    if (!workspace) throw new DomainError(404, 'NOT_FOUND', 'Workspace not found.');
    const data = emptyData();
    data.workspaces = [workspace.config];
    data.revision = workspace.revision;
    for (const [key, table] of Object.entries(TABLES))
      (data[key as keyof typeof TABLES] as unknown[]) = (
        await tx.query<{ payload: unknown }>(
          `SELECT payload FROM ${table} WHERE space_id=$1 ORDER BY id`,
          [spaceId],
        )
      ).rows.map((r) => r.payload);
    data.audit = (
      await tx.query<{ payload: SuiteData['audit'][number] }>(
        "SELECT payload FROM suite_space_audit WHERE space_id=$1 ORDER BY payload->>'at'",
        [spaceId],
      )
    ).rows.map((r) => r.payload);
    return data;
  }
  // One shared rule set: the same projection runs in example mode and in the client tests.
  const project = (data: SuiteData, grants: Access[], member: Membership) =>
    projectForActor(data, { grants, email: member.email });
  async function save(
    tx: Sql,
    before: SuiteData,
    after: SuiteData,
    actor: string,
    receipt?: { command: Command; fingerprint: string },
  ) {
    const ws = after.workspaces[0]!;
    await tx.query('UPDATE suite_spaces SET config=$2::jsonb,revision=$3 WHERE id=$1', [
      ws.id,
      JSON.stringify(ws),
      after.revision,
    ]);
    for (const [key, table] of Object.entries(TABLES) as [keyof typeof TABLES, string][]) {
      const old = new Map((before[key] as Row[]).map((r) => [r.id, r.version]));
      for (const row of after[key] as Row[])
        if (old.get(row.id) !== row.version)
          await tx.query(
            `INSERT INTO ${table}(space_id,id,version,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT(space_id,id) DO UPDATE SET version=EXCLUDED.version,payload=EXCLUDED.payload`,
            [ws.id, row.id, row.version, JSON.stringify(row)],
          );
    }
    // A command can add several entries: its own and those of the automations it set off.
    const logged = new Set(before.audit.map((a) => a.id));
    for (const audit of after.audit.filter((a) => !logged.has(a.id)))
      await tx.query(
        'INSERT INTO suite_space_audit(space_id,id,actor_id,payload) VALUES($1,$2,$3,$4::jsonb)',
        [ws.id, audit.id, actor, JSON.stringify(audit)],
      );
    if (receipt)
      await tx.query(
        'INSERT INTO suite_space_commands(space_id,id,actor_id,fingerprint) VALUES($1,$2,$3,$4)',
        [ws.id, receipt.command.id, actor, receipt.fingerprint],
      );
    await schedule(tx, after, ws.id);
  }
  async function schedule(tx: Sql, data: SuiteData, spaceId: string) {
    const next = nextAutomationCheck(data, spaceId, new Date().toISOString());
    if (next)
      await tx.query(
        'INSERT INTO suite_automation_schedule(space_id,next_check_at) VALUES($1,$2) ON CONFLICT(space_id) DO UPDATE SET next_check_at=EXCLUDED.next_check_at',
        [spaceId, next],
      );
    else await tx.query('DELETE FROM suite_automation_schedule WHERE space_id=$1', [spaceId]);
  }
  /**
   * Runs due waits and time-based triggers. The workspace row lock serializes this with
   * commands and with other API processes, and a run leaves `waiting` in the same
   * transaction that applies it, so each run happens at most once.
   */
  async function runAutomationSchedule() {
    const due = (
      await db.query<{ space_id: string }>(
        'SELECT space_id FROM suite_automation_schedule WHERE next_check_at<=now() ORDER BY next_check_at LIMIT 20',
      )
    ).rows;
    for (const { space_id: spaceId } of due)
      try {
        await db.transaction(async (tx) => {
          await tx.query("SELECT set_config('suite.space_id',$1,true)", [spaceId]);
          const before = await read(tx, spaceId, true);
          const after = runDueAutomations(
            before,
            spaceId,
            new Date().toISOString(),
            'tick-' + randomUUID(),
          );
          if (after === before) await schedule(tx, before, spaceId);
          else await save(tx, before, after, AUTOMATION_ACTOR);
        });
      } catch (error) {
        // Back off so one broken workspace cannot block the others; the error stays visible.
        app.log.error({ err: error, spaceId }, 'Automation schedule failed');
        await db.query(
          "UPDATE suite_automation_schedule SET next_check_at=now()+interval '15 minutes' WHERE space_id=$1",
          [spaceId],
        );
      }
  }
  let scheduling = false;
  const timer = setInterval(() => {
    if (scheduling) return;
    scheduling = true;
    void runAutomationSchedule()
      .catch((error) => app.log.error({ err: error }, 'Automation scheduler failed'))
      .finally(() => {
        scheduling = false;
      });
  }, SCHEDULER_INTERVAL_MS);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
  app.get('/v2/workspaces', async (request) => {
    const user = await authenticate(request);
    const memberships = await db.transaction(async (tx) => {
      await tx.query("SELECT set_config('suite.user_id',$1,true)", [user.id]);
      return (
        await tx.query<{ space_id: string; role: string }>(
          'SELECT space_id,role FROM suite_space_members WHERE user_id=$1 AND active ORDER BY space_id',
          [user.id],
        )
      ).rows;
    });
    const workspaces: {
      workspace: Workspace;
      role: string;
      grants: Access[];
    }[] = [];
    for (const m of memberships)
      await context(user, m.space_id, async (tx, member, grants) => {
        const row = (
          await tx.query<{ config: Workspace }>('SELECT config FROM suite_spaces WHERE id=$1', [
            m.space_id,
          ])
        ).rows[0];
        if (row) workspaces.push({ workspace: row.config, role: member.role, grants });
      });
    return { user, workspaces };
  });
  app.post('/v2/workspaces', async (request) => {
    const user = await authenticate(request);
    const p = request.body as Record<string, unknown>;
    if (!p || typeof p.id !== 'string')
      throw new DomainError(400, 'INVALID_INPUT', 'A stable workspace ID is required.');
    const spaceId = uuid(p.id, 'Workspace');
    return db.transaction(async (tx) => {
      await tx.query(
        "SELECT set_config('suite.space_id',$1,true),set_config('suite.user_id',$2,true)",
        [spaceId, user.id],
      );
      const existing = (
        await tx.query<{ config: Workspace; owner_id: string }>(
          'SELECT config,owner_id FROM suite_spaces WHERE id=$1',
          [spaceId],
        )
      ).rows[0];
      if (existing) {
        if (existing.owner_id !== user.id)
          throw new DomainError(409, 'CONFLICT', 'Workspace ID already exists.');
        return { workspace: existing.config };
      }
      const command: Command = {
        id: spaceId,
        workspaceId: spaceId,
        type: 'workspace.create',
        payload: p,
      };
      const data = executeCommand(emptyData(), command);
      const workspace = data.workspaces[0]!;
      await tx.query(
        'INSERT INTO suite_spaces(id,owner_id,config,revision) VALUES($1,$2,$3::jsonb,$4)',
        [spaceId, user.id, JSON.stringify(workspace), data.revision],
      );
      await tx.query(
        "INSERT INTO suite_space_members(space_id,user_id,email,name,role) VALUES($1,$2,$3,$4,'owner')",
        [spaceId, user.id, user.email, user.name],
      );
      await tx.query(
        'INSERT INTO suite_space_audit(space_id,id,actor_id,payload) VALUES($1,$2,$3,$4::jsonb)',
        [spaceId, spaceId, user.id, JSON.stringify(data.audit[0])],
      );
      return { workspace };
    });
  });
  app.get<{ Params: { id: string } }>('/v2/workspaces/:id', async (request) => {
    const user = await authenticate(request);
    return context(user, request.params.id, async (tx, member, grants) => ({
      data: project(await read(tx, request.params.id), grants, member),
      role: member.role,
      grants,
    }));
  });
  app.post<{ Params: { id: string } }>(
    '/v2/workspaces/:id/commands',
    { bodyLimit: 5 * 1024 * 1024 },
    async (request) => {
      const user = await authenticate(request);
      const command = request.body as Command;
      if (
        !command ||
        command.workspaceId !== request.params.id ||
        typeof command.type !== 'string' ||
        command.type === 'workspace.create' ||
        !command.payload
      )
        throw new DomainError(400, 'INVALID_INPUT', 'Invalid workspace command.');
      return context(user, request.params.id, async (tx, member, grants) => {
        if (command.type === 'workspace.settings' && member.role !== 'owner') {
          const old = (await read(tx, request.params.id)).workspaces[0]!;
          if (command.payload.plan !== old.plan)
            throw new DomainError(
              403,
              'PLAN_OWNER_ONLY',
              'Only the workspace owner can configure plan entitlements.',
            );
        }
        const before = await read(tx, request.params.id, true);
        const fingerprint = createHash('sha256')
          .update(JSON.stringify({ type: command.type, payload: command.payload }))
          .digest('hex');
        const existing = (
          await tx.query<{ fingerprint: string; actor_id: string }>(
            'SELECT fingerprint,actor_id FROM suite_space_commands WHERE space_id=$1 AND id=$2',
            [request.params.id, command.id],
          )
        ).rows[0];
        if (existing) {
          if (existing.actor_id !== user.id || existing.fingerprint !== fingerprint)
            throw new DomainError(
              409,
              'IDEMPOTENCY_CONFLICT',
              'This command key has already been used.',
            );
          return { data: project(before, grants, member), grants, role: member.role };
        }
        if (command.type === 'expense.review' && command.payload.status === 'approved') {
          const submission = (
            await tx.query<{ actor_id: string }>(
              "SELECT actor_id FROM suite_space_audit WHERE space_id=$1 AND payload->>'action'='expense.add' AND payload->>'recordId'=$2",
              [request.params.id, command.payload.id],
            )
          ).rows[0];
          if (submission?.actor_id === user.id)
            throw new DomainError(
              403,
              'SELF_APPROVAL_DENIED',
              'Another authorized reviewer must approve your business expense. Invite a manager or finance member.',
            );
        }
        authorizeCommand(before, command, { grants, email: member.email });
        const after = executeCommand(before, command);
        await save(tx, before, after, user.id, { command, fingerprint });
        return { data: project(after, grants, member), grants, role: member.role };
      });
    },
  );
  app.get<{ Params: { id: string } }>('/v2/workspaces/:id/members', async (request) => {
    const user = await authenticate(request);
    return context(user, request.params.id, async (tx, _member, grants) => {
      permitted(grants, 'members.manage');
      return {
        members: (
          await tx.query(
            'SELECT user_id AS id,email,name,role,active FROM suite_space_members WHERE space_id=$1 ORDER BY name',
            [request.params.id],
          )
        ).rows,
      };
    });
  });
  app.post<{ Params: { id: string } }>('/v2/workspaces/:id/members', async (request) => {
    const user = await authenticate(request);
    return context(user, request.params.id, async (tx, _member, grants) => {
      permitted(grants, 'members.manage');
      const p = request.body as { id: string; role: string; active: boolean };
      if (!p || !ROLE_GRANTS[p.role] || p.role === 'owner' || typeof p.active !== 'boolean')
        throw new DomainError(400, 'INVALID_INPUT', 'Choose a valid role and access state.');
      const changed = await tx.query(
        "UPDATE suite_space_members SET role=$3,active=$4 WHERE space_id=$1 AND user_id=$2 AND role<>'owner' RETURNING user_id",
        [request.params.id, uuid(p.id, 'Member'), p.role, p.active],
      );
      if (!changed.rows.length)
        throw new DomainError(
          400,
          'OWNER_PROTECTED',
          'The owner cannot be removed or changed here.',
        );
      const entry = {
        id: randomUUID(),
        workspaceId: request.params.id,
        at: new Date().toISOString(),
        action: 'member.update',
        recordId: p.id,
        summary: `${p.active ? 'Updated' : 'Revoked'} ${p.role} access`,
      };
      await tx.query(
        'INSERT INTO suite_space_audit(space_id,id,actor_id,payload) VALUES($1,$2,$3,$4::jsonb)',
        [request.params.id, entry.id, user.id, JSON.stringify(entry)],
      );
      return { updated: true };
    });
  });
  app.post<{ Params: { id: string } }>('/v2/workspaces/:id/invitations', async (request) => {
    const user = await authenticate(request);
    return context(user, request.params.id, async (tx, _member, grants) => {
      permitted(grants, 'members.manage');
      const p = request.body as { email: string; role: string };
      if (
        !p ||
        typeof p.email !== 'string' ||
        p.email.length > 254 ||
        !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(p.email) ||
        !ROLE_GRANTS[p.role] ||
        p.role === 'owner'
      )
        throw new DomainError(400, 'INVALID_INPUT', 'Choose an email and a non-owner role.');
      const token = randomBytes(32).toString('base64url');
      await tx.query(
        'INSERT INTO suite_invitations(id,token_hash,space_id,email,role,created_by,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)',
        [
          randomUUID(),
          hash(token),
          request.params.id,
          p.email.toLowerCase(),
          p.role,
          user.id,
          new Date(Date.now() + 7 * 86400000).toISOString(),
        ],
      );
      return {
        token,
        activationUrl: process.env.SUITE_APP_URL
          ? process.env.SUITE_APP_URL + '#activate=' + token
          : undefined,
        email: p.email,
        expiresInDays: 7,
        sent: false,
      };
    });
  });
  app.get<{ Params: { id: string } }>('/v2/workspaces/:id/backup', async (request) => {
    const user = await authenticate(request);
    return context(user, request.params.id, async (tx, _member, grants) => {
      permitted(grants, 'backup.export');
      permitted(grants, 'money.read');
      permitted(grants, 'prices.read');
      return {
        format: 'business-suite-backup',
        version: 1,
        exportedAt: new Date().toISOString(),
        data: await read(tx, request.params.id),
      };
    });
  });
  // Restores create an independent workspace: never replace live shared data or audit.
  app.post('/v2/workspaces/restore', { bodyLimit: 30 * 1024 * 1024 }, async (request) => {
    const user = await authenticate(request);
    const p = request.body as { data: unknown; id: string };
    const restored = validateData(p?.data);
    if (restored.workspaces.length !== 1)
      throw new DomainError(400, 'INVALID_BACKUP', 'Restore one workspace at a time.');
    const spaceId = uuid(p.id, 'New workspace');
    const oldId = restored.workspaces[0]!.id;
    restored.workspaces[0] = {
      ...restored.workspaces[0]!,
      id: spaceId,
      name: restored.workspaces[0]!.name + ' (restored)',
      sample: false,
    };
    for (const key of [...Object.keys(TABLES), 'audit'] as (keyof typeof TABLES | 'audit')[])
      for (const row of restored[key]) row.workspaceId = spaceId;
    restored.commands = [];
    restored.audit = [];
    // A restored copy must not act on its own: rules start off and pending waits are dropped.
    for (const rule of restored.automations) rule.enabled = false;
    for (const run of restored.automationRuns)
      if (run.status === 'waiting') {
        run.status = 'cancelled';
        run.outcome = 'Cancelled when the backup was restored.';
      }
    restored.revision = 1;
    return db.transaction(async (tx) => {
      await tx.query(
        "SELECT set_config('suite.space_id',$1,true),set_config('suite.user_id',$2,true)",
        [spaceId, user.id],
      );
      await tx.query(
        'INSERT INTO suite_spaces(id,owner_id,config,revision) VALUES($1,$2,$3::jsonb,1)',
        [spaceId, user.id, JSON.stringify(restored.workspaces[0])],
      );
      await tx.query(
        "INSERT INTO suite_space_members(space_id,user_id,email,name,role) VALUES($1,$2,$3,$4,'owner')",
        [spaceId, user.id, user.email, user.name],
      );
      for (const [key, table] of Object.entries(TABLES) as [keyof typeof TABLES, string][])
        for (const row of restored[key] as Row[])
          await tx.query(
            `INSERT INTO ${table}(space_id,id,version,payload) VALUES($1,$2,$3,$4::jsonb)`,
            [spaceId, row.id, row.version, JSON.stringify(row)],
          );
      const entry = {
        id: randomUUID(),
        workspaceId: spaceId,
        at: new Date().toISOString(),
        action: 'workspace.restore',
        recordId: spaceId,
        summary: `Imported backup from ${oldId}; original workspace unchanged`,
      };
      await tx.query(
        'INSERT INTO suite_space_audit(space_id,id,actor_id,payload) VALUES($1,$2,$3,$4::jsonb)',
        [spaceId, entry.id, user.id, JSON.stringify(entry)],
      );
      return { workspace: restored.workspaces[0] };
    });
  });
}
