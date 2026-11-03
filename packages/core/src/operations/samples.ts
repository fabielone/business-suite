import { emptyData, type SuiteData } from './types.js';
import { executeCommand } from './commands.js';

/** Explicit samples only. Never called by live startup or account provisioning. */
export function sampleData(now = new Date().toISOString()): SuiteData {
  let data = emptyData();
  let n = 0;
  const day = now.slice(0, 10);
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 3);
  const due = next.toISOString().slice(0, 10);
  const run = (
    workspaceId: string,
    type: string,
    payload: Record<string, unknown>,
    commandId?: string,
  ) => {
    const id = commandId ?? `sample-command-${++n}`;
    data = executeCommand(data, { id, workspaceId, type, payload }, now);
    return id;
  };
  for (const [ws, name, preset] of [
    ['insignia', 'Insignia', 'signage'],
    ['household', 'Our household', 'household'],
    ['referrals', 'Referral desk', 'referrals'],
  ]) {
    run(ws!, 'workspace.create', { name, preset });
    data.workspaces.find((w) => w.id === ws)!.sample = true;
  }
  data.workspaces.find((w) => w.id === 'household')!.monthlyBudgetMinor = 1500000;
  const member = (ws: string, name: string, weight = 1, email = '') =>
    run(ws, 'contact.save', { name, kind: 'member', weight, email });
  const alex = member('insignia', 'Alex · example', 1, 'alex@example.com');
  const shop = member('insignia', 'Sam · example', 1, 'sam@example.com');
  // Sam leads Production, so unclaimed Production work alerts Sam.
  run('insignia', 'team.save', {
    id: 'production',
    name: 'Production',
    memberIds: [alex, shop],
    leadIds: [shop],
    alert: { amount: 4, unit: 'hours' },
  });
  const customer = run('insignia', 'contact.save', {
    name: 'Marina · example',
    kind: 'customer',
    company: 'Example Studio',
    position: 'Office manager',
    decisionMaker: 'yes',
    email: 'marina@example.com',
  });
  const d = run('insignia', 'deal.save', {
    title: 'Reception signage',
    contactId: customer,
    amountMinor: 2800000,
    stageId: 'won',
    due,
    notes: 'Example: illuminated lettering, site visit and installation.',
  });
  const job = run('insignia', 'deal.convert', { id: d });
  run('insignia', 'deal.save', {
    title: 'Wayfinding for a new office',
    contactId: customer,
    amountMinor: 4600000,
    stageId: 'quoted',
    due,
  });
  run('insignia', 'deal.save', {
    title: 'Storefront refresh',
    contactId: customer,
    amountMinor: 1850000,
    stageId: 'interested',
    due,
  });
  const expense = run('insignia', 'expense.add', {
    description: 'Acrylic and mounting supplies',
    amountMinor: 420000,
    date: day,
    category: 'Materials',
    payerId: alex,
    projectId: job,
    reason: 'Fictional sample; receipt not attached.',
  });
  run('insignia', 'expense.review', { id: expense, status: 'approved' });
  run('insignia', 'payment.add', {
    kind: 'receipt',
    amountMinor: 1000000,
    date: day,
    projectId: job,
    fromId: customer,
    method: 'transfer',
    reference: 'Example customer deposit',
  });
  run('insignia', 'order.release', { id: job, basis: 'deposit', reason: '' });
  run('insignia', 'job.save', {
    orderId: job,
    jobId: `${job}-job-1`,
    name: 'Fabrication',
    assigneeId: shop,
    due,
    notes: 'Example: cut and light the lettering.',
  });
  run('insignia', 'job.save', {
    orderId: job,
    name: 'Installation',
    assigneeId: alex,
    due,
    notes: 'Example: mount at reception.',
  });
  run('insignia', 'job.move', { orderId: job, jobId: `${job}-job-1`, stage: 'Fabrication' });
  run('insignia', 'deal.convert', {
    id: d,
    title: 'Reception signage – phase 2',
    amountMinor: 900000,
  });
  run('insignia', 'task.save', {
    title: 'Confirm site measurements',
    assigneeId: alex,
    projectId: job,
    due,
    recurrence: 'none',
  });
  // The Insignia examples from the CRM workflow note; projects have no owner yet.
  run('insignia', 'automation.save', {
    name: 'Follow up a sent quote',
    enabled: true,
    trigger: { type: 'deal.stage', stageId: 'quoted' },
    conditions: [{ type: 'no.activity' }, { type: 'deal.stage.is', stageId: 'quoted' }],
    wait: { amount: 3, unit: 'days' },
    actions: [
      {
        type: 'task.create',
        title: 'Follow up on the quote: {record}',
        memberId: '',
        dueInDays: 0,
      },
    ],
  });
  run('insignia', 'automation.save', {
    name: 'Fabrication goes to the shop',
    enabled: true,
    trigger: { type: 'job.stage', stage: 'Fabrication' },
    conditions: [],
    wait: { amount: 0, unit: 'days' },
    actions: [
      { type: 'job.assign', memberId: shop },
      {
        type: 'task.create',
        title: 'Prepare materials for {record}',
        memberId: 'assignee',
        dueInDays: 1,
      },
      { type: 'notify', memberId: 'assignee', message: '{record} is ready for fabrication.' },
    ],
  });
  run('insignia', 'automation.save', {
    name: 'Installation done, mark delivered',
    enabled: true,
    trigger: { type: 'order.tasks.done' },
    conditions: [{ type: 'job.stage.is', stage: 'Installation' }],
    wait: { amount: 0, unit: 'days' },
    actions: [
      { type: 'stage.move', stage: 'Delivered' },
      { type: 'notify', memberId: shop, message: '{record} was installed and marked delivered.' },
    ],
  });
  const ana = member('household', 'Ana · example', 2);
  const sam = member('household', 'Sam · example', 1);
  const jo = member('household', 'Jo · example', 1);
  run('household', 'expense.add', {
    description: 'Weekly groceries',
    amountMinor: 180000,
    date: day,
    category: 'Groceries',
    payerId: ana,
    split: 'equal',
  });
  run('household', 'payment.add', {
    kind: 'contribution',
    amountMinor: 200000,
    date: day,
    fromId: sam,
    method: 'transfer',
    reference: 'Example shared-fund contribution',
  });
  run('household', 'task.save', {
    title: 'Take out recycling',
    assigneeId: jo,
    due,
    recurrence: 'weekly',
  });
  run('household', 'task.save', {
    title: 'Plan meals and grocery list',
    assigneeId: ana,
    due: day,
    recurrence: 'weekly',
  });
  const candidate = run('referrals', 'contact.save', {
    name: 'Taylor · example',
    kind: 'candidate',
    company: 'Frontend engineering',
    email: 'taylor@example.com',
    url: 'https://example.com/portfolio',
    notes: 'Example profile: React, TypeScript and accessible product interfaces.',
  });
  run('referrals', 'referral.save', {
    candidateId: candidate,
    company: 'Example Company',
    role: 'Frontend Engineer',
    url: 'https://example.com/careers',
    stage: 'Contacted',
    recipient: 'hiring@example.com',
    due,
    notes: 'Confirm candidate interest before sharing their profile.',
    rewardMinor: 0,
  });
  run('referrals', 'template.save', {
    name: 'Candidate introduction',
    subject: 'Referral: {{candidateName}} for {{role}}',
    body: 'Hi,\n\nI would like to introduce {{candidateName}} for the {{role}} opening at {{company}}.\n\n{{candidateNotes}}\n\nProfile: {{candidateUrl}}\nEmail: {{candidateEmail}}\nOpening: {{jobUrl}}\n\n{{notes}}\n\nThank you.',
  });
  run('referrals', 'template.save', {
    name: 'Follow up',
    subject: 'Following up: {{candidateName}} / {{role}}',
    body: 'Hi,\n\nI am following up on {{candidateName}}’s referral for {{role}} at {{company}}. Is there an update or any additional information I can provide?\n\nThank you.',
  });
  return data;
}
