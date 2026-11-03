import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  active,
  posted,
  sum,
  projectMoney,
  expenseRemaining,
  householdBalances,
  poolBalance,
  renderMessage,
  csvCell,
  PRESETS,
  PRODUCTION_STAGES,
  authorizeCommand,
  orderJobs,
  orderNumber,
  isReleased,
  type Actor,
  type Job,
  type SuiteData,
  type Workspace,
  type Access,
  type Contact,
  type Deal,
  type Project,
  type Expense,
  type Task,
  type Referral,
  type MessageTemplate,
  type Draft,
  type Payment,
} from '@suite/core/operations';
import {
  Badge,
  Button,
  Empty,
  Icon,
  PageTitle,
  Panel,
  Stats,
  Table,
  today,
  formatMoney,
  type FormSpec,
  type Field,
} from './components';
import { download, eml } from './client';
import { Notifications } from './Automations';

export interface PageProps {
  data: SuiteData;
  ws: Workspace;
  grants: Access[];
  /** The signed-in person; decides record-level rules such as who completes a task. */
  actor: Actor;
  search: string;
  run: (type: string, payload: Record<string, unknown>, key?: string) => Promise<void>;
  form: (spec: FormSpec) => void;
  notify: (s: string) => void;
  go: (page: string) => void;
}
const field = (
  name: string,
  label: string,
  type: Field['type'] = 'text',
  required = false,
): Field => ({ name, label, type, required });
const select = (
  name: string,
  label: string,
  options: { value: string; label: string }[],
): Field => ({ name, label, type: 'select', options });
const options = (rows: { id: string; name?: string; title?: string }[], empty?: string) => [
  ...(empty === undefined ? [] : [{ value: '', label: empty }]),
  ...rows.map((r) => ({ value: r.id, label: r.name ?? r.title ?? r.id })),
];
const match = (value: unknown, search: string) =>
  JSON.stringify(value).toLowerCase().includes(search.toLowerCase());
const rows = <T extends { workspaceId: string }>(records: T[], ws: Workspace) =>
  records.filter((r) => r.workspaceId === ws.id);
const names = (p: PageProps, id: string) =>
  id === 'pool'
    ? p.ws.preset === 'household'
      ? 'Shared funds'
      : 'Business funds'
    : (p.data.contacts.find((c) => c.id === id)?.name ?? 'Unassigned');
const money = (p: PageProps, amount: number) => formatMoney(amount, p.ws.currency);
const members = (p: PageProps) =>
  active(rows(p.data.contacts, p.ws)).filter((c) => c.kind === 'member');
const projects = (p: PageProps) => active(rows(p.data.projects, p.ws));
const ordersOf = (p: PageProps, dealId: string) => projects(p).filter((o) => o.dealId === dealId);
const decisionMaker = (p: PageProps, contactId: string) =>
  p.data.contacts.find((c) => c.id === contactId)?.decisionMaker ?? 'unknown';
const can = (p: PageProps, access: Access) => p.grants.includes(access);
/** Mirrors the server decision so buttons only appear where the action would be accepted. */
const allowed = (p: PageProps, type: string, payload: Record<string, unknown>) => {
  try {
    authorizeCommand(p.data, { id: 'check', workspaceId: p.ws.id, type, payload }, p.actor);
    return true;
  } catch {
    return false;
  }
};
function action(
  p: PageProps,
  title: string,
  type: string,
  fields: Field[],
  initial?: Record<string, unknown>,
  description?: string,
) {
  p.form({
    title,
    fields,
    initial,
    description,
    submit: (v, key) => p.run(type, v, key),
  });
}
function archive(p: PageProps, collection: string, id: string) {
  p.form({
    title: 'Archive record',
    description:
      'This removes it from active lists. Linked records and history remain available in your backup. This does not erase financial history.',
    fields: [],
    submitLabel: 'Archive record',
    submit: (_v, key) => p.run('record.archive', { collection, id }, key),
  });
}
function contactForm(p: PageProps, row?: Contact, kind?: Contact['kind']) {
  action(
    p,
    row ? 'Edit contact' : 'Add contact',
    'contact.save',
    [
      field('name', 'Name', 'text', true),
      select(
        'kind',
        'Contact type',
        ['customer', 'supplier', 'member', 'candidate', 'employer'].map((s) => ({
          value: s,
          label: s[0]!.toUpperCase() + s.slice(1),
        })),
      ),
      field('company', 'Company / specialization'),
      ...(p.ws.preset === 'household'
        ? []
        : [
            field('position', 'Position'),
            {
              ...select('decisionMaker', 'Decision maker', [
                { value: 'unknown', label: 'Unknown' },
                { value: 'yes', label: 'Yes' },
                { value: 'no', label: 'No' },
              ]),
              hint: 'Can this person approve the purchase?',
            },
          ]),
      field('email', 'Email', 'email'),
      field('phone', 'Phone'),
      field('url', 'Website / profile', 'url'),
      {
        ...field('weight', 'Contribution weight', 'number', true),
        min: 1,
        hint: 'Household weighted shares use these proportions. Equal shares ignore weights.',
      },
      field('notes', 'Notes', 'textarea'),
    ],
    row
      ? { decisionMaker: 'unknown', position: '', ...row }
      : {
          decisionMaker: 'unknown',
          kind:
            kind ??
            (p.ws.preset === 'household'
              ? 'member'
              : p.ws.preset === 'referrals'
                ? 'candidate'
                : 'customer'),
          weight: 1,
        },
  );
}
export function Contacts(p: PageProps) {
  const contacts = active(rows(p.data.contacts, p.ws)).filter((r) => match(r, p.search));
  return (
    <>
      <PageTitle
        title={p.ws.preset === 'household' ? 'Members' : 'People'}
        description="Customers, suppliers, members and candidates used across this workspace."
        action={
          can(p, 'contacts.write') && (
            <Button icon="plus" onClick={() => contactForm(p)}>
              Add contact
            </Button>
          )
        }
      />
      {contacts.length ? (
        <Table
          headings={[
            'Name',
            'Type',
            'Contact',
            p.ws.preset === 'household' ? 'Weight' : 'Company',
            'Actions',
          ]}
        >
          {contacts.map((c) => (
            <tr key={c.id}>
              <td>
                <strong>{c.name}</strong>
                {c.notes && <small className="op-truncate">{c.notes}</small>}
              </td>
              <td>
                <Badge tone="plain">{c.kind}</Badge>
              </td>
              <td>
                {c.email || '—'}
                <small>{c.phone}</small>
              </td>
              <td>
                {p.ws.preset === 'household' ? c.weight : c.company || '—'}
                {c.position && <small>{c.position}</small>}
                {c.decisionMaker === 'yes' && <Badge tone="good">Decision maker</Badge>}
              </td>
              <td>
                {can(p, 'contacts.write') && (
                  <div className="op-row-actions">
                    <button onClick={() => contactForm(p, c)}>Edit</button>
                    <button onClick={() => archive(p, 'contacts', c.id)}>Archive</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="No people yet">
          Add customers, suppliers, candidates or household members to link them to work, money and
          referrals.
        </Empty>
      )}
    </>
  );
}
function dealForm(p: PageProps, row?: Deal) {
  action(
    p,
    row ? 'Edit project' : 'New project',
    'deal.save',
    [
      field('title', 'Project', 'text', true),
      select(
        'contactId',
        'Customer / contact',
        options(active(rows(p.data.contacts, p.ws)), 'No contact yet'),
      ),
      field('amountMinor', `Estimated value (${p.ws.currency})`, 'amount', true),
      select(
        'stageId',
        'Pipeline stage',
        p.ws.stages.map((s) => ({ value: s.id, label: s.name })),
      ),
      field('due', 'Next follow-up', 'date'),
      field('notes', 'Requirements & next action', 'textarea'),
    ],
    row
      ? { ...row, amountMinor: (row.amountMinor / 100).toFixed(2) }
      : { amountMinor: '0', due: '' },
  );
}
export function CRM(p: PageProps) {
  const deals = active(rows(p.data.deals, p.ws)).filter((r) => match(r, p.search));
  const open = deals.filter((d) => p.ws.stages.find((s) => s.id === d.stageId)?.outcome === 'open');
  return (
    <>
      <PageTitle
        title="Pipeline"
        description="Projects by sales stage, with the next follow-up and estimated value. A won project can lead to several orders."
        action={
          can(p, 'crm.write') && (
            <Button icon="plus" onClick={() => dealForm(p)}>
              New project
            </Button>
          )
        }
      />
      <Stats
        values={[
          { label: 'Open projects', value: open.length },
          {
            label: 'Open pipeline value',
            value: can(p, 'prices.read')
              ? money(p, sum(open.map((d) => d.amountMinor)))
              : 'Restricted',
          },
          {
            label: 'Follow-ups due',
            value: open.filter((d) => d.due && d.due <= today()).length,
          },
        ]}
      />
      <div className="op-pipeline" aria-label="Project pipeline">
        {p.ws.stages.map((stage) => (
          <section className="op-stage" key={stage.id}>
            <header>
              <h2>{stage.name}</h2>
              <span>{deals.filter((d) => d.stageId === stage.id).length}</span>
            </header>
            {deals
              .filter((d) => d.stageId === stage.id)
              .map((d) => (
                <article className="op-opportunity" key={d.id}>
                  <h3>{d.title}</h3>
                  <p>{d.contactId ? names(p, d.contactId) : 'Contact not assigned'}</p>
                  {d.contactId && decisionMaker(p, d.contactId) !== 'yes' && (
                    <Badge tone="attention">No decision maker confirmed</Badge>
                  )}
                  {can(p, 'prices.read') && <strong>{money(p, d.amountMinor)}</strong>}
                  <small>{d.due ? `Follow up ${d.due}` : 'No follow-up date'}</small>
                  {ordersOf(p, d.id).length > 0 && (
                    <Badge tone="good">
                      {ordersOf(p, d.id).length === 1
                        ? '1 order'
                        : `${ordersOf(p, d.id).length} orders`}
                    </Badge>
                  )}
                  {can(p, 'crm.write') && (
                    <div className="op-row-actions">
                      <button onClick={() => dealForm(p, d)}>Edit / move</button>
                      {p.ws.modules.includes('work') && can(p, 'work.write') && (
                        <button
                          onClick={() =>
                            action(
                              p,
                              'Create order',
                              'deal.convert',
                              [
                                field('title', 'Order title', 'text', true),
                                field(
                                  'amountMinor',
                                  `Agreed price (${p.ws.currency})`,
                                  'amount',
                                  true,
                                ),
                              ],
                              {
                                id: d.id,
                                title: ordersOf(p, d.id).length
                                  ? `${d.title} – order ${ordersOf(p, d.id).length + 1}`
                                  : d.title,
                                amountMinor: (d.amountMinor / 100).toFixed(2),
                              },
                              'Marks the project won and creates an order awaiting release into production. It does not record a payment.',
                            )
                          }
                        >
                          Create order
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            {!deals.some((d) => d.stageId === stage.id) && (
              <p className="op-stage-empty">No projects here.</p>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
function projectForm(p: PageProps, row?: Project) {
  action(
    p,
    row ? 'Edit order' : 'Create order',
    'project.save',
    [
      field('title', 'Title', 'text', true),
      select(
        'contactId',
        'Customer',
        options(active(rows(p.data.contacts, p.ws)), 'Internal work / no customer'),
      ),
      field('amountMinor', `Agreed price (${p.ws.currency})`, 'amount', true),
      select(
        'status',
        'Status',
        ['planned', 'active', 'completed'].map((s) => ({ value: s, label: s })),
      ),
      select('assigneeId', 'Assigned to', options(members(p), 'Unassigned')),
      field('due', 'Due date', 'date'),
      field('notes', 'Scope & notes', 'textarea'),
    ],
    row
      ? { ...row, amountMinor: (row.amountMinor / 100).toFixed(2) }
      : { amountMinor: '0', due: '' },
  );
}
/** Same colour for every piece of one order, so split work is recognisable across columns. */
const orderHue = (number: number) => (number * 137 + 200) % 360;
function jobForm(p: PageProps, order: Project, job?: Job) {
  action(
    p,
    job
      ? `Edit job · Order ${orderNumber(p.data, order)}`
      : `Add job · Order ${orderNumber(p.data, order)}`,
    'job.save',
    [
      field('name', 'Job', 'text', true),
      select('assigneeId', 'Team member', options(members(p), 'Unassigned')),
      field('due', 'Due date', 'date'),
      field('notes', 'Instructions', 'textarea'),
    ],
    job
      ? {
          orderId: order.id,
          jobId: job.id,
          name: job.name,
          assigneeId: job.assigneeId,
          due: job.due,
          notes: job.notes,
        }
      : { orderId: order.id, due: order.due },
    job
      ? undefined
      : 'Splits the order into another piece. The team member only sees the pieces assigned to them.',
  );
}
function releaseForm(p: PageProps, order: Project) {
  const manager = can(p, 'work.assign');
  action(
    p,
    `Release order ${orderNumber(p.data, order)} into production`,
    'order.release',
    [
      select('basis', 'Release because', [
        { value: 'deposit', label: 'Deposit received' },
        ...(manager ? [{ value: 'manager', label: 'Manager approval without deposit' }] : []),
      ]),
      {
        ...field('reason', 'Reason', 'textarea'),
        hint: 'Required when releasing without a deposit.',
      },
    ],
    { id: order.id, basis: 'deposit', reason: '' },
    'A deposit must already be recorded in Money. Releasing never records a payment.',
  );
}
export function Work(p: PageProps) {
  const all = projects(p).filter((r) => match(r, p.search));
  const [selected, setSelected] = useState('');
  const selectedProject = all.find((j) => j.id === selected);
  const pieces = all.flatMap((order) => orderJobs(order).map((job) => ({ order, job })));
  const manageOrders = can(p, 'work.write');
  return (
    <>
      <PageTitle
        title={PRESETS[p.ws.preset].workLabel}
        description={
          can(p, 'work.read')
            ? 'Order / job cards by production stage. Cards with the same colour belong to the same order.'
            : 'Your pieces of each order, by production stage.'
        }
        action={
          manageOrders && (
            <Button icon="plus" onClick={() => projectForm(p)}>
              Create order
            </Button>
          )
        }
      />
      <div className="op-pipeline" aria-label="Production board">
        {PRODUCTION_STAGES.map((stage, index) => {
          const here = pieces.filter((x) => x.job.stage === stage);
          const next = PRODUCTION_STAGES[index + 1];
          return (
            <section className="op-stage" key={stage}>
              <header>
                <h2>{stage}</h2>
                <span>{here.length}</span>
              </header>
              {here.map(({ order, job }) => {
                const number = orderNumber(p.data, order);
                const total = orderJobs(order).length;
                const move = { orderId: order.id, jobId: job.id, stage: next };
                return (
                  <article
                    className="op-opportunity op-piece"
                    key={job.id}
                    style={{ '--piece-hue': orderHue(number) } as CSSProperties}
                  >
                    <span className="op-piece-marker">Order {number}</span>
                    <h3>
                      {order.title} / {job.name}
                    </h3>
                    <p>{job.assigneeId ? names(p, job.assigneeId) : 'Unassigned'}</p>
                    <small>
                      {job.due ? `Due ${job.due}` : 'No date'}
                      {total > 1 && ` · piece of ${total}`}
                    </small>
                    {order.release?.basis === 'manager' && can(p, 'work.read') && (
                      <Badge tone="attention">Released without deposit</Badge>
                    )}
                    <div className="op-row-actions">
                      {stage === 'Awaiting release' && manageOrders && !isReleased(order) && (
                        <button onClick={() => releaseForm(p, order)}>Release</button>
                      )}
                      {next && isReleased(order) && allowed(p, 'job.move', move) && (
                        <button
                          onClick={() =>
                            void p.run('job.move', move).catch((e) => p.notify(e.message))
                          }
                        >
                          Move to {next}
                        </button>
                      )}
                      {can(p, 'work.assign') && (
                        <>
                          <button onClick={() => jobForm(p, order, job)}>Edit job</button>
                          <button onClick={() => jobForm(p, order)}>Add job</button>
                        </>
                      )}
                    </div>
                  </article>
                );
              })}
              {!here.length && <p className="op-stage-empty">Nothing here.</p>}
            </section>
          );
        })}
      </div>
      {manageOrders && <h2 className="op-section-title">Orders</h2>}
      {manageOrders &&
        (all.length ? (
          <Table
            headings={[
              'Work',
              'Status',
              'Assigned / due',
              ...(can(p, 'prices.read') ? ['Agreed', 'Collected / due'] : []),
              'Actions',
            ]}
          >
            {all.map((j) => {
              const totals = projectMoney(p.data, j.id);
              return (
                <tr key={j.id}>
                  <td>
                    <button className="op-record-link" onClick={() => setSelected(j.id)}>
                      Order {orderNumber(p.data, j)} · {j.title}
                    </button>
                    <small>{j.contactId ? names(p, j.contactId) : 'Internal work'}</small>
                  </td>
                  <td>
                    <Badge
                      tone={j.status === 'completed' ? 'good' : j.status === 'active' ? 'info' : ''}
                    >
                      {isReleased(j) ? j.status : 'awaiting release'}
                    </Badge>
                  </td>
                  <td>
                    {names(p, j.assigneeId)}
                    <small>{j.due || 'No date'}</small>
                  </td>
                  {can(p, 'prices.read') && (
                    <>
                      <td>{money(p, j.amountMinor)}</td>
                      <td>
                        {money(p, totals.received)}
                        <small>{money(p, totals.due)} outstanding</small>
                      </td>
                    </>
                  )}
                  <td>
                    <div className="op-row-actions">
                      {can(p, 'work.write') && (
                        <button onClick={() => projectForm(p, j)}>Edit</button>
                      )}
                      <button onClick={() => setSelected(j.id)}>Details</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty title="No orders yet">
            Create an order directly, or from a won project in the pipeline.
          </Empty>
        ))}
      {selectedProject && (
        <Panel
          title={selectedProject.title}
          action={
            <button className="op-text-button" onClick={() => setSelected('')}>
              Close details
            </button>
          }
        >
          <p className="op-prose">{selectedProject.notes || 'No scope notes yet.'}</p>
          {can(p, 'money.read') &&
            (() => {
              const m = projectMoney(p.data, selectedProject.id);
              return (
                <>
                  <Stats
                    values={[
                      { label: 'Approved costs', value: money(p, m.cost) },
                      {
                        label: 'Submitted costs',
                        value: money(p, m.pendingCost),
                      },
                      {
                        label: 'Agreed value less approved costs',
                        value: money(p, m.margin),
                        detail: 'Recorded costs only; not accounting profit.',
                      },
                    ]}
                  />
                  <div className="op-list">
                    {posted(rows(p.data.expenses, p.ws))
                      .filter((e) => e.projectId === selectedProject.id)
                      .map((e) => (
                        <div key={e.id}>
                          <span>
                            {e.description}
                            <small>
                              {e.status} · {e.date}
                            </small>
                          </span>
                          <strong>{money(p, e.amountMinor)}</strong>
                        </div>
                      ))}
                  </div>
                </>
              );
            })()}
        </Panel>
      )}
    </>
  );
}
function expenseForm(p: PageProps) {
  const household = p.ws.preset === 'household';
  action(
    p,
    'Record expense',
    'expense.add',
    [
      field('description', 'Description', 'text', true),
      field('amountMinor', `Business / shared amount (${p.ws.currency})`, 'amount', true),
      field('date', 'Purchase date', 'date', true),
      select(
        'category',
        'Category',
        p.ws.categories.map((s) => ({ value: s, label: s })),
      ),
      select('payerId', 'Paid by', [
        { value: 'pool', label: household ? 'Shared funds' : 'Business funds' },
        ...options(members(p)),
      ]),
      ...(household
        ? [
            select('split', 'Split between active members', [
              { value: 'equal', label: 'Equal shares' },
              { value: 'weighted', label: 'Contribution weights' },
            ]),
          ]
        : [select('projectId', 'Related order', options(projects(p), 'General business expense'))]),
      field('receipt', 'Receipt (PNG, JPEG or PDF · max 3 MB)', 'file'),
      field(
        'reason',
        household ? 'Notes / receipt explanation' : 'Missing receipt reason',
        'textarea',
      ),
    ],
    undefined,
    household
      ? 'Only the shared portion belongs here. The split is fixed when saved; later weight changes affect future expenses.'
      : 'Record only the business portion. Submitted expenses remain separate from approved costs and reimbursements.',
  );
}
function paymentForm(p: PageProps, kind: Payment['kind']) {
  if (kind === 'reimbursement') {
    const eligible = posted(rows(p.data.expenses, p.ws)).filter(
      (e) => expenseRemaining(p.data, e) > 0,
    );
    p.form({
      title: 'Reimburse expenses',
      description:
        'Enter an amount against each expense. Use one payer per payment. Partial reimbursements reduce the amount owed without creating another expense.',
      fields: [
        select('toId', 'Person reimbursed', options(members(p))),
        field('date', 'Payment date', 'date', true),
        select(
          'method',
          'Payment method',
          ['transfer', 'cash', 'card', 'other'].map((s) => ({
            value: s,
            label: s,
          })),
        ),
        field('reference', 'Payment reference / confirmation', 'text', true),
        ...eligible.map((e) => ({
          ...field(
            'allocation_' + e.id,
            `${e.description} · ${names(p, e.payerId)} · ${money(p, expenseRemaining(p.data, e))} remaining`,
            'amount',
          ),
          wide: true,
        })),
      ],
      initial: Object.fromEntries(eligible.map((e) => ['allocation_' + e.id, '0'])),
      submit: (v, key) => {
        const allocations = eligible
          .map((e) => ({
            expenseId: e.id,
            amountMinor: Number(v['allocation_' + e.id]),
          }))
          .filter((a) => a.amountMinor > 0);
        return p.run(
          'payment.add',
          {
            kind,
            toId: v.toId,
            date: v.date,
            method: v.method,
            reference: v.reference,
            allocations,
            amountMinor: sum(allocations.map((a) => a.amountMinor)),
          },
          key,
        );
      },
    });
    return;
  }
  action(
    p,
    kind === 'receipt'
      ? 'Record customer collection'
      : kind === 'contribution'
        ? 'Record contribution'
        : 'Record household settlement',
    'payment.add',
    [
      field('amountMinor', `Amount (${p.ws.currency})`, 'amount', true),
      field('date', 'Payment date', 'date', true),
      ...(kind === 'receipt'
        ? [
            select(
              'fromId',
              'Customer',
              options(active(rows(p.data.contacts, p.ws)), 'No named customer'),
            ),
            select('projectId', 'Apply to work', options(projects(p), 'Unallocated income')),
          ]
        : [
            select('fromId', 'Paid by', [
              ...(kind === 'settlement' ? [{ value: 'pool', label: 'Shared funds' }] : []),
              ...options(members(p)),
            ]),
          ]),
      ...(kind === 'settlement'
        ? [
            select('toId', 'Paid to', [
              { value: 'pool', label: 'Shared funds' },
              ...options(members(p)),
            ]),
          ]
        : []),
      select(
        'method',
        'Payment method',
        ['transfer', 'cash', 'card', 'other'].map((s) => ({
          value: s,
          label: s,
        })),
      ),
      field('reference', 'Reference / payment confirmation', 'text', true),
    ],
    { kind },
    'Record a payment that has actually happened. This application does not move money.',
  );
}
export function Money(p: PageProps) {
  const [tab, setTab] = useState('expenses');
  const household = p.ws.preset === 'household';
  const expenses = rows(p.data.expenses, p.ws);
  const payments = rows(p.data.payments, p.ws);
  const approved = posted(expenses).filter((e) => e.status === 'approved');
  const submitted = posted(expenses).filter((e) => e.status === 'submitted');
  const balances = householdBalances(p.data, p.ws, today().slice(0, 7));
  const voidRecord = (collection: string, id: string) =>
    action(
      p,
      'Void financial record',
      'money.void',
      [field('reason', 'Reason for correction', 'textarea', true)],
      { collection, id },
      'The original remains in history. Linked reimbursements must be voided first.',
    );
  const exportCSV = () => {
    const csv = [
      ['Type', 'Date', 'Description / reference', 'Amount', 'Currency', 'Status'],
      ...expenses.map((e) => [
        'expense',
        e.date,
        e.description,
        (e.amountMinor / 100).toFixed(2),
        p.ws.currency,
        e.voidReason ? 'void' : e.status,
      ]),
      ...payments.map((r) => [
        r.kind,
        r.date,
        r.reference,
        (r.amountMinor / 100).toFixed(2),
        p.ws.currency,
        r.voidReason ? 'void' : 'recorded',
      ]),
    ]
      .map((r) => r.map(csvCell).join(','))
      .join('\r\n');
    download(`${p.ws.name}-money.csv`, csv, 'text/csv;charset=utf-8');
  };
  return (
    <>
      <PageTitle
        title={household ? 'Shared money' : 'Money'}
        description={
          household
            ? 'Shared costs, monthly contributions, settlements and each member’s balance.'
            : 'Expenses, review decisions, customer collections and reimbursements, kept separate.'
        }
        action={
          <div className="op-actions">
            {can(p, 'backup.export') && (
              <Button secondary icon="download" onClick={exportCSV}>
                Export CSV
              </Button>
            )}
            {can(p, 'money.submit') && (
              <Button icon="plus" onClick={() => expenseForm(p)}>
                Record expense
              </Button>
            )}
          </div>
        }
      />
      <Stats
        values={
          household
            ? [
                {
                  label: 'Shared expenses · all time',
                  value: money(p, sum(approved.map((e) => e.amountMinor))),
                },
                {
                  label: 'Shared funds balance',
                  value: money(p, poolBalance(expenses, payments)),
                },
                {
                  label: 'Monthly contribution target',
                  value: money(p, p.ws.monthlyBudgetMinor),
                },
              ]
            : [
                {
                  label: 'Approved costs · all time',
                  value: money(p, sum(approved.map((e) => e.amountMinor))),
                },
                {
                  label: 'Awaiting review',
                  value: money(p, sum(submitted.map((e) => e.amountMinor))),
                },
                {
                  label: 'Reimbursements outstanding',
                  value: money(p, sum(expenses.map((e) => expenseRemaining(p.data, e)))),
                },
                {
                  label: 'Customer collections',
                  value: money(
                    p,
                    sum(
                      posted(payments)
                        .filter((r) => r.kind === 'receipt')
                        .map((r) => r.amountMinor),
                    ),
                  ),
                },
              ]
        }
      />
      {household && (
        <Panel
          title="Contributions and balances"
          action={
            can(p, 'money.pay') && (
              <div className="op-row-actions">
                <button onClick={() => paymentForm(p, 'contribution')}>Record contribution</button>
                <button onClick={() => paymentForm(p, 'settlement')}>Settle a balance</button>
              </div>
            )
          }
        >
          <p className="op-caption">
            Monthly targets use member weights. Balances include all recorded spending,
            contributions and settlements; a positive balance is credit held for that member.
          </p>
          {balances.length ? (
            <Table
              headings={[
                'Member',
                'Monthly target',
                'Contributed this month',
                'Contribution still due',
                'Overall balance',
              ]}
            >
              {balances.map((b) => (
                <tr key={b.member.id}>
                  <td>
                    <strong>{b.member.name}</strong>
                    <small>
                      {b.member.archived ? 'Archived member' : `Weight ${b.member.weight}`}
                    </small>
                  </td>
                  <td>{money(p, b.target)}</td>
                  <td>{money(p, b.contributedThisMonth)}</td>
                  <td>{money(p, b.contributionDue)}</td>
                  <td>
                    <Badge tone={b.balance > 0 ? 'good' : b.balance < 0 ? 'attention' : 'plain'}>
                      {money(p, Math.abs(b.balance))}{' '}
                      {b.balance > 0 ? 'credit' : b.balance < 0 ? 'owes' : 'settled'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty
              title="No members yet"
              action={
                <Button secondary onClick={() => p.go('contacts')}>
                  Add members
                </Button>
              }
            >
              Then shared expenses can be divided fairly.
            </Empty>
          )}
        </Panel>
      )}
      <div className="op-tabs">
        <button className={tab === 'expenses' ? 'selected' : ''} onClick={() => setTab('expenses')}>
          Expenses ({expenses.length})
        </button>
        <button className={tab === 'payments' ? 'selected' : ''} onClick={() => setTab('payments')}>
          Payments ({payments.length})
        </button>
        {!household && can(p, 'money.pay') && (
          <div className="op-tabs-end">
            <Button secondary onClick={() => paymentForm(p, 'receipt')}>
              Record collection
            </Button>
            <Button secondary onClick={() => paymentForm(p, 'reimbursement')}>
              Reimburse
            </Button>
          </div>
        )}
      </div>
      {tab === 'expenses' ? (
        expenses.length ? (
          <Table headings={['Expense', 'Paid by / related work', 'Amount', 'State', 'Actions']}>
            {expenses
              .filter((e) => match(e, p.search))
              .slice()
              .reverse()
              .map((e) => (
                <tr key={e.id} className={e.voidReason ? 'op-void' : ''}>
                  <td>
                    <strong>{e.description}</strong>
                    <small>
                      {e.date} · {e.category}
                    </small>
                    {e.reason && <small className="op-truncate">{e.reason}</small>}
                  </td>
                  <td>
                    {names(p, e.payerId)}
                    <small>{p.data.projects.find((j) => j.id === e.projectId)?.title}</small>
                  </td>
                  <td>
                    {money(p, e.amountMinor)}
                    {!household && expenseRemaining(p.data, e) > 0 && (
                      <small>{money(p, expenseRemaining(p.data, e))} owed</small>
                    )}
                  </td>
                  <td>
                    <Badge
                      tone={
                        e.voidReason
                          ? 'plain'
                          : e.status === 'approved'
                            ? 'good'
                            : e.status === 'rejected'
                              ? 'danger'
                              : 'attention'
                      }
                    >
                      {e.voidReason
                        ? 'void'
                        : e.status === 'submitted'
                          ? 'Awaiting review'
                          : e.status}
                    </Badge>
                  </td>
                  <td>
                    <div className="op-row-actions">
                      {e.receipt && (
                        <button
                          onClick={() => {
                            const bytes = Uint8Array.from(atob(e.receipt!.base64), (c) =>
                              c.charCodeAt(0),
                            );
                            download(e.receipt!.name, new Blob([bytes], { type: e.receipt!.mime }));
                          }}
                        >
                          Receipt
                        </button>
                      )}
                      {!e.voidReason && e.status === 'submitted' && can(p, 'money.review') && (
                        <>
                          <button
                            onClick={() =>
                              action(
                                p,
                                'Review expense',
                                'expense.review',
                                [
                                  select('status', 'Decision', [
                                    { value: 'approved', label: 'Approve' },
                                    { value: 'rejected', label: 'Reject' },
                                  ]),
                                  field('reason', 'Review reason', 'textarea'),
                                ],
                                { id: e.id },
                                'Approval records an accepted expense; it does not record reimbursement or payment.',
                              )
                            }
                          >
                            Review
                          </button>
                        </>
                      )}
                      {!e.voidReason && can(p, 'money.pay') && (
                        <button onClick={() => voidRecord('expenses', e.id)}>Void</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </Table>
        ) : (
          <Empty title="No expenses yet">
            Record who paid, what for, and attach the receipt or a reason it is missing.
          </Empty>
        )
      ) : payments.length ? (
        <Table headings={['Payment', 'From → to', 'Amount', 'Reference', 'Actions']}>
          {payments
            .filter((r) => match(r, p.search))
            .slice()
            .reverse()
            .map((r) => (
              <tr key={r.id} className={r.voidReason ? 'op-void' : ''}>
                <td>
                  <Badge tone="plain">{r.voidReason ? 'void' : r.kind}</Badge>
                  <small>
                    {r.date} · {r.method}
                  </small>
                </td>
                <td>
                  {r.fromId ? names(p, r.fromId) : 'Customer'} → {names(p, r.toId)}
                </td>
                <td>{money(p, r.amountMinor)}</td>
                <td>{r.reference}</td>
                <td>
                  {!r.voidReason && can(p, 'money.pay') && (
                    <button className="op-text-button" onClick={() => voidRecord('payments', r.id)}>
                      Void
                    </button>
                  )}
                </td>
              </tr>
            ))}
        </Table>
      ) : (
        <Empty title="No payments recorded">
          Record contributions, collections or reimbursements after the money has actually moved.
        </Empty>
      )}
    </>
  );
}
function taskForm(p: PageProps, row?: Task) {
  action(
    p,
    row ? 'Edit task' : 'Add task',
    'task.save',
    [
      field('title', 'Task / chore', 'text', true),
      select('assigneeId', 'Responsible person', options(members(p), 'Unassigned')),
      field('due', 'Due date', 'date'),
      select(
        'recurrence',
        'Repeat after completion',
        ['none', 'daily', 'weekly', 'monthly'].map((s) => ({
          value: s,
          label: s,
        })),
      ),
      ...(p.ws.modules.includes('work')
        ? [select('projectId', 'Related order', options(projects(p), 'No linked order'))]
        : []),
      field('notes', 'Details', 'textarea'),
    ],
    row ? { ...row } : { due: '' },
  );
}
export function Tasks(p: PageProps) {
  const tasks = active(rows(p.data.tasks, p.ws)).filter((t) => match(t, p.search));
  return (
    <>
      <PageTitle
        title={p.ws.preset === 'household' ? 'Chores' : 'Tasks'}
        description="Who does what, by when. Recurring tasks create the next one when completed."
        action={
          can(p, 'chores.write') && (
            <Button icon="plus" onClick={() => taskForm(p)}>
              Add task
            </Button>
          )
        }
      />
      {tasks.length ? (
        <Table headings={['Task', 'Responsible', 'Due / repeat', 'Actions']}>
          {tasks
            .slice()
            .sort((a, b) => Number(a.done) - Number(b.done) || a.due.localeCompare(b.due))
            .map((t) => (
              <tr key={t.id} className={t.done ? 'op-done' : ''}>
                <td>
                  <strong>{t.title}</strong>
                  <small>{t.notes}</small>
                  {t.done && <Badge tone="good">Completed</Badge>}
                </td>
                <td>{names(p, t.assigneeId)}</td>
                <td>
                  {t.due || 'No date'}
                  <small>{t.recurrence === 'none' ? 'One time' : t.recurrence}</small>
                </td>
                <td>
                  {can(p, 'chores.write') && (
                    <div className="op-row-actions">
                      {!t.done && allowed(p, 'task.complete', { id: t.id }) && (
                        <button
                          onClick={() =>
                            void p
                              .run('task.complete', { id: t.id })
                              .catch((e) => p.notify(e.message))
                          }
                        >
                          Complete
                        </button>
                      )}
                      <button onClick={() => taskForm(p, t)}>Edit</button>
                      <button onClick={() => archive(p, 'tasks', t.id)}>Archive</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
        </Table>
      ) : (
        <Empty title="No tasks yet">
          Add a task, assign a person and set a date. Chores can repeat daily, weekly or monthly.
        </Empty>
      )}
    </>
  );
}
function referralForm(p: PageProps, row?: Referral) {
  action(
    p,
    row ? 'Edit referral' : 'Track a referral',
    'referral.save',
    [
      select(
        'candidateId',
        'Candidate',
        options(active(rows(p.data.contacts, p.ws)).filter((c) => c.kind === 'candidate')),
      ),
      field('role', 'Job / role', 'text', true),
      field('company', 'Hiring company', 'text', true),
      field('url', 'Job posting link', 'url'),
      field('recipient', 'Hiring contact email', 'email'),
      select(
        'stage',
        'Stage',
        p.ws.referralStages.map((s) => ({ value: s, label: s })),
      ),
      field('due', 'Next follow-up', 'date'),
      field('rewardMinor', `Potential referral reward (${p.ws.currency})`, 'amount'),
      field('notes', 'Referral notes', 'textarea'),
    ],
    row
      ? { ...row, rewardMinor: (row.rewardMinor / 100).toFixed(2) }
      : { rewardMinor: '0', due: '' },
  );
}
function templateForm(p: PageProps, row?: MessageTemplate) {
  action(
    p,
    row ? 'Edit template' : 'New message template',
    'template.save',
    [
      field('name', 'Template name', 'text', true),
      { ...field('subject', 'Subject', 'text', true), wide: true },
      field('body', 'Message', 'textarea', true),
    ],
    row ? { ...row } : undefined,
    'Available fields: {{candidateName}}, {{candidateEmail}}, {{candidateUrl}}, {{candidateNotes}}, {{role}}, {{company}}, {{jobUrl}}, {{notes}}.',
  );
}
async function copy(value: string, p: PageProps) {
  try {
    await navigator.clipboard.writeText(value);
    p.notify('Copied to clipboard.');
  } catch {
    p.notify('Clipboard access was unavailable. Use Export draft to save a copy.');
  }
}
export function Referrals(p: PageProps) {
  const draftKey = useRef<string>(crypto.randomUUID());
  const [tab, setTab] = useState('referrals');
  const [composer, setComposer] = useState<Partial<Draft> | null>(null);
  const [draftError, setDraftError] = useState('');
  const [draftBusy, setDraftBusy] = useState(false);
  const referrals = active(rows(p.data.referrals, p.ws));
  const templates = active(rows(p.data.templates, p.ws));
  const drafts = active(rows(p.data.drafts, p.ws));
  const compose = (r: Referral, template?: MessageTemplate) => {
    draftKey.current = crypto.randomUUID();
    const candidate = p.data.contacts.find((c) => c.id === r.candidateId)!;
    const values = {
      candidateName: candidate.name,
      candidateEmail: candidate.email,
      candidateUrl: candidate.url,
      candidateNotes: candidate.notes,
      role: r.role,
      company: r.company,
      jobUrl: r.url,
      notes: r.notes,
    };
    setDraftError('');
    setComposer({
      referralId: r.id,
      to: r.recipient,
      subject: renderMessage(
        template?.subject ?? '{{candidateName}} — {{role}} at {{company}}',
        values,
      ),
      body: renderMessage(
        template?.body ??
          'Candidate: {{candidateName}}\nEmail: {{candidateEmail}}\nProfile: {{candidateUrl}}\n\n{{candidateNotes}}\n\nRole: {{role}}\nCompany: {{company}}\nOpening: {{jobUrl}}\n\n{{notes}}',
        values,
      ),
    });
  };
  const saveDraft = async () => {
    setDraftBusy(true);
    setDraftError('');
    try {
      await p.run('draft.save', composer as Record<string, unknown>, draftKey.current);
      setComposer(null);
    } catch (e) {
      setDraftError((e as Error).message);
    } finally {
      setDraftBusy(false);
    }
  };
  return (
    <>
      <PageTitle
        title="Referrals"
        description="Candidates, openings and follow-ups. Drafts are copied or exported; nothing is sent from here."
        action={
          <div className="op-actions">
            {can(p, 'contacts.write') && (
              <Button secondary onClick={() => contactForm(p, undefined, 'candidate')}>
                Add candidate
              </Button>
            )}
            {can(p, 'referrals.write') && (
              <Button icon="plus" onClick={() => referralForm(p)}>
                Track referral
              </Button>
            )}
          </div>
        }
      />
      <Stats
        values={[
          { label: 'Tracked referrals', value: referrals.length },
          {
            label: 'Follow-ups due',
            value: referrals.filter(
              (r) => r.due && r.due <= today() && !['Hired', 'Not selected'].includes(r.stage),
            ).length,
          },
          { label: 'Saved drafts', value: drafts.length },
        ]}
      />
      {composer && (
        <section className="op-composer" aria-label="Email draft">
          <div className="op-panel-heading">
            <h2>Email draft</h2>
            <button
              className="op-icon-button"
              aria-label="Close composer"
              onClick={() => setComposer(null)}
            >
              <Icon name="close" />
            </button>
          </div>
          <p className="op-caption">
            Draft only. Nothing is sent by Business Suite. Review candidate details before sharing.
          </p>
          <div className="op-form-grid">
            <label>
              To
              <input
                type="email"
                value={composer.to ?? ''}
                onChange={(e) => setComposer({ ...composer, to: e.target.value })}
              />
            </label>
            <label>
              Use template
              <select
                value=""
                onChange={(e) => {
                  const r = referrals.find((r) => r.id === composer.referralId);
                  if (r)
                    compose(
                      r,
                      templates.find((t) => t.id === e.target.value),
                    );
                }}
              >
                <option value="">Choose a template…</option>
                {templates.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="wide">
              Subject
              <input
                value={composer.subject ?? ''}
                onChange={(e) => setComposer({ ...composer, subject: e.target.value })}
              />
            </label>
            <label className="wide">
              Message
              <textarea
                rows={12}
                value={composer.body ?? ''}
                onChange={(e) => setComposer({ ...composer, body: e.target.value })}
              />
            </label>
          </div>
          {draftError && (
            <p role="alert" className="op-error">
              {draftError}
            </p>
          )}
          <div className="op-form-actions">
            <Button
              onClick={() => void saveDraft()}
              disabled={draftBusy || !can(p, 'referrals.write')}
            >
              {draftBusy ? 'Saving…' : 'Save draft'}
            </Button>
            <Button secondary onClick={() => void copy(composer.body ?? '', p)}>
              Copy message
            </Button>
            <Button
              secondary
              onClick={() =>
                void copy(`To: ${composer.to}\nSubject: ${composer.subject}\n\n${composer.body}`, p)
              }
            >
              Copy all
            </Button>
            <Button
              secondary
              icon="download"
              onClick={() =>
                download(
                  'referral-draft.eml',
                  eml(composer.to ?? '', composer.subject ?? '', composer.body ?? ''),
                  'message/rfc822',
                )
              }
            >
              Export draft
            </Button>
            <a
              className="op-button secondary"
              href={`mailto:${encodeURIComponent(composer.to ?? '')}?subject=${encodeURIComponent(composer.subject ?? '')}&body=${encodeURIComponent(composer.body ?? '')}`}
            >
              Open email app
            </a>
          </div>
        </section>
      )}
      <div className="op-tabs">
        {['referrals', 'templates', 'drafts'].map((t) => (
          <button key={t} className={tab === t ? 'selected' : ''} onClick={() => setTab(t)}>
            {t[0]!.toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      {tab === 'referrals' ? (
        referrals.length ? (
          <Table headings={['Candidate / opening', 'Stage', 'Follow-up', 'Actions']}>
            {referrals
              .filter((r) => match(r, p.search) || match(names(p, r.candidateId), p.search))
              .map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{names(p, r.candidateId)}</strong>
                    <small>
                      {r.role} · {r.company}
                    </small>
                    {r.url && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="op-small-link"
                      >
                        View job posting
                      </a>
                    )}
                  </td>
                  <td>
                    <Badge
                      tone={
                        r.stage === 'Hired' ? 'good' : r.stage === 'Not selected' ? 'plain' : 'info'
                      }
                    >
                      {r.stage}
                    </Badge>
                  </td>
                  <td>{r.due || 'No date'}</td>
                  <td>
                    <div className="op-row-actions">
                      {can(p, 'referrals.write') && (
                        <>
                          <button onClick={() => referralForm(p, r)}>Edit / stage</button>
                          <button onClick={() => compose(r, templates[0])}>Compose</button>
                        </>
                      )}
                      <button
                        onClick={() => {
                          compose(r);
                        }}
                      >
                        View / copy details
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </Table>
        ) : (
          <Empty title="No referrals yet">
            Add a candidate in People, then link them to an opening and set the next follow-up.
          </Empty>
        )
      ) : tab === 'templates' ? (
        <Panel
          title="Templates"
          action={
            can(p, 'referrals.write') && (
              <Button secondary onClick={() => templateForm(p)}>
                New template
              </Button>
            )
          }
        >
          {templates.length ? (
            <div className="op-list">
              {templates.map((t) => (
                <div key={t.id}>
                  <span>
                    <strong>{t.name}</strong>
                    <small>{t.subject}</small>
                  </span>
                  {can(p, 'referrals.write') && (
                    <button className="op-text-button" onClick={() => templateForm(p, t)}>
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No templates yet">
              Save introductions and follow-ups; candidate and opening fields fill in automatically.
            </Empty>
          )}
        </Panel>
      ) : drafts.length ? (
        <Table headings={['Subject', 'Recipient', 'Updated', 'Actions']}>
          {drafts.map((d) => (
            <tr key={d.id}>
              <td>
                <strong>{d.subject}</strong>
                <small>Draft · not sent</small>
              </td>
              <td>{d.to || 'Not set'}</td>
              <td>{d.updatedAt.slice(0, 10)}</td>
              <td>
                <button
                  className="op-text-button"
                  onClick={() => {
                    draftKey.current = crypto.randomUUID();
                    setComposer(d);
                  }}
                >
                  Open draft
                </button>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="No drafts yet">Compose a message from a referral and save it here.</Empty>
      )}
    </>
  );
}
export function Overview(p: PageProps) {
  const deals = active(rows(p.data.deals, p.ws));
  const tasks = active(rows(p.data.tasks, p.ws)).filter((t) => !t.done);
  const expenseReview = posted(rows(p.data.expenses, p.ws)).filter((e) => e.status === 'submitted');
  const jobTotals = projects(p).map((j) => projectMoney(p.data, j.id));
  const referrals = active(rows(p.data.referrals, p.ws));
  const household = p.ws.preset === 'household';
  return (
    <>
      <PageTitle
        title={p.ws.name}
        description={
          household
            ? 'Shared costs, contributions and open chores.'
            : p.ws.preset === 'referrals'
              ? 'Active referrals and the follow-ups due.'
              : 'Open projects, orders in production, balances due and expenses to review.'
        }
      />
      <Notifications {...p} />
      <Stats
        values={
          household
            ? [
                { label: 'Members', value: members(p).length },
                {
                  label: 'Monthly shared budget',
                  value: money(p, p.ws.monthlyBudgetMinor),
                },
                { label: 'Open chores', value: tasks.length },
              ]
            : p.ws.preset === 'referrals'
              ? [
                  {
                    label: 'Active referrals',
                    value: referrals.filter((r) => !['Hired', 'Not selected'].includes(r.stage))
                      .length,
                  },
                  {
                    label: 'Candidates',
                    value: active(rows(p.data.contacts, p.ws)).filter((c) => c.kind === 'candidate')
                      .length,
                  },
                  {
                    label: 'Follow-ups due',
                    value: referrals.filter((r) => r.due && r.due <= today()).length,
                  },
                ]
              : [
                  {
                    label: 'Open projects',
                    value: deals.filter(
                      (d) => p.ws.stages.find((s) => s.id === d.stageId)?.outcome === 'open',
                    ).length,
                  },
                  {
                    label: 'Orders in production',
                    value: projects(p).filter((j) => isReleased(j) && j.status !== 'completed')
                      .length,
                  },
                  {
                    label: 'Customer balances due',
                    value: can(p, 'money.read')
                      ? money(p, sum(jobTotals.map((j) => j.due)))
                      : 'Restricted',
                  },
                  { label: 'Expenses to review', value: expenseReview.length },
                ]
        }
      />
      <div className="op-overview-grid">
        <Panel
          title="Needs attention"
          action={
            <button
              className="op-text-button"
              onClick={() => p.go(p.ws.preset === 'referrals' ? 'referrals' : 'chores')}
            >
              View all <Icon name="arrow" size={15} />
            </button>
          }
        >
          <div className="op-list">
            {tasks.slice(0, 5).map((t) => (
              <div key={t.id}>
                <span>
                  <strong>{t.title}</strong>
                  <small>
                    {names(p, t.assigneeId)} · {t.due || 'No due date'}
                  </small>
                </span>
                <Badge tone={t.due && t.due < today() ? 'danger' : 'plain'}>
                  {t.due && t.due < today() ? 'Overdue' : 'Open'}
                </Badge>
              </div>
            ))}
            {p.ws.preset === 'referrals' &&
              referrals.slice(0, 5).map((r) => (
                <div key={r.id}>
                  <span>
                    <strong>{names(p, r.candidateId)}</strong>
                    <small>
                      {r.role} · {r.company}
                    </small>
                  </span>
                  <Badge tone="plain">{r.stage}</Badge>
                </div>
              ))}
            {!tasks.length && p.ws.preset !== 'referrals' && (
              <Empty title="Nothing waiting">Open tasks and overdue items appear here.</Empty>
            )}
          </div>
        </Panel>
        <section className="op-quick" aria-label="Quick actions">
          <h2>Quick actions</h2>
          <div>
            {p.ws.modules.includes('crm') && can(p, 'crm.write') && (
              <Button
                secondary
                onClick={() => {
                  p.go('crm');
                  dealForm(p);
                }}
              >
                New project <Icon name="chevron" size={16} />
              </Button>
            )}
            {p.ws.modules.includes('money') && can(p, 'money.submit') && (
              <Button
                secondary
                onClick={() => {
                  p.go('money');
                  expenseForm(p);
                }}
              >
                Record expense <Icon name="chevron" size={16} />
              </Button>
            )}
            {p.ws.modules.includes('referrals') && can(p, 'referrals.write') && (
              <Button
                secondary
                onClick={() => {
                  p.go('referrals');
                  referralForm(p);
                }}
              >
                Track referral <Icon name="chevron" size={16} />
              </Button>
            )}
            {p.ws.modules.includes('chores') && can(p, 'chores.write') && (
              <Button
                secondary
                onClick={() => {
                  p.go('chores');
                  taskForm(p);
                }}
              >
                Add task <Icon name="chevron" size={16} />
              </Button>
            )}
          </div>
        </section>
      </div>
      {household && (
        <Panel
          title="Balances"
          action={
            <button className="op-text-button" onClick={() => p.go('money')}>
              View shared money
            </button>
          }
        >
          <div className="op-list">
            {householdBalances(p.data, p.ws, today().slice(0, 7)).map((b) => (
              <div key={b.member.id}>
                <span>
                  <strong>{b.member.name}</strong>
                  <small>
                    {money(p, b.contributedThisMonth)} contributed this month · target{' '}
                    {money(p, b.target)}
                  </small>
                </span>
                <strong>
                  {money(p, Math.abs(b.balance))} {b.balance < 0 ? 'owed' : 'credit'}
                </strong>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
export function Activity(p: PageProps) {
  const events = rows(p.data.audit, p.ws)
    .filter((e) => match(e, p.search))
    .slice()
    .reverse();
  return (
    <>
      <PageTitle
        title="Activity"
        description="Every change in this workspace. Financial corrections keep the original record."
      />
      {events.length ? (
        <Table headings={['When', 'Action', 'Record']}>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.at).toLocaleString()}</td>
              <td>
                <strong>{e.summary}</strong>
                <small>{e.action}</small>
              </td>
              <td>
                <code>{e.recordId.slice(0, 12)}</code>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty title="No visible activity">
          Your role may not include access to workspace history.
        </Empty>
      )}
    </>
  );
}
