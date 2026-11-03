import {
  MODULES,
  PLANS,
  PRESETS,
  type SuiteData,
  type Command,
  type Workspace,
  type Module,
  type Preset,
  type Plan,
  type Contact,
  type Company,
  type Row,
  type Expense,
  type Payment,
  type Task,
  type TaskEvent,
  type Team,
  type Attachment,
  type Job,
  PRODUCTION_STAGES,
} from './types.js';
import { orderJobs, isReleased } from './production.js';
import {
  normalizeLead,
  leadError,
  findCompany,
  findPerson,
  IMPORT_BATCH,
  type NormalizedLead,
} from './intake.js';
import {
  parseAutomation,
  runAutomations,
  tickAutomations,
  cancelWaiting,
  pipelineStages,
  withAutomationCollections,
  MAX_AUTOMATION_DEPTH,
} from './automations.js';
import {
  DEFAULT_HOURS,
  DEFAULT_TEAMS,
  MAX_QUEUE_ALERTS,
  TASK_HISTORY_LIMIT,
  activeTeams,
  hoursOf,
  isTimeZone,
  localTime,
  nextQueueAlert,
  teamOf,
} from './teams.js';
import {
  OperationError,
  ensure,
  sum,
  allocate,
  expenseRemaining,
  projectMoney,
  householdBalances,
  poolBalance,
} from './calculations.js';

const text = (value: unknown, label: string, max = 200, required = false): string => {
  ensure(typeof value === 'string', `${label} must be text.`);
  const result = value.trim();
  ensure(
    result.length <= max && (!required || result.length > 0),
    `${label} ${required ? 'is required and ' : ''}must be at most ${max} characters.`,
  );
  ensure(
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result),
    `${label} contains unsupported characters.`,
  );
  return result;
};
const string = (p: Record<string, unknown>, key: string, max = 200, required = false) =>
  text(p[key] ?? '', key, max, required);
const choice = <T extends string>(value: unknown, values: readonly T[], label: string): T => {
  ensure(typeof value === 'string' && values.includes(value as T), `Choose a valid ${label}.`);
  return value as T;
};
const amount = (value: unknown, allowZero = false): number => {
  ensure(
    typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= (allowZero ? 0 : 1) &&
      value <= 999999999999,
    'Amount must be a valid positive amount in minor units.',
  );
  return value;
};
const date = (value: unknown, required = false): string => {
  if (!value && !required) return '';
  const s = text(value, 'Date', 10, true);
  ensure(
    /^\d{4}-\d\d-\d\d$/.test(s) &&
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    'Enter a valid calendar date.',
  );
  return s;
};
const email = (value: unknown): string => {
  const s = text(value ?? '', 'Email', 254);
  ensure(!s || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s), 'Enter a valid email address.');
  return s;
};
const url = (value: unknown): string => {
  const s = text(value ?? '', 'Link', 2000);
  if (s) {
    let parsed: URL;
    try {
      parsed = new URL(s);
    } catch {
      throw new Error('Enter a complete https:// link.');
    }
    ensure(
      ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password,
      'Links must use http or https without embedded credentials.',
    );
  }
  return s;
};
const list = (value: unknown, label: string, max = 30): string[] => {
  ensure(
    Array.isArray(value) && value.length > 0 && value.length <= max,
    `${label} needs between 1 and ${max} entries.`,
  );
  const values = value.map((v) => text(v, label, 80, true));
  ensure(new Set(values).size === values.length, `${label} contains duplicate entries.`);
  return values;
};
const id = (value: unknown): string => {
  const s = text(value, 'ID', 120, true);
  ensure(/^[a-zA-Z0-9_-]+$/.test(s), 'Invalid record identifier.');
  return s;
};
function own<T extends Row>(
  rows: T[],
  rowId: unknown,
  workspaceId: string,
  allowArchived = false,
): T {
  const row = rows.find((r) => r.id === rowId && r.workspaceId === workspaceId);
  ensure(
    row && (allowArchived || !row.archived),
    'The selected record is unavailable in this workspace.',
    'NOT_FOUND',
  );
  return row;
}
const member = (data: SuiteData, value: unknown, workspaceId: string, optional = false): string => {
  if ((!value && optional) || value === 'pool') return value === 'pool' ? 'pool' : '';
  const c = own(data.contacts, value, workspaceId);
  ensure(c.kind === 'member', 'Choose a workspace member.');
  return c.id;
};
const contact = (data: SuiteData, value: unknown, workspaceId: string) =>
  value ? own(data.contacts, value, workspaceId).id : '';
const project = (data: SuiteData, value: unknown, workspaceId: string) =>
  value ? own(data.projects, value, workspaceId).id : '';
function receipt(value: unknown): Attachment | undefined {
  if (value === undefined || value === null) return undefined;
  ensure(typeof value === 'object' && !Array.isArray(value), 'Invalid receipt.');
  const r = value as Record<string, unknown>;
  const mime = choice(
    r.mime,
    ['image/png', 'image/jpeg', 'application/pdf'] as const,
    'receipt type',
  );
  const name = text(r.name, 'Receipt name', 200, true);
  const base64 = text(r.base64, 'Receipt', 4200000, true);
  ensure(
    /^[A-Za-z0-9+/]+={0,2}$/.test(base64) && base64.length % 4 === 0,
    'Receipt is not a valid file.',
  );
  const size = (base64.length * 3) / 4 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
  ensure(size > 0 && size <= 3 * 1024 * 1024 && r.size === size, 'Receipts must be at most 3 MB.');
  const signatures = {
    'image/png': 'iVBORw0KGgo',
    'image/jpeg': '/9j/',
    'application/pdf': 'JVBERi0',
  };
  ensure(base64.startsWith(signatures[mime]), 'Receipt content does not match its file type.');
  return { name, mime, base64, size };
}
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
};
export function createWorkspace(
  workspaceId: string,
  name: string,
  preset: Preset,
  now: string,
  sample = false,
): Workspace {
  const config = PRESETS[preset];
  return {
    id: workspaceId,
    name,
    preset,
    plan: config.plan,
    modules: [...config.modules],
    currency: 'MXN',
    sample,
    archived: false,
    monthlyBudgetMinor: 0,
    createdAt: now,
    ...(preset === 'signage'
      ? {
          teams: DEFAULT_TEAMS.map((t) => ({
            ...t,
            alert: { ...t.alert },
            memberIds: [],
            leadIds: [],
            archived: false,
          })),
        }
      : {}),
    stages:
      preset === 'signage'
        ? [
            { id: 'new', name: 'New', outcome: 'open' },
            { id: 'contacted', name: 'Contacted', outcome: 'open' },
            { id: 'interested', name: 'Interested', outcome: 'open' },
            { id: 'visit', name: 'Site visit', outcome: 'open' },
            { id: 'quoted', name: 'Quote sent', outcome: 'open' },
            { id: 'negotiation', name: 'Negotiation', outcome: 'open' },
            { id: 'won', name: 'Won', outcome: 'won' },
            { id: 'lost', name: 'Lost', outcome: 'lost' },
          ]
        : [
            { id: 'new', name: 'New inquiry', outcome: 'open' },
            { id: 'qualified', name: 'Qualified', outcome: 'open' },
            { id: 'quoted', name: 'Quotation sent', outcome: 'open' },
            { id: 'won', name: 'Won', outcome: 'won' },
            { id: 'lost', name: 'Lost', outcome: 'lost' },
          ],
    referralStages: [
      'Researching',
      'Contacted',
      'Referred',
      'Interviewing',
      'Offer',
      'Hired',
      'Not selected',
    ],
    categories:
      preset === 'household'
        ? ['Groceries', 'Rent', 'Utilities', 'Transport', 'Maintenance', 'Other']
        : ['Materials', 'Supplies', 'Travel', 'Services', 'Equipment', 'Other'],
  };
}

/** All state transitions pass through this boundary, also reusable by a future server adapter. */
export function executeCommand(
  original: SuiteData,
  command: Command,
  now = new Date().toISOString(),
): SuiteData {
  return apply(original, command, now, 0);
}
/**
 * Waits that are due, time-based triggers and unclaimed-work alerts; the same object back
 * when nothing ran. `managerIds` are the member contacts of owners and managers, who receive
 * alerts for teams without a lead.
 */
export function runDueAutomations(
  data: SuiteData,
  workspaceId: string,
  now: string,
  tickId: string,
  managerIds: string[] = [],
): SuiteData {
  id(tickId);
  let next = tickAutomations(data, workspaceId, now, tickId, apply);
  const ws = next.workspaces.find((w) => w.id === workspaceId && !w.archived);
  const due = next.tasks.filter((t) => {
    if (t.workspaceId !== workspaceId) return false;
    const at = nextQueueAlert(ws, t);
    return Boolean(at) && at <= now;
  });
  due.forEach((task, i) => {
    const team = teamOf(ws, task.teamId)!;
    const leads = team.leadIds.filter((m) => team.memberIds.includes(m));
    const recipientIds = [...new Set(leads.length ? leads : managerIds)].filter((m) =>
      next.contacts.some(
        (c) => c.id === m && c.workspaceId === workspaceId && c.kind === 'member' && !c.archived,
      ),
    );
    next = apply(
      next,
      {
        id: `${tickId}-q${i + 1}`,
        workspaceId,
        type: 'task.alert',
        payload: { id: task.id, recipientIds },
      },
      now,
      1,
    );
  });
  return next;
}
/** `depth` > 0 means an automation issued the command, not a person. */
function apply(original: SuiteData, command: Command, now: string, depth: number): SuiteData {
  ensure(
    original.schemaVersion === 1,
    'This data version needs a newer application.',
    'SCHEMA_VERSION',
  );
  id(command.id);
  id(command.workspaceId);
  const fingerprint = canonical({
    workspaceId: command.workspaceId,
    type: command.type,
    payload: command.payload,
  });
  const previous = original.commands.find((c) => c.id === command.id);
  if (previous) {
    ensure(
      previous.fingerprint === fingerprint,
      'This command key was already used for different data.',
      'IDEMPOTENCY_CONFLICT',
    );
    return original;
  }
  if (command.expectedRevision !== undefined)
    ensure(
      command.expectedRevision === original.revision,
      'This workspace changed in another tab. Your form is preserved; reload the latest data and review it before saving.',
      'CONFLICT',
    );
  const data = withAutomationCollections(structuredClone(original));
  const before = withAutomationCollections({ ...original });
  const p = command.payload;
  const wsId = command.workspaceId;
  ensure(p && typeof p === 'object' && !Array.isArray(p), 'Invalid command.');
  let ws = data.workspaces.find((w) => w.id === wsId && !w.archived);
  if (command.type !== 'workspace.create') ensure(ws, 'Workspace unavailable.');
  const requireModule = (module: Module) =>
    ensure(
      ws?.modules.includes(module) && PLANS[ws.plan].modules.includes(module),
      `Enable ${module} in this workspace's settings to make changes.`,
      'MODULE_DISABLED',
    );
  const base = (recordId: string): Row => ({
    id: recordId,
    workspaceId: wsId,
    version: 1,
    createdAt: now,
    updatedAt: now,
    archived: false,
  });
  const touch = (row: Row) => {
    row.version++;
    row.updatedAt = now;
  };
  const recordId = typeof p.id === 'string' ? id(p.id) : command.id;
  const newRecord = (rows: Row[]) =>
    ensure(
      !rows.some((r) => r.id === recordId),
      'A record with this ID already exists.',
      'CONFLICT',
    );
  const nextOrderNumber = () =>
    Math.max(
      0,
      ...data.projects
        .filter((o) => o.workspaceId === wsId)
        .map((o, index) => o.number ?? index + 1),
    ) + 1;
  const newJob = (
    jobId: string,
    name: string,
    assigneeId: string,
    due: string,
    released: boolean,
    notes = '',
  ): Job => ({
    id: jobId,
    name,
    assigneeId,
    stage: released ? 'Design' : 'Awaiting release',
    due,
    notes,
  });
  /** Keeps notes within their limit; the newest line is shortened, never older notes. */
  const appendNote = (notes: string, line: string) => {
    const room = 10000 - notes.length - (notes ? 1 : 0);
    return room < 20 ? notes : notes + (notes ? '\n' : '') + line.slice(0, room);
  };
  /**
   * Adds the Person and Company of one lead, or finds them by email/phone and company name.
   * `fill` never changes existing records except adding the note; `update` replaces their
   * fields with the non-empty incoming ones; `skip` leaves them untouched.
   */
  const intake = (
    lead: NormalizedLead,
    ids: { person: string; company: string },
    existing: 'fill' | 'update' | 'skip',
    note: string,
  ) => {
    ensure(!leadError(lead), leadError(lead));
    const source = text(lead.source, 'Source', 120);
    let company: Company | undefined;
    let person: Contact | undefined;
    const counts = { people: 0, companies: 0, updated: 0 };
    if (lead.company) {
      const fields = {
        name: text(lead.company.name, 'Company name', 200, true),
        email: email(lead.company.email),
        phone: text(lead.company.phone, 'Company phone', 50),
        url: url(lead.company.url),
        address: text(lead.company.address, 'Address', 500),
      };
      company = findCompany(data, wsId, fields.name);
      if (!company) {
        ensure(
          !data.companies.some((c) => c.id === ids.company),
          'A record with this ID already exists.',
          'CONFLICT',
        );
        company = { ...base(ids.company), ...fields, notes: '', primaryContactId: '', source };
        data.companies.push(company);
        counts.companies++;
      } else if (existing === 'update') {
        for (const [k, v] of Object.entries(fields)) if (v) Object.assign(company, { [k]: v });
        touch(company);
        counts.updated++;
      }
    }
    if (lead.person) {
      const fields = {
        name: text(lead.person.name, 'Name', 150, true),
        email: email(lead.person.email),
        phone: text(lead.person.phone, 'Phone', 50),
        position: text(lead.person.position, 'Position', 120),
        url: url(lead.person.url),
      };
      person = findPerson(data, wsId, fields);
      if (!person) {
        ensure(
          !data.contacts.some((c) => c.id === ids.person),
          'A record with this ID already exists.',
          'CONFLICT',
        );
        person = {
          ...base(ids.person),
          ...fields,
          kind: lead.person.kind,
          company: company?.name ?? '',
          ...(company ? { companyId: company.id } : {}),
          notes: note,
          weight: 1,
          decisionMaker: 'unknown',
          source,
        };
        data.contacts.push(person);
        counts.people++;
      } else if (existing === 'update') {
        for (const [k, v] of Object.entries(fields)) if (v) Object.assign(person, { [k]: v });
        if (company) Object.assign(person, { company: company.name, companyId: company.id });
        if (note) person.notes = appendNote(person.notes, note);
        touch(person);
        counts.updated++;
      } else if (existing === 'fill' && note) {
        person.notes = appendNote(person.notes, note);
        touch(person);
      }
      if (company && !company.primaryContactId && person.companyId === company.id) {
        company.primaryContactId = person.id;
        touch(company);
      }
    } else if (company && note && existing !== 'skip') {
      company.notes = appendNote(company.notes, note);
      touch(company);
    }
    return { person, company, counts };
  };
  /** The acting member as sent by the client and checked by authorizeCommand; empty if none. */
  const by = (): string => {
    if (!p.by) return '';
    const value = member(data, p.by, wsId);
    ensure(value !== 'pool', 'Choose a workspace member.');
    return value;
  };
  const record = (task: Task, action: TaskEvent['action'], memberId: string, actor: string) => {
    task.history = [
      ...(task.history ?? []),
      { at: now, action, memberId, teamId: task.teamId ?? '', by: actor },
    ].slice(-TASK_HISTORY_LIMIT);
  };
  /** Restarts the unclaimed clock when a task enters its team's queue. */
  const queue = (task: Task) => {
    task.queuedAt = now;
    task.alerts = 0;
    delete task.lastAlertAt;
  };
  const memberName = (memberId: string) =>
    data.contacts.find((c) => c.id === memberId)?.name ?? 'Someone';
  let summary = command.type.replaceAll('.', ' ');
  let auditRecordId = recordId;
  const systemOnly = () =>
    ensure(depth > 0, 'This operation is not supported by this application version.');
  switch (command.type) {
    case 'workspace.create': {
      ensure(!data.workspaces.some((w) => w.id === wsId), 'Workspace already exists.');
      const preset = choice(p.preset, Object.keys(PRESETS) as Preset[], 'template');
      ws = createWorkspace(wsId, string(p, 'name', 100, true), preset, now, false);
      ws.currency = choice(p.currency ?? 'MXN', ['MXN', 'USD', 'EUR'] as const, 'currency');
      data.workspaces.push(ws);
      summary = `Created ${ws.name}`;
      break;
    }
    case 'workspace.settings': {
      ws!.name = string(p, 'name', 100, true);
      const plan = choice(p.plan, Object.keys(PLANS) as Plan[], 'plan');
      ensure(Array.isArray(p.modules), 'Choose workspace modules.');
      const modules = p.modules.map((m) => choice(m, MODULES, 'module'));
      ensure(
        new Set(modules).size === modules.length &&
          modules.every((m) => PLANS[plan].modules.includes(m)),
        'This plan does not include every enabled module. Disable those modules first; their records will be retained.',
      );
      ws!.plan = plan;
      ws!.modules = modules;
      ws!.monthlyBudgetMinor = amount(p.monthlyBudgetMinor ?? ws!.monthlyBudgetMinor, true);
      ws!.categories = list(p.categories ?? ws!.categories, 'Categories');
      const stages = p.stages ?? ws!.stages;
      ensure(
        Array.isArray(stages) && stages.length >= 2 && stages.length <= 20,
        'Use between 2 and 20 pipeline stages.',
      );
      const parsed = stages.map((s: Record<string, unknown>) => ({
        id: id(s.id),
        name: text(s.name, 'Stage name', 60, true),
        outcome: choice(s.outcome, ['open', 'won', 'lost'] as const, 'stage outcome'),
      }));
      ensure(new Set(parsed.map((s) => s.id)).size === parsed.length, 'Stage IDs must be unique.');
      ensure(
        parsed.some((s) => s.outcome === 'open') &&
          parsed.some((s) => s.outcome === 'won') &&
          parsed.some((s) => s.outcome === 'lost'),
        'Keep open, won and lost outcomes in the pipeline.',
      );
      ensure(
        data.deals
          .filter((d) => d.workspaceId === wsId)
          .every((d) => parsed.some((s) => s.id === d.stageId)),
        'Move existing opportunities before removing their stage.',
      );
      ensure(
        data.automations
          .filter((a) => a.workspaceId === wsId && !a.archived)
          .flatMap(pipelineStages)
          .every((stageId) => parsed.some((s) => s.id === stageId)),
        'An automation uses this stage. Change or archive the automation first.',
      );
      ws!.stages = parsed;
      const referralStages = list(p.referralStages ?? ws!.referralStages, 'Referral stages');
      ensure(
        data.referrals
          .filter((r) => r.workspaceId === wsId)
          .every((r) => referralStages.includes(r.stage)),
        'Move existing referrals before removing their stage.',
      );
      ws!.referralStages = referralStages;
      summary = `Updated settings for ${ws!.name}`;
      break;
    }
    case 'contact.save': {
      const existing = p.id ? own(data.contacts, p.id, wsId) : undefined;
      const kind = choice(
        p.kind,
        ['lead', 'customer', 'supplier', 'member', 'candidate', 'employer'] as const,
        'contact type',
      );
      if (
        existing &&
        existing.kind !== kind &&
        !(existing.kind === 'lead' && kind === 'customer')
      ) {
        const used = [...data.expenses, ...data.payments, ...data.tasks, ...data.referrals].some(
          (r) => r.workspaceId === wsId && JSON.stringify(r).includes(existing.id),
        );
        ensure(!used, 'This contact is linked to records; preserve its contact type.');
      }
      const weight = Number(p.weight ?? 1);
      ensure(
        Number.isInteger(weight) && weight > 0 && weight <= 100000,
        'Contribution weight must be a whole number from 1 to 100000.',
      );
      const linked = p.companyId ? own(data.companies, p.companyId, wsId) : undefined;
      const fields = {
        name: string(p, 'name', 150, true),
        kind,
        company: linked ? linked.name : string(p, 'company'),
        companyId: linked?.id ?? '',
        email: email(p.email),
        phone: string(p, 'phone', 50),
        url: url(p.url),
        notes: string(p, 'notes', 10000),
        weight,
        position: string(p, 'position', 120),
        decisionMaker: choice(
          p.decisionMaker ?? 'unknown',
          ['yes', 'no', 'unknown'] as const,
          'decision maker answer',
        ),
      };
      if (existing) {
        Object.assign(existing, fields);
        touch(existing);
      } else {
        newRecord(data.contacts);
        data.contacts.push({ ...base(recordId), ...fields });
      }
      summary = `Saved contact ${fields.name}`;
      break;
    }
    case 'contact.convert': {
      // A lead becomes a customer only by this explicit action; its links and history stay.
      const lead = own(data.contacts, p.id, wsId);
      ensure(lead.kind === 'lead', 'Only a lead can be converted to a customer.');
      lead.kind = 'customer';
      touch(lead);
      auditRecordId = lead.id;
      summary = `Converted lead ${lead.name} to customer`;
      break;
    }
    case 'company.save': {
      const existing = p.id ? own(data.companies, p.id, wsId) : undefined;
      const fields = {
        name: string(p, 'name', 200, true),
        email: email(p.email),
        phone: string(p, 'phone', 50),
        address: string(p, 'address', 500),
        url: url(p.url),
        notes: string(p, 'notes', 10000),
        primaryContactId: contact(data, p.primaryContactId, wsId),
      };
      const duplicate = findCompany(data, wsId, fields.name);
      ensure(
        !duplicate || duplicate.id === existing?.id,
        `A company named ${duplicate?.name} already exists.`,
        'CONFLICT',
      );
      if (existing) {
        Object.assign(existing, fields);
        touch(existing);
        // People show the company name; keep it in step with a rename.
        for (const c of data.contacts)
          if (c.companyId === existing.id && c.company !== existing.name) {
            c.company = existing.name;
            touch(c);
          }
      } else {
        newRecord(data.companies);
        data.companies.push({ ...base(recordId), ...fields, source: string(p, 'source', 120) });
      }
      summary = `Saved company ${fields.name}`;
      break;
    }
    case 'lead.capture': {
      // Public forms and sales channels: never change an existing person or company, never
      // create team members, and add the message as a note.
      ensure(
        p.fields && typeof p.fields === 'object' && !Array.isArray(p.fields),
        'Send the lead fields as an object.',
      );
      const source = string(p, 'source', 120) || 'Lead form';
      const lead = normalizeLead({ ...(p.fields as Record<string, unknown>), source }, 'lead');
      if (lead.person && !['lead', 'customer'].includes(lead.person.kind))
        lead.person.kind = 'lead';
      const note = `[${now.slice(0, 10)} ${source}] ${lead.notes || 'New lead'}`;
      const { person, company, counts } = intake(
        lead,
        { person: `${command.id}-p`, company: `${command.id}-c` },
        'fill',
        note,
      );
      const projectTitle = string(p, 'projectTitle', 200);
      if (projectTitle && ws!.modules.includes('crm')) {
        const stage = ws!.stages.find((s) => s.outcome === 'open')!;
        const dealId = `${command.id}-d`;
        ensure(
          !data.deals.some((d) => d.id === dealId),
          'A record with this ID already exists.',
          'CONFLICT',
        );
        data.deals.push({
          ...base(dealId),
          title: projectTitle,
          contactId: person?.id ?? '',
          amountMinor: amount(p.estimatedValueMinor ?? 0, true),
          stageId: stage.id,
          due: '',
          notes: lead.notes,
          projectId: '',
        });
      }
      auditRecordId = person?.id ?? company!.id;
      summary = `Lead from ${source}: ${person?.name ?? company!.name}${
        counts.people || counts.companies ? '' : ' (already known)'
      }`;
      break;
    }
    case 'contact.import': {
      ensure(
        Array.isArray(p.rows) && p.rows.length > 0 && p.rows.length <= IMPORT_BATCH,
        `Import between 1 and ${IMPORT_BATCH} rows per batch.`,
      );
      const existing = choice(p.existing ?? 'skip', ['skip', 'update'] as const, 'duplicate rule');
      const kind = choice(
        p.kind ?? 'customer',
        ['lead', 'customer', 'supplier', 'member', 'candidate', 'employer'] as const,
        'contact type',
      );
      const source = string(p, 'source', 120) || 'Import';
      const offset = Number(p.offset ?? 0);
      ensure(Number.isSafeInteger(offset) && offset >= 0, 'Invalid row offset.');
      const total = { people: 0, companies: 0, updated: 0 };
      (p.rows as unknown[]).forEach((raw, i) => {
        try {
          ensure(raw && typeof raw === 'object' && !Array.isArray(raw), 'Invalid row.');
          const lead = normalizeLead({ source, ...(raw as Record<string, unknown>) }, kind);
          const { counts } = intake(
            lead,
            { person: `${command.id}-p${i}`, company: `${command.id}-c${i}` },
            existing,
            lead.notes,
          );
          total.people += counts.people;
          total.companies += counts.companies;
          total.updated += counts.updated;
        } catch (error) {
          throw new OperationError(
            error instanceof OperationError && error.code !== 'INVALID_INPUT'
              ? error.code
              : 'INVALID_INPUT',
            // The client sends each row's line number in its file.
            `Row ${typeof (raw as { row?: unknown })?.row === 'number' ? (raw as { row: number }).row : offset + i + 1}: ${(error as Error).message}`,
          );
        }
      });
      summary = `Imported from ${source}: ${total.people} people, ${total.companies} companies added, ${total.updated} updated`;
      break;
    }
    case 'deal.save': {
      requireModule('crm');
      const existing = p.id ? own(data.deals, p.id, wsId) : undefined;
      const stageId = string(p, 'stageId', 120, true);
      ensure(
        ws!.stages.some((s) => s.id === stageId),
        'Choose an existing pipeline stage.',
      );
      if (existing?.projectId)
        ensure(
          ws!.stages.find((s) => s.id === stageId)?.outcome === 'won',
          'A converted opportunity must retain its won outcome.',
        );
      const fields = {
        title: string(p, 'title', 200, true),
        contactId: contact(data, p.contactId, wsId),
        amountMinor: amount(p.amountMinor, true),
        stageId,
        due: date(p.due),
        notes: string(p, 'notes', 10000),
      };
      if (existing) {
        Object.assign(existing, fields);
        touch(existing);
      } else {
        newRecord(data.deals);
        data.deals.push({ ...base(recordId), ...fields, projectId: '' });
      }
      summary = `Saved opportunity ${fields.title}`;
      break;
    }
    case 'deal.convert': {
      // A Project (deal) can lead to several Orders; each is an explicit human action.
      requireModule('crm');
      requireModule('work');
      const deal = own(data.deals, p.id, wsId);
      const won = ws!.stages.find((s) => s.outcome === 'won');
      ensure(won, 'Add a won pipeline stage first.');
      // The payload id names the deal, so the order takes the command id.
      const orderId = id(command.id);
      ensure(
        !data.projects.some((r) => r.id === orderId),
        'A record with this ID already exists.',
        'CONFLICT',
      );
      deal.stageId = won.id;
      if (!deal.projectId) deal.projectId = orderId;
      touch(deal);
      const title = p.title === undefined ? deal.title : string(p, 'title', 200, true);
      data.projects.push({
        ...base(orderId),
        title,
        contactId: deal.contactId,
        amountMinor: p.amountMinor === undefined ? deal.amountMinor : amount(p.amountMinor, true),
        due: deal.due,
        notes: deal.notes,
        status: 'planned',
        dealId: deal.id,
        assigneeId: '',
        number: nextOrderNumber(),
        jobs: [newJob(`${orderId}-job-1`, 'Production', '', deal.due, false)],
      });
      summary = `Created order for ${deal.title}`;
      break;
    }
    case 'order.release': {
      requireModule('work');
      const order = own(data.projects, p.id, wsId);
      ensure(!isReleased(order), 'This order is already in production.');
      const basis = choice(p.basis, ['deposit', 'manager'] as const, 'release basis');
      const reason = string(p, 'reason', 2000, basis === 'manager');
      if (basis === 'deposit')
        ensure(
          projectMoney(data, order.id).received > 0,
          'Record the deposit first, or ask a manager to release without one.',
        );
      order.release = { basis, reason, at: now };
      order.status = 'active';
      order.jobs = orderJobs(order).map((j) =>
        j.stage === 'Awaiting release' ? { ...j, stage: 'Design' } : j,
      );
      touch(order);
      summary =
        basis === 'deposit'
          ? `Released ${order.title} after deposit`
          : `Released ${order.title} without deposit: ${reason}`;
      break;
    }
    case 'job.save': {
      requireModule('work');
      const order = own(data.projects, p.orderId, wsId);
      const jobs = orderJobs(order).map((j) => ({ ...j }));
      const fields = {
        name: string(p, 'name', 120, true),
        assigneeId: member(data, p.assigneeId, wsId, true),
        due: date(p.due),
        notes: string(p, 'notes', 10000),
      };
      ensure(fields.assigneeId !== 'pool', 'Assign a team member.');
      const existing = p.jobId ? jobs.find((j) => j.id === p.jobId) : undefined;
      if (p.jobId) ensure(existing, 'The selected job is unavailable.', 'NOT_FOUND');
      if (existing) Object.assign(existing, fields);
      else {
        ensure(jobs.length < 20, 'An order can have at most 20 jobs.');
        const jobId = `${order.id}-job-${command.id}`;
        jobs.push(
          newJob(
            jobId,
            fields.name,
            fields.assigneeId,
            fields.due,
            isReleased(order),
            fields.notes,
          ),
        );
      }
      order.jobs = jobs;
      touch(order);
      auditRecordId = order.id;
      summary = `Saved job ${fields.name} for ${order.title}`;
      break;
    }
    case 'job.move': {
      requireModule('work');
      const order = own(data.projects, p.orderId, wsId);
      const jobs = orderJobs(order).map((j) => ({ ...j }));
      const job = jobs.find((j) => j.id === p.jobId);
      ensure(job, 'The selected job is unavailable.', 'NOT_FOUND');
      const stage = choice(p.stage, PRODUCTION_STAGES, 'production stage');
      ensure(
        isReleased(order) ? stage !== 'Awaiting release' : stage === 'Awaiting release',
        isReleased(order)
          ? 'A released order cannot return to awaiting release.'
          : 'Release the order into production first: deposit received or manager approval.',
      );
      job.stage = stage;
      order.jobs = jobs;
      auditRecordId = order.id;
      const allClosed = jobs.every((j) => j.stage === 'Closed');
      order.status = allClosed ? 'completed' : 'active';
      touch(order);
      summary = `Moved ${order.title} / ${job.name} to ${stage}`;
      break;
    }
    case 'project.save': {
      requireModule('work');
      const existing = p.id ? own(data.projects, p.id, wsId) : undefined;
      const amountMinor = amount(p.amountMinor, true);
      if (existing)
        ensure(
          amountMinor >= projectMoney(data, existing.id).received,
          'Agreed value cannot be lower than the money already collected.',
        );
      const fields = {
        title: string(p, 'title', 200, true),
        contactId: contact(data, p.contactId, wsId),
        amountMinor,
        due: date(p.due),
        notes: string(p, 'notes', 10000),
        status: choice(p.status, ['planned', 'active', 'completed'] as const, 'work status'),
        assigneeId: member(data, p.assigneeId, wsId, true),
      };
      ensure(
        fields.status === 'planned' || (existing && isReleased(existing)),
        'Release the order into production before starting it.',
      );
      ensure(
        fields.status !== 'planned' || !existing || !existing.release,
        'A released order cannot return to planned.',
      );
      if (existing) {
        Object.assign(existing, fields);
        touch(existing);
      } else {
        newRecord(data.projects);
        data.projects.push({
          ...base(recordId),
          ...fields,
          dealId: '',
          number: nextOrderNumber(),
          jobs: [newJob(`${recordId}-job-1`, 'Production', fields.assigneeId, fields.due, false)],
        });
      }
      summary = `Saved work ${fields.title}`;
      break;
    }
    case 'expense.add': {
      requireModule('money');
      newRecord(data.expenses);
      const amountMinor = amount(p.amountMinor);
      const payerId = member(data, p.payerId ?? 'pool', wsId);
      const attachment = receipt(p.receipt);
      const reason = string(p, 'reason', 2000);
      if (ws!.preset !== 'household')
        ensure(attachment || reason, 'Attach a receipt or explain why it is missing.');
      let shares: Expense['shares'] = [];
      if (ws!.preset === 'household') {
        const members = data.contacts.filter(
          (c) => c.workspaceId === wsId && c.kind === 'member' && !c.archived,
        );
        if (p.split === 'custom') {
          ensure(Array.isArray(p.shares) && p.shares.length > 0, 'Add household shares.');
          shares = p.shares.map((s: Record<string, unknown>) => ({
            contactId: member(data, s.contactId, wsId),
            amountMinor: amount(s.amountMinor, true),
          }));
          ensure(
            shares.every((s) => s.contactId !== 'pool') &&
              new Set(shares.map((s) => s.contactId)).size === shares.length &&
              sum(shares.map((s) => s.amountMinor)) === amountMinor,
            'Shares must belong to different members and add up to the expense.',
          );
        } else shares = allocate(amountMinor, members, p.split !== 'weighted');
      }
      data.expenses.push({
        ...base(recordId),
        description: string(p, 'description', 300, true),
        amountMinor,
        date: date(p.date, true),
        category: string(p, 'category', 80, true),
        payerId,
        projectId: project(data, p.projectId, wsId),
        status: ws!.preset === 'household' ? 'approved' : 'submitted',
        reason,
        shares,
        ...(attachment ? { receipt: attachment } : {}),
        voidReason: '',
      });
      summary = 'Recorded expense';
      break;
    }
    case 'expense.review': {
      requireModule('money');
      const e = own(data.expenses, p.id, wsId);
      ensure(
        !e.voidReason && e.status === 'submitted',
        'Only an active submitted expense can be reviewed.',
      );
      e.status = choice(p.status, ['approved', 'rejected'] as const, 'review decision');
      const reason = string(p, 'reason', 2000, e.status === 'rejected');
      if (reason) e.reason += `\nReview: ${reason}`;
      touch(e);
      summary = `${e.status} expense: ${e.description}`;
      break;
    }
    case 'payment.add': {
      requireModule('money');
      newRecord(data.payments);
      const kind = choice(
        p.kind,
        ['receipt', 'contribution', 'reimbursement', 'settlement'] as const,
        'payment kind',
      );
      const amountMinor = amount(p.amountMinor);
      let fromId = '';
      let toId = '';
      let projectId = '';
      let allocations: Payment['allocations'] = [];
      if (kind === 'receipt') {
        ensure(ws!.preset !== 'household', 'Use a household contribution or settlement.');
        projectId = project(data, p.projectId, wsId);
        fromId = contact(data, p.fromId, wsId);
        toId = 'pool';
        if (projectId)
          ensure(
            amountMinor <= projectMoney(data, projectId).due,
            'This collection exceeds the job’s remaining balance.',
          );
      } else if (kind === 'contribution') {
        ensure(ws!.preset === 'household', 'Contributions belong to household workspaces.');
        fromId = member(data, p.fromId, wsId);
        ensure(fromId !== 'pool', 'Choose the member contributing.');
        toId = 'pool';
      } else if (kind === 'settlement') {
        ensure(ws!.preset === 'household', 'Use reimbursements for business expenses.');
        fromId = member(data, p.fromId, wsId);
        toId = member(data, p.toId, wsId);
        ensure(fromId !== toId, 'Sender and recipient must be different.');
        const balances = householdBalances(data, ws!);
        if (toId !== 'pool')
          ensure(
            (balances.find((b) => b.member.id === toId)?.balance ?? 0) >= amountMinor,
            'Settlement exceeds the recipient’s credit.',
          );
        if (fromId !== 'pool')
          ensure(
            -(balances.find((b) => b.member.id === fromId)?.balance ?? 0) >= amountMinor,
            'Settlement exceeds the sender’s outstanding share.',
          );
        if (fromId === 'pool')
          ensure(
            poolBalance(
              data.expenses.filter((e) => e.workspaceId === wsId),
              data.payments.filter((p) => p.workspaceId === wsId),
            ) >= amountMinor,
            'Shared funds are insufficient for this settlement.',
          );
      } else {
        ensure(ws!.preset !== 'household', 'Use household settlements.');
        fromId = 'pool';
        toId = member(data, p.toId, wsId);
        ensure(toId !== 'pool', 'Choose the member being reimbursed.');
        ensure(
          Array.isArray(p.allocations) && p.allocations.length > 0,
          'Select expenses to reimburse.',
        );
        allocations = p.allocations.map((a: Record<string, unknown>) => {
          const e = own(data.expenses, a.expenseId, wsId);
          const allocated = amount(a.amountMinor);
          ensure(
            e.payerId === toId && expenseRemaining(data, e) >= allocated,
            'Allocation exceeds an approved unpaid expense for this person.',
          );
          return { expenseId: e.id, amountMinor: allocated };
        });
        ensure(
          new Set(allocations.map((a) => a.expenseId)).size === allocations.length &&
            sum(allocations.map((a) => a.amountMinor)) === amountMinor,
          'Reimbursement allocations must be unique and equal the payment.',
        );
      }
      data.payments.push({
        ...base(recordId),
        kind,
        amountMinor,
        date: date(p.date, true),
        fromId,
        toId,
        projectId,
        method: choice(p.method, ['cash', 'transfer', 'card', 'other'] as const, 'payment method'),
        reference: string(p, 'reference', 1000, true),
        allocations,
        voidReason: '',
      });
      summary = `Recorded ${kind}`;
      break;
    }
    case 'money.void': {
      requireModule('money');
      const reason = string(p, 'reason', 2000, true);
      if (p.collection === 'expenses') {
        const e = own(data.expenses, p.id, wsId);
        ensure(!e.voidReason, 'Expense already voided.');
        ensure(
          !data.payments.some(
            (x) => !x.voidReason && x.allocations.some((a) => a.expenseId === e.id),
          ),
          'Void linked reimbursements before voiding this expense.',
        );
        e.voidReason = reason;
        touch(e);
      } else {
        ensure(p.collection === 'payments', 'Choose a financial record.');
        const payment = own(data.payments, p.id, wsId);
        ensure(!payment.voidReason, 'Payment already voided.');
        payment.voidReason = reason;
        touch(payment);
      }
      summary = `Voided financial record: ${reason}`;
      break;
    }
    case 'task.save': {
      requireModule('chores');
      const existing = p.id ? own(data.tasks, p.id, wsId) : undefined;
      const assigneeId = member(data, p.assigneeId, wsId, true);
      ensure(assigneeId !== 'pool', 'Choose a workspace member.');
      const teamId = p.teamId ? text(p.teamId, 'Team', 120, true) : '';
      const team = teamOf(ws, teamId);
      ensure(!teamId || (team && !team.archived), 'Choose an active team.');
      ensure(
        !team || !assigneeId || team.memberIds.includes(assigneeId),
        `${memberName(assigneeId)} is not a member of ${team?.name}. Add them to the team first.`,
      );
      const fields = {
        title: string(p, 'title', 200, true),
        assigneeId,
        projectId: project(data, p.projectId, wsId),
        due: date(p.due),
        notes: string(p, 'notes', 10000),
        recurrence: choice(
          p.recurrence ?? 'none',
          ['none', 'daily', 'weekly', 'monthly'] as const,
          'recurrence',
        ),
      };
      ensure(fields.recurrence === 'none' || fields.due, 'Recurring tasks need a due date.');
      const actor = by();
      let task: Task;
      if (existing) {
        const moved = (existing.teamId ?? '') !== teamId;
        const handed = existing.assigneeId !== assigneeId;
        Object.assign(existing, fields);
        if (teamId) existing.teamId = teamId;
        else delete existing.teamId;
        task = existing;
        if (moved || handed) {
          if (assigneeId) {
            if (handed) task.claimedAt = now;
            record(task, 'assigned', assigneeId, actor);
          } else {
            delete task.claimedAt;
            record(task, teamId ? 'queued' : 'assigned', '', actor);
          }
          if (teamId && !assigneeId && !existing.done) queue(task);
        }
        touch(existing);
      } else {
        newRecord(data.tasks);
        task = {
          ...base(recordId),
          ...fields,
          ...(teamId ? { teamId } : {}),
          ...(assigneeId && teamId ? { claimedAt: now } : {}),
          done: false,
          nextTaskId: '',
        };
        if (teamId && !assigneeId) queue(task);
        if (teamId || assigneeId)
          record(task, assigneeId ? 'assigned' : 'queued', assigneeId, actor);
        data.tasks.push(task);
      }
      summary = `Saved task ${fields.title}${team ? ` for ${team.name}` : ''}`;
      break;
    }
    case 'task.claim': {
      requireModule('chores');
      const task = own(data.tasks, p.id, wsId);
      const memberId = member(data, p.memberId, wsId);
      const team = teamOf(ws, task.teamId);
      ensure(team && !team.archived, 'Only team tasks can be claimed.');
      ensure(!task.done, 'This task is already complete.');
      ensure(
        !task.assigneeId,
        task.assigneeId === memberId
          ? 'You already claimed this task.'
          : `${memberName(task.assigneeId)} claimed this first${
              task.claimedAt ? ` at ${localTime(task.claimedAt, hoursOf(ws))}` : ''
            }. Your other work on this device is kept.`,
        'ALREADY_CLAIMED',
      );
      ensure(
        team.memberIds.includes(memberId),
        `Only members of ${team.name} can claim this task.`,
        'ACTION_DENIED',
      );
      task.assigneeId = memberId;
      task.claimedAt = now;
      record(task, 'claimed', memberId, memberId);
      touch(task);
      summary = `${memberName(memberId)} claimed ${task.title}`;
      break;
    }
    case 'task.unclaim': {
      requireModule('chores');
      const task = own(data.tasks, p.id, wsId);
      const team = teamOf(ws, task.teamId);
      ensure(team && !team.archived, 'Only team tasks can be given back to a team.');
      ensure(!task.done, 'This task is already complete.');
      ensure(task.assigneeId, 'Nobody holds this task.', 'CONFLICT');
      const previous = task.assigneeId;
      task.assigneeId = '';
      delete task.claimedAt;
      queue(task);
      record(task, 'unclaimed', previous, by());
      touch(task);
      summary = `Gave ${task.title} back to ${team.name}`;
      break;
    }
    case 'task.alert': {
      systemOnly();
      const task = own(data.tasks, p.id, wsId);
      const team = teamOf(ws, task.teamId);
      ensure(team && nextQueueAlert(ws, task), 'This task no longer needs an alert.');
      ensure(Array.isArray(p.recipientIds), 'Invalid alert recipients.');
      const recipients = [
        ...new Set((p.recipientIds as unknown[]).map((m) => member(data, m, wsId))),
      ];
      ensure(
        recipients.every((m) => m !== 'pool'),
        'Choose a workspace member.',
      );
      task.alerts = (task.alerts ?? 0) + 1;
      task.lastAlertAt = now;
      touch(task);
      const message =
        task.alerts === 1
          ? `Nobody in ${team.name} has claimed “${task.title}” yet.`
          : `Still unclaimed in ${team.name}: “${task.title}” (reminder ${task.alerts - 1} of ${
              MAX_QUEUE_ALERTS - 1
            }).`;
      recipients.forEach((recipientId, i) =>
        data.notifications.push({
          ...base(`${command.id}-n${i + 1}`),
          recipientId,
          message: message.slice(0, 500),
          subject: { kind: 'task', id: task.id, jobId: '' },
          automationId: '',
          read: false,
        }),
      );
      summary = recipients.length
        ? `Unclaimed-work alert for ${task.title} to ${recipients.map(memberName).join(', ')}`
        : `Unclaimed-work alert for ${task.title}: no lead or manager to notify`;
      break;
    }
    case 'team.defaults': {
      const existing = new Set((ws!.teams ?? []).map((t) => t.name.toLowerCase()));
      const added = DEFAULT_TEAMS.filter((t) => !existing.has(t.name.toLowerCase()));
      ensure(added.length, 'The usual teams already exist.');
      const ids = new Set((ws!.teams ?? []).map((t) => t.id));
      ws!.teams = [
        ...(ws!.teams ?? []),
        ...added.map((t) => ({
          ...t,
          id: ids.has(t.id) ? `${t.id}-${command.id}` : t.id,
          alert: { ...t.alert },
          memberIds: [],
          leadIds: [],
          archived: false,
        })),
      ];
      summary = `Added teams ${added.map((t) => t.name).join(', ')}`;
      break;
    }
    case 'team.save': {
      const teams = ws!.teams ?? [];
      const existing = p.id ? teams.find((t) => t.id === p.id && !t.archived) : undefined;
      ensure(!p.id || existing, 'The selected team is unavailable.', 'NOT_FOUND');
      const name = string(p, 'name', 60, true);
      ensure(
        !teams.some(
          (t) => !t.archived && t !== existing && t.name.toLowerCase() === name.toLowerCase(),
        ),
        'Another team already has this name.',
      );
      const memberList = (value: unknown, label: string) => {
        ensure(Array.isArray(value) && value.length <= 100, `Choose the ${label}.`);
        const ids = (value as unknown[]).map((m) => member(data, m, wsId));
        ensure(
          ids.every((m) => m !== 'pool'),
          'Choose workspace members.',
        );
        return [...new Set(ids)];
      };
      const memberIds = memberList(p.memberIds ?? [], 'team members');
      const leadIds = memberList(p.leadIds ?? [], 'team leads');
      ensure(
        leadIds.every((m) => memberIds.includes(m)),
        'A team lead must also be a member of the team.',
      );
      const a = (p.alert ?? {}) as Record<string, unknown>;
      const unit = choice(a.unit, ['hours', 'days'] as const, 'alert unit');
      ensure(
        typeof a.amount === 'number' &&
          Number.isInteger(a.amount) &&
          a.amount >= 1 &&
          a.amount <= (unit === 'hours' ? 23 : 5),
        'Alert after 1 to 23 business hours, or 1 to 5 business days.',
      );
      const alert = { amount: a.amount, unit };
      if (existing) Object.assign(existing, { name, memberIds, leadIds, alert });
      else {
        ensure(activeTeams(ws).length < 20, 'A workspace can have at most 20 teams.');
        ensure(!teams.some((t) => t.id === recordId), 'A team with this ID already exists.');
        ws!.teams = [
          ...teams,
          { id: recordId, name, memberIds, leadIds, alert, archived: false } satisfies Team,
        ];
      }
      auditRecordId = existing?.id ?? recordId;
      summary = `Saved team ${name}`;
      break;
    }
    case 'team.archive': {
      const team = (ws!.teams ?? []).find((t) => t.id === p.id && !t.archived);
      ensure(team, 'The selected team is unavailable.', 'NOT_FOUND');
      ensure(
        !data.tasks.some(
          (t) => t.workspaceId === wsId && t.teamId === team.id && !t.done && !t.archived,
        ),
        `Move or finish the open tasks of ${team.name} first.`,
      );
      team.archived = true;
      auditRecordId = team.id;
      summary = `Archived team ${team.name} (history retained)`;
      break;
    }
    case 'workspace.hours': {
      const timeZone = string(p, 'timeZone', 64, true);
      ensure(isTimeZone(timeZone), 'Choose a valid time zone, for example America/Mexico_City.');
      ensure(
        Array.isArray(p.days) &&
          p.days.length > 0 &&
          p.days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6),
        'Choose at least one working day.',
      );
      const time = (v: unknown, label: string) => {
        const s = text(v, label, 5, true);
        ensure(/^([01]\d|2[0-3]):[0-5]\d$/.test(s), `${label} must be a time such as 09:00.`);
        return s;
      };
      const start = time(p.start, 'Opening time');
      const end = time(p.end, 'Closing time');
      ensure(start < end, 'Closing time must be after opening time.');
      ws!.businessHours = {
        timeZone,
        days: [...new Set(p.days as number[])].sort(),
        start,
        end,
      };
      summary = `Set business hours ${start}–${end}`;
      break;
    }
    case 'task.complete': {
      requireModule('chores');
      const task = own(data.tasks, p.id, wsId);
      ensure(!task.done, 'This task is already complete.');
      const actor = by();
      task.done = true;
      task.completedAt = now;
      if (actor) task.completedBy = actor;
      record(task, 'completed', actor || task.assigneeId, actor);
      touch(task);
      if (task.recurrence !== 'none' && !task.nextTaskId) {
        const d = new Date(task.due + 'T12:00:00Z');
        if (task.recurrence === 'monthly') {
          const day = d.getUTCDate();
          d.setUTCDate(1);
          d.setUTCMonth(d.getUTCMonth() + 1);
          const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
          d.setUTCDate(Math.min(day, last));
        } else d.setUTCDate(d.getUTCDate() + (task.recurrence === 'weekly' ? 7 : 1));
        task.nextTaskId = command.id + '-next';
        const next: Task = {
          ...task,
          ...base(task.nextTaskId),
          done: false,
          due: d.toISOString().slice(0, 10),
          nextTaskId: '',
          history: [],
        };
        for (const key of ['completedBy', 'completedAt', 'claimedAt', 'lastAlertAt'] as const)
          delete next[key];
        // A team chore goes back to its team's queue; a personal one stays with its person.
        if (activeTeams(ws).some((t) => t.id === task.teamId)) {
          next.assigneeId = '';
          queue(next);
          record(next, 'queued', '', '');
        } else delete next.teamId;
        data.tasks.push(next);
      }
      summary = `Completed ${task.title}`;
      break;
    }
    case 'referral.save': {
      requireModule('referrals');
      const existing = p.id ? own(data.referrals, p.id, wsId) : undefined;
      const candidate = own(data.contacts, p.candidateId, wsId);
      ensure(candidate.kind === 'candidate', 'Choose a candidate contact.');
      const stage = choice(p.stage, ws!.referralStages, 'referral stage');
      const fields = {
        candidateId: candidate.id,
        role: string(p, 'role', 200, true),
        company: string(p, 'company', 200, true),
        url: url(p.url),
        stage,
        recipient: email(p.recipient),
        due: date(p.due),
        notes: string(p, 'notes', 10000),
        rewardMinor: amount(p.rewardMinor ?? 0, true),
      };
      if (existing) {
        Object.assign(existing, fields);
        touch(existing);
      } else {
        newRecord(data.referrals);
        data.referrals.push({ ...base(recordId), ...fields });
      }
      summary = `Saved referral for ${fields.role}`;
      break;
    }
    case 'template.save': {
      requireModule('referrals');
      const existing = p.id ? own(data.templates, p.id, wsId) : undefined;
      const fields = {
        name: string(p, 'name', 120, true),
        subject: string(p, 'subject', 250, true),
        body: string(p, 'body', 20000, true),
      };
      ensure(!/[\r\n]/.test(fields.subject), 'Subject must be one line.');
      if (existing) {
        Object.assign(existing, fields);
        touch(existing);
      } else {
        newRecord(data.templates);
        data.templates.push({ ...base(recordId), ...fields });
      }
      summary = `Saved template ${fields.name}`;
      break;
    }
    case 'draft.save': {
      requireModule('referrals');
      const existing = p.id ? own(data.drafts, p.id, wsId) : undefined;
      const fields = {
        referralId: p.referralId ? own(data.referrals, p.referralId, wsId).id : '',
        to: email(p.to),
        subject: string(p, 'subject', 250, true),
        body: string(p, 'body', 20000, true),
      };
      ensure(!/[\r\n]/.test(fields.subject), 'Subject must be one line.');
      if (existing) {
        Object.assign(existing, fields);
        touch(existing);
      } else {
        newRecord(data.drafts);
        data.drafts.push({ ...base(recordId), ...fields });
      }
      summary = 'Saved email draft (not sent)';
      break;
    }
    case 'automation.save': {
      const existing = p.id ? own(data.automations, p.id, wsId) : undefined;
      const fields = parseAutomation(p, data, ws!, true);
      if (existing) {
        const changed =
          JSON.stringify([existing.trigger, existing.conditions, existing.wait]) !==
          JSON.stringify([fields.trigger, fields.conditions, fields.wait]);
        if (changed || !fields.enabled)
          cancelWaiting(
            data,
            existing.id,
            now,
            fields.enabled ? 'The automation was changed.' : 'The automation was switched off.',
          );
        const activeSince = fields.enabled && !existing.enabled ? now : existing.activeSince;
        Object.assign(existing, fields, { activeSince });
        touch(existing);
      } else {
        newRecord(data.automations);
        data.automations.push({ ...base(recordId), ...fields, activeSince: now });
      }
      summary = `Saved automation ${fields.name}`;
      break;
    }
    case 'automation.enable': {
      const rule = own(data.automations, p.id, wsId);
      ensure(typeof p.enabled === 'boolean', 'Choose whether the automation is on.');
      if (p.enabled) {
        // Re-check against current stages, members and modules before switching on.
        parseAutomation({ ...rule, enabled: true }, data, ws!, true);
        if (!rule.enabled) rule.activeSince = now;
      } else cancelWaiting(data, rule.id, now, 'The automation was switched off.');
      rule.enabled = p.enabled;
      touch(rule);
      summary = `${rule.enabled ? 'Turned on' : 'Turned off'} automation ${rule.name}`;
      break;
    }
    case 'notification.create': {
      systemOnly();
      newRecord(data.notifications);
      const recipientId = member(data, p.recipientId, wsId);
      ensure(recipientId !== 'pool', 'Choose a workspace member.');
      const subject = p.subject as Record<string, unknown>;
      ensure(
        subject && ['deal', 'order', 'task', 'contact'].includes(String(subject.kind)),
        'Invalid notification subject.',
      );
      data.notifications.push({
        ...base(recordId),
        recipientId,
        message: string(p, 'message', 500, true),
        subject: {
          kind: subject.kind as 'deal' | 'order' | 'task' | 'contact',
          id: id(subject.id),
          jobId: subject.jobId ? text(subject.jobId, 'Job', 300) : '',
        },
        automationId: id(p.automationId),
        read: false,
      });
      summary = `Notified ${data.contacts.find((c) => c.id === recipientId)!.name}`;
      break;
    }
    case 'notification.read': {
      const note = own(data.notifications, p.id, wsId);
      if (!note.read) {
        note.read = true;
        touch(note);
      }
      summary = 'Read a notification';
      break;
    }
    case 'automation.note': {
      systemOnly();
      auditRecordId = id(p.recordId);
      summary = `Note: ${string(p, 'text', 500, true)}`;
      break;
    }
    case 'record.archive':
    case 'record.restore': {
      const key = choice(
        p.collection,
        [
          'contacts',
          'companies',
          'deals',
          'projects',
          'tasks',
          'referrals',
          'templates',
          'drafts',
          'automations',
        ] as const,
        'record collection',
      );
      if (key !== 'contacts' && key !== 'companies' && key !== 'automations')
        requireModule(
          (
            {
              deals: 'crm',
              projects: 'work',
              tasks: 'chores',
              referrals: 'referrals',
              templates: 'referrals',
              drafts: 'referrals',
            } as const
          )[key],
        );
      const row = own(data[key] as Row[], p.id, wsId, true);
      const archived = command.type === 'record.archive';
      ensure(
        row.archived !== archived,
        archived ? 'Record already archived.' : 'Record is already active.',
      );
      if (key === 'contacts' && archived && ws!.preset === 'household')
        ensure(
          (householdBalances(data, ws!).find((b) => b.member.id === row.id)?.balance ?? 0) === 0,
          'Settle this member’s balance before archiving them.',
        );
      if (key === 'automations' && archived)
        cancelWaiting(data, row.id, now, 'The automation was archived.');
      row.archived = archived;
      touch(row);
      summary = `${archived ? 'Archived' : 'Restored'} ${key} record (history retained)`;
      break;
    }
    default:
      throw new Error('This operation is not supported by this application version.');
  }
  data.audit.push({
    id: command.id,
    workspaceId: wsId,
    at: now,
    action: command.type,
    recordId: auditRecordId,
    summary,
  });
  // Receipts intentionally persist: pruning them could turn a delayed retry into a duplicate.
  data.commands.push({ id: command.id, fingerprint });
  // Importing old lists must not set off "new lead" rules for every row.
  const result =
    depth < MAX_AUTOMATION_DEPTH && command.type !== 'contact.import'
      ? runAutomations(before, data, wsId, now, command.id, depth, apply)
      : data;
  // One revision per person's command, including whatever its automations changed.
  result.revision = original.revision + 1;
  return result;
}

export { receipt as validateReceipt, date as validateDate };
