import { type SuiteData, type Project, type Job, type Command, type Row } from './types.js';
import { type Access, commandAccess } from './permissions.js';
import { ensure } from './calculations.js';

/** Who is acting: their grants and the email that links them to a member contact. */
export type Actor = { grants: Access[]; email: string };

/** Orders created before Jobs existed are shown as a single job until first changed. */
export function orderJobs(order: Project): Job[] {
  if (order.jobs) return order.jobs;
  return [
    {
      id: `${order.id}-main`,
      name: 'Production',
      assigneeId: order.assigneeId,
      stage: !isReleased(order)
        ? 'Awaiting release'
        : order.status === 'completed'
          ? 'Closed'
          : 'Design',
      due: order.due,
      notes: '',
    },
  ];
}
/** Older orders already moved past planning count as released. */
export const isReleased = (order: Project) => Boolean(order.release) || order.status !== 'planned';
export function orderNumber(data: SuiteData, order: Project): number {
  if (order.number) return order.number;
  const older = data.projects.filter(
    (p) => p.workspaceId === order.workspaceId && !p.number && p.createdAt <= order.createdAt,
  );
  return older.length;
}
/** Member contacts in the workspace whose email matches the signed-in user. */
export function actorMemberIds(data: SuiteData, workspaceId: string, email: string): string[] {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];
  return data.contacts
    .filter(
      (c) =>
        c.workspaceId === workspaceId &&
        c.kind === 'member' &&
        !c.archived &&
        c.email.toLowerCase() === normalized,
    )
    .map((c) => c.id);
}
const leads = (grants: Access[]) => grants.includes('work.assign') || grants.includes('work.lead');
const deny = (message: string) => ensure(false, message, 'ACTION_DENIED');

/** Server-side and example-mode authorization; record rules need the current data. */
export function authorizeCommand(data: SuiteData, command: Command, actor: Actor) {
  const { grants } = actor;
  const p = command.payload ?? {};
  const mine = actorMemberIds(data, command.workspaceId, actor.email);
  const has = (access: Access) =>
    grants.includes(access) ||
    deny('Your role does not allow this action. Ask the workspace owner.');
  if (command.type === 'job.move') {
    if (leads(grants)) return;
    has('work.read.assigned');
    const order = data.projects.find(
      (o) => o.id === p.orderId && o.workspaceId === command.workspaceId,
    );
    const job = order && orderJobs(order).find((j) => j.id === p.jobId);
    if (!job || !mine.includes(job.assigneeId))
      deny('Only the assigned team member, their team lead or a manager can move this job.');
    return;
  }
  if (command.type === 'task.complete') {
    has('chores.write');
    if (leads(grants)) return;
    const task = data.tasks.find((t) => t.id === p.id && t.workspaceId === command.workspaceId);
    if (task?.assigneeId && !mine.includes(task.assigneeId))
      deny('Only the assigned person, their team lead or a manager can complete this task.');
    return;
  }
  if (command.type === 'notification.read') {
    const note = data.notifications?.find(
      (n) => n.id === p.id && n.workspaceId === command.workspaceId,
    );
    if (!note || !mine.includes(note.recipientId))
      deny('This notification is not addressed to you.');
    return;
  }
  has(commandAccess(command.type, p.collection));
  if (command.type === 'deal.convert') has('work.write');
  if (command.type === 'order.release' && p.basis === 'manager') has('work.assign');
}

/** Removes what the actor may not read. Hiding in the UI is never the only control. */
export function projectForActor(data: SuiteData, actor: Actor): SuiteData {
  const { grants } = actor;
  const copy = structuredClone(data);
  const ws = copy.workspaces[0];
  const access = {
    contacts: 'contacts.read',
    deals: 'crm.read',
    projects: 'work.read',
    expenses: 'money.read',
    payments: 'money.read',
    tasks: 'chores.read',
    referrals: 'referrals.read',
    templates: 'referrals.read',
    drafts: 'referrals.read',
  } as const;
  const modules: Partial<Record<keyof typeof access, string>> = {
    deals: 'crm',
    projects: 'work',
    expenses: 'money',
    payments: 'money',
    tasks: 'chores',
    referrals: 'referrals',
    templates: 'referrals',
    drafts: 'referrals',
  };
  const assignedOnly = !grants.includes('work.read') && grants.includes('work.read.assigned');
  for (const key of Object.keys(access) as (keyof typeof access)[]) {
    const readable = grants.includes(access[key]) || (key === 'projects' && assignedOnly);
    if (!readable || (modules[key] && !ws?.modules.includes(modules[key] as never)))
      (copy[key] as Row[]) = [];
  }
  if (assignedOnly && ws) {
    const mine = actorMemberIds(data, ws.id, actor.email);
    copy.projects = copy.projects
      .map((o) => ({ ...o, jobs: orderJobs(o).filter((j) => mine.includes(j.assigneeId)) }))
      .filter((o) => o.jobs.length > 0);
    copy.tasks = copy.tasks.filter((t) => mine.includes(t.assigneeId));
    const visible = new Set([
      ...copy.projects.map((o) => o.contactId),
      ...data.contacts.filter((c) => c.kind === 'member').map((c) => c.id),
    ]);
    copy.contacts = copy.contacts.filter((c) => visible.has(c.id));
  }
  if (!grants.includes('prices.read')) {
    copy.projects.forEach((o) => {
      o.amountMinor = 0;
      if (o.release?.basis === 'deposit') o.release = { ...o.release, reason: '' };
    });
    copy.deals.forEach((d) => {
      d.amountMinor = 0;
    });
    copy.referrals.forEach((r) => {
      r.rewardMinor = 0;
    });
  }
  if (!grants.includes('automations.manage')) {
    copy.automations = [];
    copy.automationRuns = [];
  }
  // Each person reads only the notifications addressed to them.
  const recipients = ws ? actorMemberIds(data, ws.id, actor.email) : [];
  copy.notifications = (copy.notifications ?? []).filter((n) => recipients.includes(n.recipientId));
  if (!grants.includes('workspace.manage')) copy.audit = [];
  copy.commands = [];
  return copy;
}
