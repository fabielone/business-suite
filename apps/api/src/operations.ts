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
  actorMemberIds,
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
  companies: 'suite_companies',
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
          // Teams without a lead send unclaimed-work alerts to owners and managers.
          const managers = (
            await tx.query<{ email: string }>(
              "SELECT email FROM suite_space_members WHERE space_id=$1 AND active AND role IN ('owner','manager')",
              [spaceId],
            )
          ).rows.flatMap((m) => actorMemberIds(before, spaceId, m.email));
          const after = runDueAutomations(
            before,
            spaceId,
            new Date().toISOString(),
            'tick-' + randomUUID(),
            managers,
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
  // Lead intake keys: owners and managers create one per form or sales channel.
  type IntakeKey = { id: string; name: string; source: string; origins: string[] };
  const intakeOrigins = (value: unknown): string[] => {
    const list = value ?? [];
    if (!Array.isArray(list) || list.length > 10)
      throw new DomainError(400, 'INVALID_INPUT', 'List at most 10 website origins.');
    return list.map((o) => {
      let parsed: URL | undefined;
      try {
        parsed = new URL(String(o));
      } catch {
        // Reported below.
      }
      if (!parsed || !['https:', 'http:'].includes(parsed.protocol) || parsed.origin !== o)
        throw new DomainError(
          400,
          'INVALID_INPUT',
          'Each website must be an origin such as https://www.example.com (no path).',
        );
      return parsed.origin;
    });
  };
  const audit = (
    tx: Sql,
    spaceId: string,
    actor: string,
    action: string,
    recordId: string,
    summary: string,
  ) => {
    const entry = {
      id: randomUUID(),
      workspaceId: spaceId,
      at: new Date().toISOString(),
      action,
      recordId,
      summary,
    };
    return tx.query(
      'INSERT INTO suite_space_audit(space_id,id,actor_id,payload) VALUES($1,$2,$3,$4::jsonb)',
      [spaceId, entry.id, actor, JSON.stringify(entry)],
    );
  };
  app.get<{ Params: { id: string } }>('/v2/workspaces/:id/intake-keys', async (request) => {
    const user = await authenticate(request);
    return context(user, request.params.id, async (tx, _member, grants) => {
      permitted(grants, 'workspace.manage');
      return {
        keys: (
          await tx.query(
            'SELECT id,name,prefix,source,origins,created_at AS "createdAt",last_used_at AS "lastUsedAt",revoked_at AS "revokedAt" FROM suite_intake_keys WHERE space_id=$1 ORDER BY created_at',
            [request.params.id],
          )
        ).rows,
      };
    });
  });
  app.post<{ Params: { id: string } }>('/v2/workspaces/:id/intake-keys', async (request) => {
    const user = await authenticate(request);
    return context(user, request.params.id, async (tx, _member, grants) => {
      permitted(grants, 'workspace.manage');
      const p = (request.body ?? {}) as Record<string, unknown>;
      const name = typeof p.name === 'string' ? p.name.trim() : '';
      const source = typeof p.source === 'string' && p.source.trim() ? p.source.trim() : name;
      if (!name || name.length > 80 || source.length > 120)
        throw new DomainError(
          400,
          'INVALID_INPUT',
          'Name the form or channel (up to 80 characters).',
        );
      const origins = intakeOrigins(p.origins);
      const id = randomUUID();
      const key = 'sik_' + randomBytes(24).toString('base64url');
      await tx.query(
        'INSERT INTO suite_intake_keys(space_id,id,name,prefix,key_hash,source,origins,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
        [request.params.id, id, name, key.slice(0, 10), hash(key), source, origins, user.id],
      );
      await audit(
        tx,
        request.params.id,
        user.id,
        'intake.key.create',
        id,
        `Created lead intake key ${name}`,
      );
      // The only time the key is available; it is stored as a hash.
      return { id, name, source, origins, key };
    });
  });
  app.post<{ Params: { id: string; keyId: string } }>(
    '/v2/workspaces/:id/intake-keys/:keyId/revoke',
    async (request) => {
      const user = await authenticate(request);
      return context(user, request.params.id, async (tx, _member, grants) => {
        permitted(grants, 'workspace.manage');
        const keyId = uuid(request.params.keyId, 'Key');
        const revoked = await tx.query<{ name: string }>(
          'UPDATE suite_intake_keys SET revoked_at=now() WHERE space_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING name',
          [request.params.id, keyId],
        );
        if (!revoked.rows[0]) throw new DomainError(404, 'NOT_FOUND', 'Active key not found.');
        await audit(
          tx,
          request.params.id,
          user.id,
          'intake.key.revoke',
          keyId,
          `Revoked lead intake key ${revoked.rows[0].name}`,
        );
        return { revoked: true };
      });
    },
  );
  /**
   * Public lead intake for website forms, landing pages and sales channels (Zapier, Make,
   * ad lead forms, chat tools). Authenticated by an intake key, not a person: it can only
   * add leads, never read data, and never changes people or companies already recorded.
   */
  /** Project fields sit beside `fields` in JSON and among the fields in a form post. */
  const pick = (body: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(body).filter(([k]) => k === 'projectTitle' || k === 'estimatedValueMinor'),
    );
  const intakeAttempts = new Map<string, { count: number; reset: number }>();
  const intakeLimit = (ip: string, spaceId: string) => {
    const k = ip + spaceId;
    const value = intakeAttempts.get(k);
    const current =
      value && value.reset > Date.now() ? value : { count: 0, reset: Date.now() + 60000 };
    current.count++;
    intakeAttempts.set(k, current);
    if (intakeAttempts.size > 10000)
      for (const [key, v] of intakeAttempts) if (v.reset < Date.now()) intakeAttempts.delete(key);
    if (current.count > 30)
      throw new DomainError(
        429,
        'RATE_LIMIT',
        'Too many submissions. Wait a minute and try again.',
      );
  };
  void app.register(async (scope) => {
    // Plain HTML forms post url-encoded bodies; only this route accepts them.
    scope.addContentTypeParser(
      'application/x-www-form-urlencoded',
      { parseAs: 'string' },
      (_request, body, done) => done(null, Object.fromEntries(new URLSearchParams(body as string))),
    );
    scope.post<{ Params: { id: string } }>(
      '/v2/intake/:id/leads',
      { bodyLimit: 32 * 1024 },
      async (request, reply) => {
        const spaceId = uuid(request.params.id, 'Workspace');
        intakeLimit(request.ip, spaceId);
        const body = request.body as Record<string, unknown> | undefined;
        if (!body || typeof body !== 'object' || Array.isArray(body))
          throw new DomainError(400, 'INVALID_INPUT', 'Send the lead as JSON or a form post.');
        const bearer = /^Bearer (.+)$/.exec(request.headers.authorization ?? '')?.[1];
        const key = request.headers['x-intake-key'] ?? bearer ?? body._key;
        if (typeof key !== 'string' || !/^sik_[\w-]{20,64}$/.test(key))
          throw new DomainError(401, 'INTAKE_KEY_REQUIRED', 'A valid intake key is required.');
        // Bots fill hidden fields; answer as if accepted and store nothing.
        if (typeof body._gotcha === 'string' && body._gotcha.trim())
          return reply.code(202).send({ accepted: true });
        const raw =
          body.fields && typeof body.fields === 'object' && !Array.isArray(body.fields)
            ? (body.fields as Record<string, unknown>)
            : Object.fromEntries(Object.entries(body).filter(([k]) => !k.startsWith('_')));
        const { projectTitle, estimatedValueMinor, ...fields } = { ...raw, ...pick(body) };
        const payload: Record<string, unknown> = { fields };
        if (typeof projectTitle === 'string' && projectTitle.trim())
          payload.projectTitle = projectTitle;
        // Form posts send text; the command still rejects anything but whole minor units.
        if (estimatedValueMinor !== undefined && estimatedValueMinor !== '')
          payload.estimatedValueMinor = /^\d{1,12}$/.test(String(estimatedValueMinor))
            ? Number(estimatedValueMinor)
            : estimatedValueMinor;
        const retry = request.headers['idempotency-key'];
        if (retry !== undefined && (typeof retry !== 'string' || !/^[\w-]{8,100}$/.test(retry)))
          throw new DomainError(
            400,
            'INVALID_INPUT',
            'Idempotency-Key must be 8-100 letters, digits, - or _.',
          );
        const result = await db.transaction(async (tx) => {
          await tx.query("SELECT set_config('suite.space_id',$1,true)", [spaceId]);
          const found = (
            await tx.query<IntakeKey>(
              'SELECT id,name,source,origins FROM suite_intake_keys WHERE space_id=$1 AND key_hash=$2 AND revoked_at IS NULL',
              [spaceId, hash(key)],
            )
          ).rows[0];
          if (!found)
            throw new DomainError(
              401,
              'INTAKE_KEY_DENIED',
              'This intake key is not valid for this workspace.',
            );
          const origin = request.headers.origin;
          if (origin && !found.origins.includes(origin))
            throw new DomainError(
              403,
              'ORIGIN_DENIED',
              'This website is not allowed to send leads with this key.',
            );
          payload.source = found.source;
          const command: Command = {
            id:
              'intake-' +
              (retry
                ? createHash('sha256')
                    .update(found.id + retry)
                    .digest('hex')
                    .slice(0, 40)
                : randomUUID()),
            workspaceId: spaceId,
            type: 'lead.capture',
            payload,
          };
          const fingerprint = createHash('sha256')
            .update(JSON.stringify({ type: command.type, payload: command.payload }))
            .digest('hex');
          const previous = (
            await tx.query<{ fingerprint: string }>(
              'SELECT fingerprint FROM suite_space_commands WHERE space_id=$1 AND id=$2',
              [spaceId, command.id],
            )
          ).rows[0];
          if (previous) {
            if (previous.fingerprint !== fingerprint)
              throw new DomainError(
                409,
                'IDEMPOTENCY_CONFLICT',
                'This Idempotency-Key was already used for a different lead.',
              );
            return { found, duplicate: true };
          }
          const before = await read(tx, spaceId, true);
          const after = executeCommand(before, command);
          await save(tx, before, after, found.id, { command, fingerprint });
          await tx.query(
            'UPDATE suite_intake_keys SET last_used_at=now() WHERE space_id=$1 AND id=$2',
            [spaceId, found.id],
          );
          return { found, duplicate: false };
        });
        const next = typeof body._redirect === 'string' ? body._redirect : '';
        let target: URL | undefined;
        try {
          target = next ? new URL(next) : undefined;
        } catch {
          target = undefined;
        }
        // Only back to a website this key allows, so the endpoint is not an open redirect.
        if (target && result.found.origins.includes(target.origin))
          return reply.redirect(target.href, 303);
        return reply.code(result.duplicate ? 200 : 201).send({ accepted: true });
      },
    );
  });
}
