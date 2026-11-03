/** Versioned product contracts, independent of React, persistence and transport. */
export type Preset = 'signage' | 'household' | 'referrals' | 'food';
export type Module = 'crm' | 'work' | 'money' | 'chores' | 'referrals';
export type Plan = 'personal' | 'team' | 'business';
export type Stage = {
  id: string;
  name: string;
  outcome: 'open' | 'won' | 'lost';
};
export type Workspace = {
  id: string;
  name: string;
  preset: Preset;
  currency: 'MXN' | 'USD' | 'EUR';
  modules: Module[];
  plan: Plan;
  sample: boolean;
  archived: boolean;
  stages: Stage[];
  referralStages: string[];
  categories: string[];
  monthlyBudgetMinor: number;
  createdAt: string;
};
export type Row = {
  id: string;
  workspaceId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};
export type Contact = Row & {
  name: string;
  kind: 'customer' | 'supplier' | 'member' | 'candidate' | 'employer';
  company: string;
  email: string;
  phone: string;
  url: string;
  notes: string;
  weight: number;
  /** Added with the CRM workflow; absent on older records. */
  position?: string;
  decisionMaker?: 'yes' | 'no' | 'unknown';
  /** Linked Company record; `company` keeps its name (or free text when unlinked). */
  companyId?: string;
  /** Where the record came from: a form, a sales channel or an import file. */
  source?: string;
};
/** An organization. People link to it with `companyId`; it is not a user account. */
export type Company = Row & {
  name: string;
  email: string;
  phone: string;
  address: string;
  url: string;
  notes: string;
  /** The usual contact person; empty when none is chosen. */
  primaryContactId: string;
  source?: string;
};
export type Deal = Row & {
  title: string;
  contactId: string;
  amountMinor: number;
  stageId: string;
  due: string;
  notes: string;
  projectId: string;
};
/** A piece of an Order's production work, assigned to one team member. */
export type Job = {
  id: string;
  name: string;
  assigneeId: string;
  stage: ProductionStage;
  due: string;
  notes: string;
};
export type Release = {
  basis: 'deposit' | 'manager';
  reason: string;
  at: string;
};
/**
 * Stored as `projects` for compatibility; in the product vocabulary this is an Order.
 * A Deal is a Project (sales). See the CRM workflow and terminology requirements note.
 */
export type Project = Row & {
  title: string;
  contactId: string;
  amountMinor: number;
  status: 'planned' | 'active' | 'completed';
  due: string;
  notes: string;
  dealId: string;
  assigneeId: string;
  /** Added with the CRM workflow; absent on older records. */
  number?: number;
  release?: Release;
  jobs?: Job[];
};
export const PRODUCTION_STAGES = [
  'Awaiting release',
  'Design',
  'Design approved',
  'Fabrication',
  'Installation',
  'Delivered',
  'Closed',
] as const;
export type ProductionStage = (typeof PRODUCTION_STAGES)[number];
export type Attachment = {
  name: string;
  mime: 'image/png' | 'image/jpeg' | 'application/pdf';
  base64: string;
  size: number;
};
export type Expense = Row & {
  description: string;
  amountMinor: number;
  date: string;
  category: string;
  payerId: string;
  projectId: string;
  status: 'submitted' | 'approved' | 'rejected';
  reason: string;
  shares: { contactId: string; amountMinor: number }[];
  receipt?: Attachment;
  voidReason: string;
};
export type Payment = Row & {
  kind: 'receipt' | 'contribution' | 'reimbursement' | 'settlement';
  amountMinor: number;
  date: string;
  fromId: string;
  toId: string;
  projectId: string;
  method: string;
  reference: string;
  allocations: { expenseId: string; amountMinor: number }[];
  voidReason: string;
};
export type Task = Row & {
  title: string;
  assigneeId: string;
  projectId: string;
  due: string;
  notes: string;
  done: boolean;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly';
  nextTaskId: string;
};
export type Referral = Row & {
  candidateId: string;
  company: string;
  role: string;
  url: string;
  stage: string;
  recipient: string;
  due: string;
  notes: string;
  rewardMinor: number;
};
export type MessageTemplate = Row & {
  name: string;
  subject: string;
  body: string;
};
export type Draft = Row & {
  referralId: string;
  to: string;
  subject: string;
  body: string;
};
export type Audit = {
  id: string;
  workspaceId: string;
  at: string;
  action: string;
  recordId: string;
  summary: string;
  /** Set when an automation, not a person, made the change. */
  automationId?: string;
};
/** Fixed lists only: automations are not a general workflow engine. */
export type AutomationTrigger =
  | { type: 'deal.stage'; stageId: string }
  | { type: 'job.stage'; stage: ProductionStage }
  | { type: 'task.completed' }
  | { type: 'order.tasks.done' }
  | { type: 'date.reached'; field: 'deal.due' | 'job.due' | 'task.due'; offsetDays: number }
  | { type: 'deal.inactive'; days: number }
  /** A person or company is added; `kind` empty means any type. */
  | { type: 'contact.created'; kind: '' | Contact['kind'] };
export type AutomationCondition =
  | { type: 'no.activity' }
  | { type: 'deal.stage.is'; stageId: string }
  | { type: 'job.stage.is'; stage: ProductionStage }
  | { type: 'job.unassigned' };
/** `memberId` is a member contact, `assignee` (the record's assignee) or empty for nobody. */
export type AutomationAction =
  | { type: 'task.create'; title: string; memberId: string; dueInDays: number }
  | { type: 'job.assign'; memberId: string }
  | { type: 'notify'; memberId: string; message: string }
  | { type: 'stage.move'; stage: string }
  | { type: 'note.add'; text: string };
export type Automation = Row & {
  name: string;
  enabled: boolean;
  /** Time-based triggers only count from this moment, so turning a rule on never floods. */
  activeSince: string;
  trigger: AutomationTrigger;
  conditions: AutomationCondition[];
  wait: { amount: number; unit: 'hours' | 'days' };
  actions: AutomationAction[];
};
export type AutomationSubject = {
  kind: 'deal' | 'order' | 'task' | 'contact';
  id: string;
  /** Set when the subject is one Job of an Order. */
  jobId: string;
};
export type AutomationRun = Row & {
  automationId: string;
  subject: AutomationSubject;
  /** Prevents the same trigger firing twice for the same record. */
  key: string;
  triggeredAt: string;
  dueAt: string;
  status: 'waiting' | 'done' | 'skipped' | 'failed' | 'cancelled';
  outcome: string;
};
export type Notification = Row & {
  recipientId: string;
  message: string;
  subject: AutomationSubject;
  automationId: string;
  read: boolean;
};
export type SuiteData = {
  schemaVersion: 1;
  revision: number;
  workspaces: Workspace[];
  contacts: Contact[];
  companies: Company[];
  deals: Deal[];
  projects: Project[];
  expenses: Expense[];
  payments: Payment[];
  tasks: Task[];
  referrals: Referral[];
  templates: MessageTemplate[];
  drafts: Draft[];
  automations: Automation[];
  automationRuns: AutomationRun[];
  notifications: Notification[];
  audit: Audit[];
  commands: { id: string; fingerprint: string }[];
};
export type Command = {
  id: string;
  workspaceId: string;
  type: string;
  payload: Record<string, unknown>;
  expectedRevision?: number;
};
export interface OperationsRepository {
  read(): Promise<SuiteData>;
  execute(command: Command): Promise<SuiteData>;
  subscribe(listener: () => void): () => void;
}
export const MODULES: Module[] = ['crm', 'work', 'money', 'chores', 'referrals'];
export const PLANS: Record<Plan, { name: string; modules: Module[]; description: string }> = {
  personal: {
    name: 'Personal',
    modules: ['money', 'chores'],
    description: 'Shared expenses, contributions and everyday tasks.',
  },
  team: {
    name: 'Team',
    modules: ['crm', 'work', 'money', 'chores', 'referrals'],
    description: 'Connected CRM, operations, money and referrals.',
  },
  business: {
    name: 'Business',
    modules: ['crm', 'work', 'money', 'chores', 'referrals'],
    description: 'All current modules. Shared-team services require a connected backend.',
  },
};
export const PRESETS: Record<
  Preset,
  {
    name: string;
    modules: Module[];
    plan: Plan;
    description: string;
    workLabel: string;
  }
> = {
  signage: {
    name: 'Signage & services',
    modules: ['crm', 'work', 'money', 'chores'],
    plan: 'business',
    description: 'Lead to quotation, installation and collection.',
    workLabel: 'Production',
  },
  household: {
    name: 'Household',
    modules: ['money', 'chores'],
    plan: 'personal',
    description: 'Shared expenses, fair contributions and chores.',
    workLabel: 'Projects',
  },
  referrals: {
    name: 'Recruiting & referrals',
    modules: ['referrals', 'crm', 'chores'],
    plan: 'team',
    description: 'Candidates, opportunities, follow-ups and messages.',
    workLabel: 'Projects',
  },
  food: {
    name: 'Food business',
    modules: ['work', 'money', 'chores'],
    plan: 'team',
    description: 'Customer orders, supplier expenses and collections.',
    workLabel: 'Orders',
  },
};
export const emptyData = (): SuiteData => ({
  schemaVersion: 1,
  revision: 0,
  workspaces: [],
  contacts: [],
  companies: [],
  deals: [],
  projects: [],
  expenses: [],
  payments: [],
  tasks: [],
  referrals: [],
  templates: [],
  drafts: [],
  automations: [],
  automationRuns: [],
  notifications: [],
  audit: [],
  commands: [],
});
