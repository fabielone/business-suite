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
export type Project = Row & {
  title: string;
  contactId: string;
  amountMinor: number;
  status: 'planned' | 'active' | 'completed';
  due: string;
  notes: string;
  dealId: string;
  assigneeId: string;
};
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
};
export type SuiteData = {
  schemaVersion: 1;
  revision: number;
  workspaces: Workspace[];
  contacts: Contact[];
  deals: Deal[];
  projects: Project[];
  expenses: Expense[];
  payments: Payment[];
  tasks: Task[];
  referrals: Referral[];
  templates: MessageTemplate[];
  drafts: Draft[];
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
    workLabel: 'Jobs',
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
  deals: [],
  projects: [],
  expenses: [],
  payments: [],
  tasks: [],
  referrals: [],
  templates: [],
  drafts: [],
  audit: [],
  commands: [],
});
