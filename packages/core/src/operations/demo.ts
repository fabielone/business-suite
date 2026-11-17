import { emptyData, type SuiteData } from './types.js';
import { executeCommand } from './commands.js';

/**
 * The people of the demo company. Each signs in (in the browser demo only) with the role
 * shown; emails are reserved example.com addresses and are never sent to.
 */
export const DEMO_PEOPLE = [
  {
    key: 'owner',
    role: 'owner',
    name: 'Morgan · example',
    title: 'Owner',
    email: 'morgan@example.com',
  },
  {
    key: 'manager',
    role: 'manager',
    name: 'Casey · example',
    title: 'Operations manager',
    email: 'casey@example.com',
  },
  {
    key: 'sales',
    role: 'collaborator',
    name: 'Priya · example',
    title: 'Sales representative',
    email: 'priya@example.com',
  },
  {
    key: 'finance',
    role: 'finance',
    name: 'Rosa · example',
    title: 'Bookkeeper',
    email: 'rosa@example.com',
  },
  {
    key: 'lead',
    role: 'lead',
    name: 'Sam · example',
    title: 'Production lead',
    email: 'sam@example.com',
  },
  {
    key: 'installer',
    role: 'production',
    name: 'Alex · example',
    title: 'Installer',
    email: 'alex@example.com',
  },
  {
    key: 'designer',
    role: 'production',
    name: 'Jordan · example',
    title: 'Designer',
    email: 'jordan@example.com',
  },
] as const;
/** Bump when the samples change, so saved browser demos are offered a fresh copy. */
export const SAMPLE_VERSION = 2;

/**
 * The browser demo account: one fictional signage company with every role, a full pipeline,
 * orders in production, money awaiting review and a week of time-clock history. Explicit
 * fixtures only; never called by live startup, account provisioning or the server.
 * (Tests use the smaller, stable `sampleData`.)
 */
export function demoData(now = new Date().toISOString()): SuiteData {
  let data = emptyData();
  let n = 0;
  const day = now.slice(0, 10);
  const next = new Date(now);
  next.setUTCDate(next.getUTCDate() + 3);
  const due = next.toISOString().slice(0, 10);
  const later = new Date(now);
  later.setUTCDate(later.getUTCDate() + 14);
  const dueLater = later.toISOString().slice(0, 10);
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
    ['insignia', 'Brightline Signs', 'signage'],
    ['household', 'Our household', 'household'],
    ['referrals', 'Referral desk', 'referrals'],
  ]) {
    run(ws!, 'workspace.create', { name, preset });
    data.workspaces.find((w) => w.id === ws)!.sample = true;
  }
  data.workspaces.find((w) => w.id === 'household')!.monthlyBudgetMinor = 1500000;
  const member = (ws: string, name: string, weight = 1, email = '') =>
    run(ws, 'contact.save', { name, kind: 'member', weight, email });
  const staff = (name: string, position: string, email: string) =>
    run('insignia', 'contact.save', { name, kind: 'member', weight: 1, email, position });
  // One member record per demo person, matched to their sign-in by email.
  const ids: Record<string, string> = {};
  for (const person of DEMO_PEOPLE)
    ids[person.key] = staff(person.name, person.title, person.email);
  const owner = ids.owner!,
    manager = ids.manager!,
    sales = ids.sales!,
    finance = ids.finance!,
    shop = ids.lead!,
    alex = ids.installer!,
    designer = ids.designer!;
  // Sam leads Production, so unclaimed Production work alerts Sam.
  run('insignia', 'team.save', {
    id: 'production',
    name: 'Production',
    memberIds: [alex, shop, designer],
    leadIds: [shop],
    alert: { amount: 4, unit: 'hours' },
  });
  run('insignia', 'team.save', {
    id: 'sales',
    name: 'Sales',
    memberIds: [sales, manager],
    leadIds: [manager],
    alert: { amount: 2, unit: 'hours' },
  });
  // Companies first, then their people linked to them.
  const company = (name: string, extra: Record<string, unknown> = {}) =>
    run('insignia', 'company.save', { name, ...extra });
  const person = (
    name: string,
    kind: 'lead' | 'customer' | 'supplier',
    companyId: string,
    position: string,
    decisionMaker: 'yes' | 'no' | 'unknown',
    email: string,
    phone = '',
  ) =>
    run('insignia', 'contact.save', {
      name,
      kind,
      companyId,
      position,
      decisionMaker,
      email,
      phone,
    });
  const primary = (companyId: string, contactId: string, fields: Record<string, unknown>) =>
    run('insignia', 'company.save', { id: companyId, ...fields, primaryContactId: contactId });
  const studioFields = {
    name: 'Example Studio',
    email: 'hello@studio.example.com',
    address: 'Example Ave 120, Example City',
  };
  const studio = company(studioFields.name, studioFields);
  const coffeeFields = { name: 'Example Coffee Roasters', email: 'orders@coffee.example.com' };
  const coffee = company(coffeeFields.name, coffeeFields);
  const fuelFields = { name: 'Example Fuel Stations', url: 'https://example.com/fuel' };
  const fuel = company(fuelFields.name, fuelFields);
  const clinicFields = { name: 'Example Dental Clinic', phone: '+52 55 0000 0001' };
  const clinicCo = company(clinicFields.name, clinicFields);
  const gymFields = { name: 'Example Fitness Club' };
  const gym = company(gymFields.name, gymFields);
  const hotelFields = { name: 'Example Boutique Hotel', address: 'Example Old Town 7' };
  const hotel = company(hotelFields.name, hotelFields);
  const schoolFields = { name: 'Example Language School' };
  const school = company(schoolFields.name, schoolFields);
  const supplierFields = { name: 'Example Acrylic Supply', email: 'sales@acrylic.example.com' };
  const supplierCo = company(supplierFields.name, supplierFields);
  const customer = person(
    'Marina · example',
    'customer',
    studio,
    'Office manager',
    'yes',
    'marina@example.com',
  );
  const retail = person('Diego · example', 'customer', coffee, 'Owner', 'yes', 'diego@example.com');
  const fleet = person(
    'Laura · example',
    'lead',
    fuel,
    'Regional operations manager',
    'unknown',
    'laura@example.com',
  );
  const clinic = person(
    'Omar · example',
    'lead',
    clinicCo,
    'Administrator',
    'no',
    'omar@example.com',
  );
  const coach = person(
    'Valeria · example',
    'lead',
    gym,
    'General manager',
    'yes',
    'valeria@example.com',
  );
  const hotelier = person('Hugo · example', 'lead', hotel, 'Owner', 'yes', 'hugo@example.com');
  const principal = person(
    'Ines · example',
    'customer',
    school,
    'Director',
    'yes',
    'ines@example.com',
  );
  const vendor = person(
    'Raul · example',
    'supplier',
    supplierCo,
    'Account manager',
    'unknown',
    'raul@example.com',
  );
  primary(studio, customer, studioFields);
  primary(coffee, retail, coffeeFields);
  primary(fuel, fleet, fuelFields);
  primary(clinicCo, clinic, clinicFields);
  primary(gym, coach, gymFields);
  primary(hotel, hotelier, hotelFields);
  primary(school, principal, schoolFields);
  primary(supplierCo, vendor, supplierFields);
  // The pipeline: at least one deal in every stage, so each column has something to show.
  const deal = (
    title: string,
    contactId: string,
    amountMinor: number,
    stageId: string,
    when = dueLater,
    notes = '',
  ) => run('insignia', 'deal.save', { title, contactId, amountMinor, stageId, due: when, notes });
  deal('Clinic exterior sign', clinic, 1250000, 'new');
  deal(
    'Lobby logo wall',
    hotelier,
    3400000,
    'new',
    dueLater,
    'Example: came in from the website form.',
  );
  deal('Gym wall graphics', coach, 2750000, 'contacted');
  deal('Storefront refresh', customer, 1850000, 'interested', due);
  deal(
    'Rebrand of 6 fuel stations',
    fleet,
    38500000,
    'visit',
    dueLater,
    'Example: canopy fascia, pylon signs and pump toppers across six sites.',
  );
  deal('Wayfinding for a new office', customer, 4600000, 'quoted', due);
  deal('Room number plaques', hotelier, 980000, 'quoted', dueLater);
  deal('Window graphics and menu boards', retail, 2100000, 'negotiation');
  deal('Monument sign', coach, 6200000, 'lost', due, 'Example: chose a cheaper local supplier.');
  const d = deal(
    'Reception signage',
    customer,
    2800000,
    'won',
    due,
    'Example: illuminated lettering, site visit and installation.',
  );
  const job = run('insignia', 'deal.convert', { id: d });
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
  // A second order released by a manager, waiting in Design with the designer.
  const school1 = deal('Classroom door signs', principal, 1560000, 'won', due);
  const order2 = run('insignia', 'deal.convert', { id: school1 });
  run('insignia', 'order.release', {
    id: order2,
    basis: 'manager',
    reason: 'Example: long-standing customer, deposit promised on approval of the proof.',
  });
  run('insignia', 'job.save', {
    orderId: order2,
    jobId: `${order2}-job-1`,
    name: 'Artwork and proof',
    assigneeId: designer,
    due,
    notes: 'Example: 24 door signs with room numbers and braille.',
  });
  run('insignia', 'job.save', {
    orderId: order2,
    name: 'Print and cut',
    assigneeId: shop,
    due: dueLater,
  });
  run('insignia', 'expense.add', {
    description: 'Vinyl roll, matte white',
    amountMinor: 185000,
    date: day,
    category: 'Materials',
    payerId: alex,
    projectId: job,
    reason: 'Fictional sample; the supplier will email the receipt.',
  });
  run('insignia', 'expense.add', {
    description: 'Fuel for the site visit',
    amountMinor: 65000,
    date: day,
    category: 'Travel',
    payerId: sales,
    reason: 'Fictional sample; paper receipt lost.',
  });
  run('insignia', 'task.save', {
    title: 'Confirm site measurements',
    assigneeId: alex,
    projectId: job,
    due,
    recurrence: 'none',
  });
  run('insignia', 'task.save', {
    title: 'Send revised quote for the fuel station rebrand',
    assigneeId: sales,
    due,
    recurrence: 'none',
  });
  run('insignia', 'task.save', {
    title: 'Prepare artwork proof for the clinic sign',
    assigneeId: designer,
    due,
    recurrence: 'none',
  });
  run('insignia', 'task.save', {
    title: 'Approve this week’s hours',
    assigneeId: finance,
    due,
    recurrence: 'weekly',
  });
  run('insignia', 'task.save', {
    title: 'Review the pipeline with Sales',
    assigneeId: owner,
    due,
    recurrence: 'weekly',
  });
  // Up for grabs: any team member can claim these from My work.
  run('insignia', 'task.save', {
    title: 'Weed and mask vinyl for the door signs',
    assigneeId: '',
    teamId: 'production',
    projectId: order2,
    due,
    recurrence: 'none',
  });
  run('insignia', 'task.save', {
    title: 'Load the van for tomorrow’s installation',
    assigneeId: '',
    teamId: 'production',
    due,
    recurrence: 'none',
  });
  run('insignia', 'task.save', {
    title: 'Call back the website inquiry about a lobby logo',
    assigneeId: '',
    teamId: 'sales',
    due,
    recurrence: 'none',
  });
  const done = run('insignia', 'task.save', {
    title: 'Order acrylic sheets',
    assigneeId: shop,
    due: day,
    recurrence: 'none',
  });
  run('insignia', 'task.complete', { id: done, by: shop });
  // Signage workflow examples from the CRM workflow note; projects have no owner yet.
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
  run('insignia', 'automation.save', {
    name: 'Welcome a new lead',
    enabled: true,
    trigger: { type: 'contact.created', kind: 'lead' },
    conditions: [],
    wait: { amount: 0, unit: 'days' },
    actions: [
      {
        type: 'task.create',
        title: 'Call {record} within one business day',
        memberId: sales,
        dueInDays: 1,
      },
    ],
  });
  // Time clock: last week's finished shifts (fixture history), then who is on the clock now.
  const hour = 60 * 60 * 1000;
  const nowMs = Date.parse(now);
  const shifts: [string, string, number, number][] = [
    // member, order, start hour UTC, length in hours. 15:00 UTC is 09:00 in Mexico City.
    [alex, job, 15, 8.5],
    [shop, job, 14.5, 9],
    [designer, order2, 15.5, 7.5],
    [sales, '', 15, 8],
    [manager, '', 14.75, 9],
  ];
  let counted = 0;
  for (let back = 1; counted < 5 && back < 10; back++) {
    const date = new Date(nowMs - back * 24 * hour);
    if ([0, 6].includes(date.getUTCDay())) continue;
    counted++;
    const midnight = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    for (const [memberId, orderId, startHour, length] of shifts) {
      const start = midnight + startHour * hour + (counted % 3) * 6 * 60 * 1000;
      const end = Math.min(start + length * hour, nowMs - 6 * hour);
      if (end <= start) continue;
      data.timeEntries.push({
        id: `sample-time-${++n}`,
        workspaceId: 'insignia',
        version: 1,
        createdAt: new Date(end).toISOString(),
        updatedAt: new Date(end).toISOString(),
        archived: false,
        memberId,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        orderId,
        jobId: '',
        note: '',
      });
    }
  }
  run('insignia', 'time.clockIn', {
    memberId: alex,
    orderId: job,
    note: 'Example: on site for measurements.',
    at: new Date(nowMs - 2.25 * hour).toISOString(),
  });
  run('insignia', 'time.clockIn', {
    memberId: designer,
    orderId: order2,
    jobId: `${order2}-job-1`,
    at: new Date(nowMs - 0.75 * hour).toISOString(),
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
