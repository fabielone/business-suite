import {
  PRODUCTION_STAGES,
  type SuiteData,
  type Workspace,
  type Command,
  type Row,
  type Automation,
  type AutomationTrigger,
  type AutomationCondition,
  type AutomationAction,
  type AutomationSubject,
  type AutomationRun,
} from './types.js';
import { orderJobs, orderNumber } from './production.js';
import { ensure } from './calculations.js';

/**
 * When → optional If → optional Wait → Then, from fixed lists (CRM workflow note).
 * Automations never record a payment, approve an expense, change a price, create an
 * Order or release one: they can only issue the commands below, and those commands
 * keep their own validation (a Job cannot leave Awaiting release by being moved).
 */
export const AUTOMATION_COMMANDS = new Set([
  'task.save',
  'task.complete',
  'job.save',
  'job.move',
  'deal.save',
  'notification.create',
  'automation.note',
]);
/** Automations may trigger further automations, up to this many steps. */
export const MAX_AUTOMATION_DEPTH = 3;
export const TRIGGERS = [
  'deal.stage',
  'job.stage',
  'task.completed',
  'order.tasks.done',
  'date.reached',
  'deal.inactive',
  'contact.created',
] as const;
export const CONDITIONS = [
  'no.activity',
  'deal.stage.is',
  'job.stage.is',
  'job.unassigned',
] as const;
export const ACTIONS = [
  'task.create',
  'tasks.create',
  'tasks.update',
  'job.assign',
  'notify',
  'stage.move',
  'note.add',
] as const;
export type SubjectKind = 'deal' | 'job' | 'order' | 'task' | 'contact';
export const CONTACT_KINDS = ['customer', 'supplier', 'member', 'candidate', 'employer'] as const;
/** What each trigger is about decides which conditions and actions make sense. */
export const ALLOWED: Record<
  SubjectKind,
  { conditions: AutomationCondition['type'][]; actions: AutomationAction['type'][] }
> = {
  deal: {
    conditions: ['no.activity', 'deal.stage.is'],
    actions: ['task.create', 'tasks.create', 'tasks.update', 'notify', 'stage.move', 'note.add'],
  },
  job: {
    conditions: ['no.activity', 'job.stage.is', 'job.unassigned'],
    actions: [
      'task.create',
      'tasks.create',
      'tasks.update',
      'job.assign',
      'notify',
      'stage.move',
      'note.add',
    ],
  },
  order: {
    conditions: ['no.activity', 'job.stage.is'],
    actions: ['task.create', 'tasks.create', 'tasks.update', 'notify', 'stage.move', 'note.add'],
  },
  task: {
    conditions: ['no.activity'],
    actions: ['task.create', 'tasks.create', 'tasks.update', 'notify', 'note.add'],
  },
  contact: {
    conditions: ['no.activity'],
    actions: ['task.create', 'tasks.create', 'notify', 'note.add'],
  },
};
export function triggerSubject(trigger: AutomationTrigger): SubjectKind {
  switch (trigger.type) {
    case 'deal.stage':
    case 'deal.inactive':
      return 'deal';
    case 'job.stage':
      return 'job';
    case 'task.completed':
      return 'task';
    case 'order.tasks.done':
      return 'order';
    case 'contact.created':
      return 'contact';
    case 'date.reached':
      return trigger.field === 'deal.due' ? 'deal' : trigger.field === 'job.due' ? 'job' : 'task';
  }
}
/** Pipeline stage IDs a rule depends on, so settings cannot remove them underneath it. */
export function pipelineStages(rule: Automation): string[] {
  const ids: string[] = [];
  if (rule.trigger.type === 'deal.stage') ids.push(rule.trigger.stageId);
  for (const c of rule.conditions) if (c.type === 'deal.stage.is') ids.push(c.stageId);
  if (triggerSubject(rule.trigger) === 'deal')
    for (const a of rule.actions) if (a.type === 'stage.move') ids.push(a.stage);
  return ids;
}
const TIME_TRIGGERS: AutomationTrigger['type'][] = ['date.reached', 'deal.inactive'];
const CLOSED_STAGES = ['Delivered', 'Closed'];

const str = (v: unknown, label: string, max: number, required = false): string => {
  ensure(typeof v === 'string', `${label} must be text.`);
  const s = v.trim();
  ensure(
    s.length <= max && (!required || s.length > 0),
    `${label} ${required ? 'is required and ' : ''}must be at most ${max} characters.`,
  );
  ensure(
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s),
    `${label} contains unsupported characters.`,
  );
  return s;
};
const int = (v: unknown, label: string, min: number, max: number): number => {
  ensure(
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max,
    `${label} must be a whole number from ${min} to ${max}.`,
  );
  return v as number;
};
const obj = (v: unknown, label: string) => {
  ensure(v !== null && typeof v === 'object' && !Array.isArray(v), `Invalid ${label}.`);
  return v as Record<string, unknown>;
};
const oneOf = <T extends string>(v: unknown, values: readonly T[], label: string): T => {
  ensure(typeof v === 'string' && values.includes(v as T), `Choose a valid ${label}.`);
  return v as T;
};

/**
 * Parses a rule from a command or a stored document. `live` adds the checks that only
 * matter when saving (enabled modules, active members); stored rules stay readable.
 */
export function parseAutomation(
  p: Record<string, unknown>,
  data: SuiteData,
  ws: Workspace,
  live: boolean,
): Pick<Automation, 'name' | 'enabled' | 'trigger' | 'conditions' | 'wait' | 'actions'> {
  const name = str(p.name, 'Name', 120, true);
  ensure(typeof p.enabled === 'boolean', 'Choose whether the automation is on.');
  const t = obj(p.trigger, 'trigger');
  const type = oneOf(t.type, TRIGGERS, 'trigger');
  let trigger: AutomationTrigger;
  if (type === 'deal.stage') {
    const stageId = str(t.stageId, 'Stage', 120, true);
    ensure(
      ws.stages.some((s) => s.id === stageId),
      'Choose an existing pipeline stage.',
    );
    trigger = { type, stageId };
  } else if (type === 'job.stage')
    trigger = { type, stage: oneOf(t.stage, PRODUCTION_STAGES, 'production stage') };
  else if (type === 'task.completed' || type === 'order.tasks.done') trigger = { type };
  else if (type === 'date.reached')
    trigger = {
      type,
      field: oneOf(t.field, ['deal.due', 'job.due', 'task.due'] as const, 'date'),
      offsetDays: int(t.offsetDays ?? 0, 'Days before or after the date', -60, 60),
    };
  else if (type === 'contact.created')
    trigger = {
      type,
      kind: t.kind ? oneOf(t.kind, CONTACT_KINDS, 'contact type') : '',
    };
  else trigger = { type, days: int(t.days, 'Days without activity', 1, 365) };
  const kind = triggerSubject(trigger);
  // People and companies belong to every workspace; the other subjects need their module.
  if (live && kind !== 'contact') {
    const module = { deal: 'crm', job: 'work', order: 'work', task: 'chores' } as const;
    ensure(
      ws.modules.includes(module[kind]),
      `Enable ${module[kind]} in this workspace's settings to use this trigger.`,
      'MODULE_DISABLED',
    );
  }
  const member = (v: unknown, label: string, allowAssignee: boolean, required: boolean) => {
    const s = str(v ?? '', label, 120, required);
    if (!s) return s;
    if (s === 'assignee') {
      ensure(allowAssignee, `This trigger has no assignee; choose a team member for ${label}.`);
      return s;
    }
    ensure(
      data.contacts.some(
        (c) =>
          c.id === s && c.workspaceId === ws.id && c.kind === 'member' && (!live || !c.archived),
      ),
      `Choose a workspace member for ${label}.`,
    );
    return s;
  };
  const hasAssignee = kind === 'job' || kind === 'task';
  ensure(Array.isArray(p.conditions) && p.conditions.length <= 5, 'Use at most 5 conditions.');
  const conditions = p.conditions.map((value): AutomationCondition => {
    const c = obj(value, 'condition');
    const ctype = oneOf(c.type, CONDITIONS, 'condition');
    ensure(
      ALLOWED[kind].conditions.includes(ctype),
      'This condition does not apply to the chosen trigger.',
    );
    if (ctype === 'deal.stage.is') {
      const stageId = str(c.stageId, 'Stage', 120, true);
      ensure(
        ws.stages.some((s) => s.id === stageId),
        'Choose an existing pipeline stage.',
      );
      return { type: ctype, stageId };
    }
    if (ctype === 'job.stage.is')
      return { type: ctype, stage: oneOf(c.stage, PRODUCTION_STAGES, 'production stage') };
    return { type: ctype };
  });
  ensure(
    new Set(conditions.map((c) => c.type)).size === conditions.length,
    'Use each condition once.',
  );
  const w = obj(p.wait ?? { amount: 0, unit: 'days' }, 'wait');
  const unit = oneOf(w.unit, ['hours', 'days'] as const, 'wait unit');
  const wait = { amount: int(w.amount, 'Wait', 0, unit === 'days' ? 365 : 720), unit };
  ensure(
    !conditions.some((c) => c.type === 'no.activity') || wait.amount > 0,
    'Add a wait before checking for no activity.',
  );
  ensure(
    Array.isArray(p.actions) && p.actions.length >= 1 && p.actions.length <= 10,
    'Add between 1 and 10 actions.',
  );
  const actions = p.actions.map((value): AutomationAction => {
    const a = obj(value, 'action');
    const atype = oneOf(a.type, ACTIONS, 'action');
    ensure(
      ALLOWED[kind].actions.includes(atype),
      'This action does not apply to the chosen trigger.',
    );
    if (live && atype.startsWith('task'))
      ensure(
        ws.modules.includes('chores'),
        "Enable chores in this workspace's settings to use task actions.",
        'MODULE_DISABLED',
      );
    const link = () => oneOf(a.link ?? 'record', ['record', 'none'] as const, 'task link');
    switch (atype) {
      case 'task.create':
        return {
          type: atype,
          title: str(a.title, 'Task title', 200, true),
          memberId: member(a.memberId, 'the task', hasAssignee, false),
          dueInDays: int(a.dueInDays ?? 0, 'Task due in days', 0, 365),
          notes: str(a.notes ?? '', 'Task notes', 2000),
          recurrence: oneOf(
            a.recurrence ?? 'none',
            ['none', 'daily', 'weekly', 'monthly'] as const,
            'repeat',
          ),
          link: link(),
        };
      case 'tasks.create': {
        ensure(
          Array.isArray(a.items) && a.items.length >= 1 && a.items.length <= 20,
          'Add between 1 and 20 tasks.',
        );
        const items = a.items.map((value) => {
          const item = obj(value, 'task');
          return {
            title: str(item.title, 'Task title', 200, true),
            memberId: member(item.memberId, 'the task', hasAssignee, false),
            dueInDays: int(item.dueInDays ?? 0, 'Task due in days', 0, 365),
          };
        });
        return { type: atype, items, link: link() };
      }
      case 'tasks.update': {
        const change = oneOf(a.change, ['complete', 'reassign'] as const, 'task change');
        return {
          type: atype,
          change,
          memberId: change === 'reassign' ? member(a.memberId, 'the tasks', hasAssignee, true) : '',
          titleContains: str(a.titleContains ?? '', 'Title filter', 120),
        };
      }
      case 'job.assign': {
        const memberId = member(a.memberId, 'the job', false, true);
        return { type: atype, memberId };
      }
      case 'notify':
        return {
          type: atype,
          memberId: member(a.memberId, 'the notification', hasAssignee, true),
          message: str(a.message, 'Message', 500, true),
        };
      case 'stage.move': {
        const stage = str(a.stage, 'Stage', 120, true);
        if (kind === 'deal')
          ensure(
            ws.stages.some((s) => s.id === stage && s.outcome === 'open'),
            'Automations can only move a project to an open stage. Won and lost stay a person’s decision.',
          );
        else
          ensure(
            PRODUCTION_STAGES.includes(stage as never) && stage !== 'Awaiting release',
            'Choose a production stage after release. Automations never release an order.',
          );
        return { type: atype, stage };
      }
      case 'note.add':
        return { type: atype, text: str(a.text, 'Note', 500, true) };
    }
  });
  return { name, enabled: p.enabled, trigger, conditions, wait, actions };
}

const row = (id: string, workspaceId: string, now: string): Row => ({
  id,
  workspaceId,
  version: 1,
  createdAt: now,
  updatedAt: now,
  archived: false,
});
const touch = (r: Row, now: string) => {
  r.version++;
  r.updatedAt = now;
};
const addHours = (iso: string, hours: number) =>
  new Date(Date.parse(iso) + hours * 3600000).toISOString();
const addDays = (day: string, days: number) => {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const subjectKey = (s: AutomationSubject) => (s.jobId ? `${s.id}/${s.jobId}` : s.id);
const same = (a: AutomationSubject, b: AutomationSubject) => subjectKey(a) === subjectKey(b);
/** Older stored documents predate these collections. */
export function withAutomationCollections(data: SuiteData): SuiteData {
  data.companies ??= [];
  data.automations ??= [];
  data.automationRuns ??= [];
  data.notifications ??= [];
  return data;
}
/** Cancels waiting runs, e.g. when a rule is switched off, changed or archived. */
export function cancelWaiting(data: SuiteData, automationId: string, now: string, reason: string) {
  for (const run of data.automationRuns)
    if (run.automationId === automationId && run.status === 'waiting') {
      run.status = 'cancelled';
      run.outcome = reason;
      touch(run, now);
    }
}

function find(data: SuiteData, s: AutomationSubject) {
  const deal = s.kind === 'deal' ? data.deals.find((d) => d.id === s.id) : undefined;
  const order = s.kind === 'order' ? data.projects.find((o) => o.id === s.id) : undefined;
  const job = order && s.jobId ? orderJobs(order).find((j) => j.id === s.jobId) : undefined;
  const task = s.kind === 'task' ? data.tasks.find((t) => t.id === s.id) : undefined;
  const contact = s.kind === 'contact' ? data.contacts.find((c) => c.id === s.id) : undefined;
  const record = deal ?? order ?? task ?? contact;
  const available = Boolean(record && !record.archived && (!s.jobId || job));
  return { deal, order, job, task, contact, available };
}
export function subjectLabel(data: SuiteData, s: AutomationSubject): string {
  const { deal, order, job, task, contact } = find(data, s);
  if (deal) return deal.title;
  if (contact) return contact.company ? `${contact.name} (${contact.company})` : contact.name;
  if (order)
    return `Order ${orderNumber(data, order)} ${order.title}${job ? ' / ' + job.name : ''}`;
  return task?.title ?? 'Removed record';
}
const assigneeOf = (data: SuiteData, s: AutomationSubject) => {
  const { job, task } = find(data, s);
  return job?.assigneeId ?? task?.assigneeId ?? '';
};
/** Activity by a person, not by an automation, on the subject after `since`. */
export function lastActivity(data: SuiteData, workspaceId: string, recordId: string): string {
  return data.audit
    .filter((a) => a.workspaceId === workspaceId && a.recordId === recordId && !a.automationId)
    .reduce((latest, a) => (a.at > latest ? a.at : latest), '');
}

type Event = { type: AutomationTrigger['type']; subject: AutomationSubject; stage: string };
/** Compares the state before and after a change; the same for people and automations. */
export function detectEvents(before: SuiteData, after: SuiteData, workspaceId: string): Event[] {
  const events: Event[] = [];
  const inWs = <T extends Row>(rows: T[]) =>
    rows.filter((r) => r.workspaceId === workspaceId && !r.archived);
  for (const deal of inWs(after.deals)) {
    const old = before.deals.find((d) => d.id === deal.id);
    if (old?.stageId !== deal.stageId)
      events.push({
        type: 'deal.stage',
        subject: { kind: 'deal', id: deal.id, jobId: '' },
        stage: deal.stageId,
      });
  }
  const tasksDone = (data: SuiteData, orderId: string) => {
    const linked = data.tasks.filter(
      (t) => t.workspaceId === workspaceId && t.projectId === orderId && !t.archived,
    );
    return linked.length > 0 && linked.every((t) => t.done);
  };
  for (const order of inWs(after.projects)) {
    const old = before.projects.find((o) => o.id === order.id);
    const oldJobs = old ? orderJobs(old) : [];
    for (const job of orderJobs(order))
      if (oldJobs.find((j) => j.id === job.id)?.stage !== job.stage)
        events.push({
          type: 'job.stage',
          subject: { kind: 'order', id: order.id, jobId: job.id },
          stage: job.stage,
        });
    if (tasksDone(after, order.id) && !tasksDone(before, order.id))
      events.push({
        type: 'order.tasks.done',
        subject: { kind: 'order', id: order.id, jobId: '' },
        stage: '',
      });
  }
  for (const contact of inWs(after.contacts))
    if (!before.contacts.some((c) => c.id === contact.id))
      events.push({
        type: 'contact.created',
        subject: { kind: 'contact', id: contact.id, jobId: '' },
        stage: contact.kind,
      });
  for (const task of inWs(after.tasks))
    if (task.done && before.tasks.find((t) => t.id === task.id)?.done === false)
      events.push({
        type: 'task.completed',
        subject: { kind: 'task', id: task.id, jobId: '' },
        stage: '',
      });
  return events;
}
function matches(rule: Automation, event: Event) {
  const t = rule.trigger;
  if (t.type !== event.type) return false;
  if (t.type === 'deal.stage') return t.stageId === event.stage;
  if (t.type === 'job.stage') return t.stage === event.stage;
  if (t.type === 'contact.created') return !t.kind || t.kind === event.stage;
  return true;
}
const activeRules = (data: SuiteData, workspaceId: string) =>
  data.automations.filter((r) => r.workspaceId === workspaceId && r.enabled && !r.archived);

/** Runs or schedules a matching rule on a change one command made. */
export type Execute = (data: SuiteData, command: Command, now: string, depth: number) => SuiteData;
export function runAutomations(
  before: SuiteData,
  after: SuiteData,
  workspaceId: string,
  now: string,
  idBase: string,
  depth: number,
  execute: Execute,
): SuiteData {
  if (depth >= MAX_AUTOMATION_DEPTH) return after;
  const rules = activeRules(after, workspaceId);
  if (!rules.length) return after;
  let data = after;
  let k = 0;
  for (const event of detectEvents(before, after, workspaceId))
    for (const rule of rules)
      if (matches(rule, event))
        data = fire(
          data,
          rule,
          event.subject,
          `${rule.id}:${subjectKey(event.subject)}:${idBase}`,
          now,
          `${idBase}-r${++k}`,
          depth,
          execute,
        );
  return data;
}
function fire(
  data: SuiteData,
  rule: Automation,
  subject: AutomationSubject,
  key: string,
  now: string,
  runId: string,
  depth: number,
  execute: Execute,
): SuiteData {
  const hours = rule.wait.amount * (rule.wait.unit === 'days' ? 24 : 1);
  const run: AutomationRun = {
    ...row(runId, rule.workspaceId, now),
    automationId: rule.id,
    subject,
    key,
    triggeredAt: now,
    dueAt: hours ? addHours(now, hours) : now,
    status: 'waiting',
    outcome: '',
  };
  if (hours) {
    // A repeated trigger restarts the wait instead of queueing a second reminder.
    for (const old of data.automationRuns)
      if (old.automationId === rule.id && old.status === 'waiting' && same(old.subject, subject)) {
        old.status = 'cancelled';
        old.outcome = 'Replaced by a newer trigger.';
        touch(old, now);
      }
    data.automationRuns.push(run);
    return data;
  }
  data.automationRuns.push(run);
  return complete(data, rule, runId, now, depth, execute);
}
function unmet(data: SuiteData, rule: Automation, run: AutomationRun): string {
  const found = find(data, run.subject);
  if (!found.available) return 'The record is no longer available.';
  for (const c of rule.conditions) {
    if (
      c.type === 'no.activity' &&
      lastActivity(data, rule.workspaceId, run.subject.id) > run.triggeredAt
    )
      return 'Someone worked on the record after the trigger.';
    if (c.type === 'deal.stage.is' && found.deal?.stageId !== c.stageId)
      return 'The project has moved to another stage.';
    if (c.type === 'job.stage.is') {
      const jobs = found.job ? [found.job] : found.order ? orderJobs(found.order) : [];
      if (!jobs.some((j) => j.stage === c.stage)) return `No job is at ${c.stage}.`;
    }
    if (c.type === 'job.unassigned' && found.job?.assigneeId)
      return 'The job already has an assignee.';
  }
  return '';
}
/** Evaluates the If step and applies every action, or none of them. */
function complete(
  data: SuiteData,
  rule: Automation,
  runId: string,
  now: string,
  depth: number,
  execute: Execute,
): SuiteData {
  const run = data.automationRuns.find((r) => r.id === runId)!;
  const finish = (r: AutomationRun, status: AutomationRun['status'], outcome: string) => {
    r.status = status;
    r.outcome = outcome.slice(0, 1000);
    touch(r, now);
  };
  const reason = unmet(data, rule, run);
  if (reason) {
    finish(run, 'skipped', reason);
    return data;
  }
  let working = data;
  const done: string[] = [];
  try {
    rule.actions.forEach((action, i) => {
      const result = perform(
        working,
        rule,
        run.subject,
        action,
        now,
        `${runId}-a${i + 1}`,
        depth,
        execute,
      );
      working = result.data;
      if (result.summary) done.push(result.summary);
    });
  } catch (e) {
    finish(run, 'failed', (e as Error).message);
    return data;
  }
  finish(
    working.automationRuns.find((r) => r.id === runId)!,
    'done',
    done.join(' · ') || 'Nothing needed to change.',
  );
  return working;
}
function perform(
  data: SuiteData,
  rule: Automation,
  subject: AutomationSubject,
  action: AutomationAction,
  now: string,
  commandId: string,
  depth: number,
  execute: Execute,
): { data: SuiteData; summary: string } {
  ensure(!rule.archived && rule.enabled, 'The automation was switched off.');
  const label = subjectLabel(data, subject);
  const render = (s: string) => s.replaceAll('{record}', label);
  const { deal, order, job, task } = find(data, subject);
  const linkedOrder = order?.id ?? task?.projectId ?? deal?.projectId ?? '';
  let next = data;
  const exec = (type: string, payload: Record<string, unknown>, id = commandId) => {
    ensure(AUTOMATION_COMMANDS.has(type), 'Automations cannot perform this operation.');
    next = execute(next, { id, workspaceId: rule.workspaceId, type, payload }, now, depth + 1);
    const entry = next.audit.find((a) => a.id === id);
    if (entry) {
      entry.automationId = rule.id;
      entry.summary = `${rule.name}: ${entry.summary}`.slice(0, 3000);
    }
  };
  const recipient = (memberId: string) =>
    memberId === 'assignee' ? assigneeOf(data, subject) : memberId;
  switch (action.type) {
    case 'task.create': {
      const title = render(action.title).slice(0, 200);
      const notes = action.notes ? render(action.notes) + '\n\n' : '';
      exec('task.save', {
        title,
        assigneeId: recipient(action.memberId),
        projectId: action.link === 'none' ? '' : linkedOrder,
        due: addDays(now.slice(0, 10), action.dueInDays),
        notes: (notes + `Created by the automation “${rule.name}”.`).slice(0, 10000),
        recurrence: action.recurrence ?? 'none',
      });
      return { data: next, summary: `Created task “${title}”` };
    }
    case 'tasks.create': {
      action.items.forEach((item, i) =>
        exec(
          'task.save',
          {
            title: render(item.title).slice(0, 200),
            assigneeId: recipient(item.memberId),
            projectId: action.link === 'none' ? '' : linkedOrder,
            due: addDays(now.slice(0, 10), item.dueInDays),
            notes: `Created by the automation “${rule.name}”.`,
            recurrence: 'none',
          },
          `${commandId}-${i + 1}`,
        ),
      );
      return { data: next, summary: `Created ${action.items.length} task(s)` };
    }
    case 'tasks.update': {
      // The record's orders: its own, a task's order, or every order of a project.
      const orders = new Set(
        deal
          ? data.projects.filter((o) => o.dealId === deal.id).map((o) => o.id)
          : [linkedOrder].filter(Boolean),
      );
      const filter = action.titleContains.toLowerCase();
      const targets = data.tasks.filter(
        (t) =>
          t.workspaceId === rule.workspaceId &&
          !t.archived &&
          !t.done &&
          orders.has(t.projectId) &&
          t.title.toLowerCase().includes(filter),
      );
      const to = action.change === 'reassign' ? recipient(action.memberId) : '';
      targets.forEach((t, i) => {
        const id = targets.length > 1 ? `${commandId}-${i + 1}` : commandId;
        if (action.change === 'complete') exec('task.complete', { id: t.id }, id);
        else if (t.assigneeId !== to)
          exec(
            'task.save',
            {
              id: t.id,
              title: t.title,
              assigneeId: to,
              projectId: t.projectId,
              due: t.due,
              notes: t.notes,
              recurrence: t.recurrence,
            },
            id,
          );
      });
      return {
        data: next,
        summary: targets.length
          ? `${action.change === 'complete' ? 'Completed' : 'Reassigned'} ${targets.length} task(s)`
          : '',
      };
    }
    case 'job.assign': {
      ensure(order && job, 'The job is no longer available.');
      if (job.assigneeId === action.memberId) return { data, summary: '' };
      exec('job.save', {
        orderId: order.id,
        jobId: job.id,
        name: job.name,
        assigneeId: action.memberId,
        due: job.due,
        notes: job.notes,
      });
      return { data: next, summary: `Assigned ${job.name}` };
    }
    case 'notify': {
      const to = recipient(action.memberId);
      if (!to) return { data, summary: 'Nobody to notify: the record has no assignee' };
      exec('notification.create', {
        recipientId: to,
        message: render(action.message).slice(0, 500),
        subject,
        automationId: rule.id,
      });
      return { data: next, summary: 'Sent a notification' };
    }
    case 'stage.move': {
      if (deal) {
        if (deal.stageId === action.stage) return { data, summary: '' };
        exec('deal.save', {
          id: deal.id,
          title: deal.title,
          contactId: deal.contactId,
          amountMinor: deal.amountMinor,
          stageId: action.stage,
          due: deal.due,
          notes: deal.notes,
        });
        return { data: next, summary: 'Moved the project' };
      }
      ensure(order, 'The order is no longer available.');
      // An Order subject moves the jobs at the condition's stage, or every open job.
      const from = rule.conditions.find((c) => c.type === 'job.stage.is')?.stage;
      const targets = (job ? [job] : orderJobs(order)).filter(
        (j) => j.stage !== action.stage && (from ? j.stage === from : j.stage !== 'Closed'),
      );
      targets.forEach((j, i) =>
        exec(
          'job.move',
          { orderId: order.id, jobId: j.id, stage: action.stage },
          targets.length > 1 ? `${commandId}-${i + 1}` : commandId,
        ),
      );
      return {
        data: next,
        summary: targets.length ? `Moved ${targets.length} job(s) to ${action.stage}` : '',
      };
    }
    case 'note.add':
      exec('automation.note', { recordId: subject.id, text: render(action.text) });
      return { data: next, summary: 'Added a note' };
  }
}

/**
 * Runs waits that are due and time-based triggers. Returns the same object when nothing
 * happened, so callers can skip saving. Server-side this runs under the workspace lock;
 * a run leaves `waiting` in the same transaction that applies it, so it runs at most once.
 */
export function tickAutomations(
  original: SuiteData,
  workspaceId: string,
  now: string,
  tickId: string,
  execute: Execute,
): SuiteData {
  let data = withAutomationCollections(structuredClone(original));
  let changed = false;
  let k = 0;
  for (const waiting of data.automationRuns.filter(
    (r) => r.workspaceId === workspaceId && r.status === 'waiting' && r.dueAt <= now,
  )) {
    const rule = data.automations.find((a) => a.id === waiting.automationId);
    changed = true;
    if (!rule || !rule.enabled || rule.archived) {
      cancelWaiting(data, waiting.automationId, now, 'The automation was switched off.');
      continue;
    }
    data = complete(data, rule, waiting.id, now, 0, execute);
  }
  const today = now.slice(0, 10);
  const ws = data.workspaces.find((w) => w.id === workspaceId);
  for (const rule of activeRules(data, workspaceId)) {
    const t = rule.trigger;
    const due: { subject: AutomationSubject; key: string }[] = [];
    if (t.type === 'date.reached') {
      const reached = (date: string) => {
        if (!date) return false;
        const at = addDays(date, t.offsetDays);
        return at <= today && at >= rule.activeSince.slice(0, 10);
      };
      const inWs = <T extends Row>(rows: T[]) =>
        rows.filter((r) => r.workspaceId === workspaceId && !r.archived);
      if (t.field === 'deal.due')
        for (const d of inWs(data.deals))
          if (ws?.stages.find((s) => s.id === d.stageId)?.outcome === 'open' && reached(d.due))
            due.push({ subject: { kind: 'deal', id: d.id, jobId: '' }, key: d.due });
      if (t.field === 'job.due')
        for (const o of inWs(data.projects))
          for (const j of orderJobs(o))
            if (!CLOSED_STAGES.includes(j.stage) && reached(j.due))
              due.push({ subject: { kind: 'order', id: o.id, jobId: j.id }, key: j.due });
      if (t.field === 'task.due')
        for (const task of inWs(data.tasks))
          if (!task.done && reached(task.due))
            due.push({ subject: { kind: 'task', id: task.id, jobId: '' }, key: task.due });
    } else if (t.type === 'deal.inactive')
      for (const d of data.deals.filter((r) => r.workspaceId === workspaceId && !r.archived)) {
        if (ws?.stages.find((s) => s.id === d.stageId)?.outcome !== 'open') continue;
        const last = lastActivity(data, workspaceId, d.id) || d.createdAt;
        const from = last > rule.activeSince ? last : rule.activeSince;
        if (addHours(from, t.days * 24) <= now)
          due.push({ subject: { kind: 'deal', id: d.id, jobId: '' }, key: last });
      }
    for (const item of due) {
      const key = `${rule.id}:${subjectKey(item.subject)}:${item.key}`;
      if (data.automationRuns.some((r) => r.key === key)) continue;
      changed = true;
      data = fire(data, rule, item.subject, key, now, `${tickId}-r${++k}`, 0, execute);
    }
  }
  if (!changed) return original;
  data.revision = original.revision + 1;
  return data;
}
/** When the scheduler should look at this workspace again; empty when never. */
export function nextAutomationCheck(data: SuiteData, workspaceId: string, now: string): string {
  const waits = (data.automationRuns ?? [])
    .filter((r) => r.workspaceId === workspaceId && r.status === 'waiting')
    .map((r) => r.dueAt);
  if (
    (data.automations ?? []).some(
      (r) =>
        r.workspaceId === workspaceId &&
        r.enabled &&
        !r.archived &&
        TIME_TRIGGERS.includes(r.trigger.type),
    )
  )
    waits.push(addHours(now, 0.25));
  return waits.sort()[0] ?? '';
}
