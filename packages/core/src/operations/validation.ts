import {
  emptyData,
  PRODUCTION_STAGES,
  PRESETS,
  PLANS,
  MODULES,
  type SuiteData,
  type Row,
  type Workspace,
} from './types.js';
import { ensure, sum } from './calculations.js';
import { validateReceipt, validateDate } from './commands.js';
import { parseAutomation, withAutomationCollections } from './automations.js';

const text = (v: unknown, limit = 20000) =>
  typeof v === 'string' && v.length <= limit && !v.includes('\u0000');
const nonnegative = (v: unknown) =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 999999999999;
const dateTime = (v: unknown) => text(v, 40) && Number.isFinite(Date.parse(v as string));
export function validateData(value: unknown): SuiteData {
  ensure(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Backup is not a valid Suite document.',
  );
  // Documents saved before automations existed lack those collections.
  const d = withAutomationCollections({ ...(value as SuiteData) });
  ensure(
    d.schemaVersion === 1,
    'Unsupported backup version. Keep the original file and use a compatible app.',
    'SCHEMA_VERSION',
  );
  ensure(Number.isSafeInteger(d.revision) && d.revision >= 0, 'Invalid data revision.');
  for (const key of Object.keys(emptyData()).filter(
    (k) => !['revision', 'schemaVersion'].includes(k),
  ))
    ensure(
      Array.isArray(d[key as keyof SuiteData]) &&
        (d[key as keyof SuiteData] as unknown[]).length <= 100000,
      `Invalid ${key} collection.`,
    );
  const wsIds = new Set<string>();
  for (const w of d.workspaces) {
    ensure(
      w && text(w.id, 120) && /^[\w-]+$/.test(w.id) && !wsIds.has(w.id),
      'Invalid or duplicate workspace ID.',
    );
    wsIds.add(w.id);
    ensure(
      text(w.name, 100) &&
        w.name.trim() &&
        w.preset in PRESETS &&
        w.plan in PLANS &&
        ['MXN', 'USD', 'EUR'].includes(w.currency),
      'Invalid workspace settings.',
    );
    ensure(
      typeof w.sample === 'boolean' &&
        typeof w.archived === 'boolean' &&
        dateTime(w.createdAt) &&
        nonnegative(w.monthlyBudgetMinor),
      'Invalid workspace properties.',
    );
    ensure(
      Array.isArray(w.modules) &&
        new Set(w.modules).size === w.modules.length &&
        w.modules.every((m) => MODULES.includes(m) && PLANS[w.plan].modules.includes(m)),
      'Invalid module entitlement.',
    );
    ensure(
      Array.isArray(w.stages) &&
        w.stages.length >= 2 &&
        w.stages.length <= 20 &&
        new Set(w.stages.map((s) => s.id)).size === w.stages.length &&
        w.stages.every(
          (s) => text(s.id, 120) && text(s.name, 60) && ['open', 'won', 'lost'].includes(s.outcome),
        ),
      'Invalid pipeline stages.',
    );
    for (const key of ['referralStages', 'categories'] as const)
      ensure(
        Array.isArray(w[key]) &&
          w[key].length > 0 &&
          w[key].length <= 30 &&
          new Set(w[key]).size === w[key].length &&
          w[key].every((s) => text(s, 80) && s.trim()),
        `Invalid ${key}.`,
      );
  }
  const allIds = new Set<string>();
  const keys = [
    'contacts',
    'companies',
    'deals',
    'projects',
    'expenses',
    'payments',
    'tasks',
    'referrals',
    'templates',
    'drafts',
    'automations',
    'automationRuns',
    'notifications',
  ] as const;
  for (const key of keys)
    for (const r of d[key] as Row[]) {
      ensure(
        r &&
          text(r.id, 120) &&
          /^[\w-]+$/.test(r.id) &&
          !allIds.has(r.id) &&
          wsIds.has(r.workspaceId),
        `Invalid ${key} ownership or identifier.`,
      );
      allIds.add(r.id);
      ensure(
        Number.isInteger(r.version) &&
          r.version > 0 &&
          typeof r.archived === 'boolean' &&
          dateTime(r.createdAt) &&
          dateTime(r.updatedAt),
        `Invalid ${key} version or dates.`,
      );
    }
  const link = (rows: Row[], value: string, ws: string, optional = true) =>
    ensure(
      (optional && value === '') || rows.some((r) => r.id === value && r.workspaceId === ws),
      'A linked record is missing or belongs to another workspace.',
    );
  const member = (value: string, ws: string, optional = false) =>
    ensure(
      value === 'pool' ||
        (optional && value === '') ||
        d.contacts.some((c) => c.id === value && c.workspaceId === ws && c.kind === 'member'),
      'A member link is invalid.',
    );
  const notes = (r: { notes: string }) => ensure(text(r.notes, 10000), 'Invalid notes.');
  for (const c of d.contacts) {
    ensure(
      text(c.name, 150) &&
        c.name.trim() &&
        ['customer', 'supplier', 'member', 'candidate', 'employer'].includes(c.kind) &&
        text(c.company, 200) &&
        text(c.phone, 50) &&
        text(c.email, 254) &&
        (!c.email || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(c.email)) &&
        text(c.url, 2000) &&
        (!c.url || /^https?:\/\//.test(c.url)) &&
        Number.isInteger(c.weight) &&
        c.weight > 0 &&
        c.weight <= 100000 &&
        (c.position === undefined || text(c.position, 120)) &&
        (c.decisionMaker === undefined || ['yes', 'no', 'unknown'].includes(c.decisionMaker)) &&
        (c.source === undefined || text(c.source, 120)),
      'Invalid contact.',
    );
    if (c.companyId) link(d.companies, c.companyId, c.workspaceId);
    notes(c);
  }
  for (const c of d.companies) {
    ensure(
      text(c.name, 200) &&
        c.name.trim() &&
        text(c.phone, 50) &&
        text(c.email, 254) &&
        (!c.email || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(c.email)) &&
        text(c.url, 2000) &&
        (!c.url || /^https?:\/\//.test(c.url)) &&
        text(c.address, 500) &&
        (c.source === undefined || text(c.source, 120)),
      'Invalid company.',
    );
    link(d.contacts, c.primaryContactId, c.workspaceId);
    notes(c);
  }
  for (const r of [...d.deals, ...d.projects]) {
    ensure(
      text(r.title, 200) && r.title.trim() && nonnegative(r.amountMinor),
      'Invalid work or opportunity.',
    );
    validateDate(r.due);
    notes(r);
    link(d.contacts, r.contactId, r.workspaceId);
  }
  for (const r of d.deals) {
    ensure(
      d.workspaces.find((w) => w.id === r.workspaceId)!.stages.some((s) => s.id === r.stageId),
      'Opportunity stage is missing.',
    );
    link(d.projects, r.projectId, r.workspaceId);
  }
  for (const r of d.projects) {
    ensure(['planned', 'active', 'completed'].includes(r.status), 'Invalid work status.');
    link(d.deals, r.dealId, r.workspaceId);
    member(r.assigneeId, r.workspaceId, true);
    ensure(
      r.number === undefined || (Number.isSafeInteger(r.number) && r.number > 0),
      'Invalid order number.',
    );
    if (r.release)
      ensure(
        ['deposit', 'manager'].includes(r.release.basis) &&
          text(r.release.reason, 2000) &&
          (r.release.basis !== 'manager' || r.release.reason.trim()) &&
          dateTime(r.release.at),
        'Invalid production release.',
      );
    if (r.jobs !== undefined) {
      ensure(
        Array.isArray(r.jobs) &&
          r.jobs.length > 0 &&
          r.jobs.length <= 20 &&
          new Set(r.jobs.map((j) => j.id)).size === r.jobs.length,
        'Invalid order jobs.',
      );
      for (const j of r.jobs) {
        ensure(
          text(j.id, 300) &&
            text(j.name, 120) &&
            j.name.trim() &&
            text(j.notes, 10000) &&
            PRODUCTION_STAGES.includes(j.stage) &&
            (j.stage === 'Awaiting release') === !(r.release || r.status !== 'planned'),
          'Invalid order job.',
        );
        validateDate(j.due);
        member(j.assigneeId, r.workspaceId, true);
      }
    }
  }
  for (const e of d.expenses) {
    ensure(
      text(e.description, 300) &&
        e.description.trim() &&
        nonnegative(e.amountMinor) &&
        e.amountMinor > 0 &&
        text(e.category, 80) &&
        ['submitted', 'approved', 'rejected'].includes(e.status) &&
        text(e.reason, 5000) &&
        text(e.voidReason, 2000),
      'Invalid expense.',
    );
    validateDate(e.date, true);
    member(e.payerId, e.workspaceId);
    link(d.projects, e.projectId, e.workspaceId);
    if (e.receipt) validateReceipt(e.receipt);
    ensure(
      Array.isArray(e.shares) && new Set(e.shares.map((s) => s.contactId)).size === e.shares.length,
      'Invalid expense shares.',
    );
    for (const s of e.shares) {
      member(s.contactId, e.workspaceId);
      ensure(s.contactId !== 'pool' && nonnegative(s.amountMinor), 'Invalid household share.');
    }
    const household = d.workspaces.find((w) => w.id === e.workspaceId)!.preset === 'household';
    ensure(
      household ? sum(e.shares.map((s) => s.amountMinor)) === e.amountMinor : e.shares.length === 0,
      'Expense shares do not match the workspace or expense total.',
    );
  }
  for (const p of d.payments) {
    ensure(
      ['receipt', 'contribution', 'reimbursement', 'settlement'].includes(p.kind) &&
        nonnegative(p.amountMinor) &&
        p.amountMinor > 0 &&
        ['cash', 'transfer', 'card', 'other'].includes(p.method) &&
        text(p.reference, 1000) &&
        text(p.voidReason, 2000),
      'Invalid payment.',
    );
    validateDate(p.date, true);
    link(d.projects, p.projectId, p.workspaceId);
    ensure(
      Array.isArray(p.allocations) &&
        new Set(p.allocations.map((a) => a.expenseId)).size === p.allocations.length,
      'Invalid payment allocations.',
    );
    if (p.kind === 'receipt') {
      link(d.contacts, p.fromId, p.workspaceId);
      ensure(p.toId === 'pool', 'Invalid receipt destination.');
    } else {
      member(p.fromId, p.workspaceId);
      member(p.toId, p.workspaceId);
      ensure(p.fromId !== p.toId, 'Invalid self-payment.');
    }
    for (const a of p.allocations) {
      link(d.expenses, a.expenseId, p.workspaceId, false);
      ensure(nonnegative(a.amountMinor) && a.amountMinor > 0, 'Invalid allocation amount.');
      const e = d.expenses.find((e) => e.id === a.expenseId)!;
      ensure(
        e.payerId === p.toId && (p.voidReason || (e.status === 'approved' && !e.voidReason)),
        'Invalid reimbursement target.',
      );
    }
    ensure(
      p.kind === 'reimbursement'
        ? sum(p.allocations.map((a) => a.amountMinor)) === p.amountMinor
        : p.allocations.length === 0,
      'Allocations do not equal the reimbursement.',
    );
  }
  for (const e of d.expenses)
    ensure(
      sum(
        d.payments
          .filter((p) => !p.voidReason)
          .flatMap((p) =>
            p.allocations.filter((a) => a.expenseId === e.id).map((a) => a.amountMinor),
          ),
      ) <= e.amountMinor,
      'Expense is over-reimbursed.',
    );
  for (const p of d.projects)
    ensure(
      sum(
        d.payments
          .filter((r) => !r.voidReason && r.kind === 'receipt' && r.projectId === p.id)
          .map((r) => r.amountMinor),
      ) <= p.amountMinor,
      'Job has excess allocations.',
    );
  for (const t of d.tasks) {
    ensure(
      text(t.title, 200) &&
        t.title.trim() &&
        typeof t.done === 'boolean' &&
        ['none', 'daily', 'weekly', 'monthly'].includes(t.recurrence),
      'Invalid task.',
    );
    validateDate(t.due, t.recurrence !== 'none');
    notes(t);
    member(t.assigneeId, t.workspaceId, true);
    link(d.projects, t.projectId, t.workspaceId);
    link(d.tasks, t.nextTaskId, t.workspaceId);
  }
  for (const r of d.referrals) {
    link(d.contacts, r.candidateId, r.workspaceId, false);
    ensure(
      d.contacts.find((c) => c.id === r.candidateId)?.kind === 'candidate' &&
        text(r.role, 200) &&
        text(r.company, 200) &&
        text(r.url, 2000) &&
        (!r.url || /^https?:\/\//.test(r.url)) &&
        text(r.recipient, 254) &&
        (!r.recipient || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(r.recipient)) &&
        nonnegative(r.rewardMinor) &&
        d.workspaces.find((w) => w.id === r.workspaceId)!.referralStages.includes(r.stage),
      'Invalid referral.',
    );
    notes(r);
    validateDate(r.due);
  }
  for (const t of [...d.templates, ...d.drafts])
    ensure(
      text(t.subject, 250) && !/[\r\n]/.test(t.subject) && text(t.body, 20000),
      'Invalid message.',
    );
  for (const t of d.templates) ensure(text(t.name, 120) && t.name.trim(), 'Invalid template name.');
  for (const draft of d.drafts) {
    link(d.referrals, draft.referralId, draft.workspaceId);
    ensure(
      text(draft.to, 254) && (!draft.to || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(draft.to)),
      'Invalid draft recipient.',
    );
  }
  for (const rule of d.automations) {
    const ws = d.workspaces.find((w) => w.id === rule.workspaceId)!;
    parseAutomation(rule as unknown as Record<string, unknown>, d, ws, false);
    ensure(dateTime(rule.activeSince), 'Invalid automation start.');
  }
  const subject = (s: { kind: string; id: string; jobId: string }) =>
    s &&
    ['deal', 'order', 'task', 'contact'].includes(s.kind) &&
    text(s.id, 120) &&
    text(s.jobId, 300);
  for (const run of d.automationRuns) {
    link(d.automations, run.automationId, run.workspaceId, false);
    ensure(
      subject(run.subject) &&
        text(run.key, 1000) &&
        dateTime(run.triggeredAt) &&
        dateTime(run.dueAt) &&
        ['waiting', 'done', 'skipped', 'failed', 'cancelled'].includes(run.status) &&
        text(run.outcome, 1000),
      'Invalid automation run.',
    );
  }
  for (const n of d.notifications) {
    member(n.recipientId, n.workspaceId);
    ensure(
      n.recipientId !== 'pool' &&
        text(n.message, 500) &&
        n.message.trim() &&
        subject(n.subject) &&
        text(n.automationId, 120) &&
        typeof n.read === 'boolean',
      'Invalid notification.',
    );
  }
  for (const a of d.audit)
    ensure(
      a &&
        text(a.id, 120) &&
        wsIds.has(a.workspaceId) &&
        dateTime(a.at) &&
        text(a.action, 100) &&
        text(a.recordId, 120) &&
        text(a.summary, 3000) &&
        (a.automationId === undefined || text(a.automationId, 120)),
      'Invalid audit entry.',
    );
  ensure(
    new Set(d.commands.map((c) => c.id)).size === d.commands.length &&
      d.commands.every((c) => c && text(c.id, 120) && text(c.fingerprint, 4500000)),
    'Invalid command receipts.',
  );
  return structuredClone(d);
}
export function workspaceData(data: SuiteData, ws: Workspace): SuiteData {
  const next = emptyData();
  next.revision = data.revision;
  next.workspaces = [structuredClone(ws)];
  for (const key of [
    'contacts',
    'companies',
    'deals',
    'projects',
    'expenses',
    'payments',
    'tasks',
    'referrals',
    'templates',
    'drafts',
    'automations',
    'automationRuns',
    'notifications',
    'audit',
  ] as const)
    (next[key] as unknown[]) = structuredClone(
      (data[key] ?? []).filter((r) => r.workspaceId === ws.id),
    );
  next.commands = structuredClone(data.commands);
  return next;
}
