export const PERMISSIONS = [
  'workspace.manage',
  'members.manage',
  'contacts.read',
  'contacts.write',
  'crm.read',
  'crm.write',
  'work.read',
  'work.read.assigned',
  'work.write',
  'work.lead',
  'work.assign',
  'prices.read',
  'money.read',
  'money.submit',
  'money.review',
  'money.pay',
  'chores.read',
  'chores.write',
  'referrals.read',
  'referrals.write',
  'backup.export',
  'automations.manage',
] as const;
export type Access = (typeof PERMISSIONS)[number];
export const ROLE_GRANTS: Record<string, Access[]> = {
  owner: [...PERMISSIONS],
  manager: PERMISSIONS.filter((p) => p !== 'members.manage'),
  collaborator: [
    'contacts.read',
    'contacts.write',
    'crm.read',
    'crm.write',
    'work.read',
    'work.write',
    'prices.read',
    'chores.read',
    'chores.write',
    'referrals.read',
    'referrals.write',
  ],
  finance: [
    'contacts.read',
    'work.read',
    'prices.read',
    'money.read',
    'money.submit',
    'money.review',
    'money.pay',
    'backup.export',
  ],
  viewer: ['contacts.read', 'crm.read', 'work.read', 'chores.read', 'referrals.read'],
  // Production never receives prices. Team leads see all production work; workers only theirs.
  lead: ['contacts.read', 'work.read', 'work.lead', 'chores.read', 'chores.write'],
  production: ['contacts.read', 'work.read.assigned', 'chores.read', 'chores.write'],
};
export function commandAccess(type: string, collection?: unknown): Access {
  if (type === 'workspace.settings') return 'workspace.manage';
  if (type.startsWith('automation.')) return 'automations.manage';
  if (type.startsWith('contact.') || type.startsWith('company.') || type === 'lead.capture')
    return 'contacts.write';
  if (type.startsWith('deal.')) return 'crm.write';
  if (type === 'job.save') return 'work.assign';
  if (type === 'order.release') return 'work.write';
  if (type.startsWith('project.')) return 'work.write';
  if (type === 'expense.add') return 'money.submit';
  if (type === 'expense.review') return 'money.review';
  if (type === 'payment.add' || type === 'money.void') return 'money.pay';
  if (type.startsWith('task.')) return 'chores.write';
  if (/^(referral|template|draft)\./.test(type)) return 'referrals.write';
  if (type === 'record.archive' || type === 'record.restore') {
    const access: Record<string, Access> = {
      contacts: 'contacts.write',
      companies: 'contacts.write',
      deals: 'crm.write',
      projects: 'work.write',
      tasks: 'chores.write',
      referrals: 'referrals.write',
      templates: 'referrals.write',
      drafts: 'referrals.write',
      automations: 'automations.manage',
    };
    return access[String(collection)] ?? 'workspace.manage';
  }
  return 'workspace.manage';
}
