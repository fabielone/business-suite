import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  active,
  ALLOWED,
  PRODUCTION_STAGES,
  subjectLabel,
  triggerSubject,
  type Automation,
  type AutomationAction,
  type AutomationCondition,
  type AutomationRun,
  type AutomationTrigger,
} from '@suite/core/operations';
import { Badge, Button, Empty, Icon, PageTitle, Panel, Table } from './components';
import type { PageProps } from './pages';

type Draft = Pick<
  Automation,
  'name' | 'enabled' | 'trigger' | 'conditions' | 'wait' | 'actions'
> & {
  id?: string;
};
const TRIGGER_LABELS: Record<AutomationTrigger['type'], string> = {
  'deal.stage': 'A project moves to a stage',
  'job.stage': 'A job moves to a production stage',
  'task.completed': 'A task is completed',
  'order.tasks.done': 'All tasks of an order are done',
  'date.reached': 'A date is reached',
  'deal.inactive': 'A project has no activity',
  'contact.created': 'A person or company is added',
};
const CONTACT_LABELS = {
  customer: 'customer',
  supplier: 'supplier',
  member: 'team member',
  candidate: 'candidate',
  employer: 'employer',
} as const;
const CONDITION_LABELS: Record<AutomationCondition['type'], string> = {
  'no.activity': 'Nobody worked on it during the wait',
  'deal.stage.is': 'The project is still at a stage',
  'job.stage.is': 'A job is at a production stage',
  'job.unassigned': 'The job has no assignee',
};
const ACTION_LABELS: Record<AutomationAction['type'], string> = {
  'task.create': 'Create a task',
  'tasks.create': 'Create several tasks',
  'tasks.update': 'Complete or reassign tasks',
  'job.assign': 'Assign the job',
  notify: 'Notify someone',
  'stage.move': 'Move to a stage',
  'note.add': 'Add an activity note',
};
const DATE_LABELS = {
  'deal.due': 'Project follow-up date',
  'job.due': 'Job due date',
  'task.due': 'Task due date',
} as const;
const STATUS_TONES: Record<AutomationRun['status'], string> = {
  waiting: 'attention',
  done: 'good',
  skipped: 'plain',
  failed: 'danger',
  cancelled: 'plain',
};
const newTrigger = (type: AutomationTrigger['type'], p: PageProps): AutomationTrigger => {
  switch (type) {
    case 'deal.stage':
      return { type, stageId: p.ws.stages[0]?.id ?? '' };
    case 'job.stage':
      return { type, stage: 'Design' };
    case 'date.reached':
      return { type, field: 'deal.due', offsetDays: 0 };
    case 'deal.inactive':
      return { type, days: 14 };
    case 'contact.created':
      return { type, kind: '' };
    default:
      return { type };
  }
};
const newCondition = (type: AutomationCondition['type'], p: PageProps): AutomationCondition =>
  type === 'deal.stage.is'
    ? { type, stageId: p.ws.stages[0]?.id ?? '' }
    : type === 'job.stage.is'
      ? { type, stage: 'Design' }
      : { type };
const newAction = (type: AutomationAction['type'], subject: string): AutomationAction => {
  switch (type) {
    case 'task.create':
      return {
        type,
        title: 'Follow up: {record}',
        memberId: '',
        dueInDays: 0,
        notes: '',
        recurrence: 'none',
        link: 'record',
      };
    case 'tasks.create':
      return {
        type,
        items: [
          { title: '', memberId: '', dueInDays: 0 },
          { title: '', memberId: '', dueInDays: 1 },
        ],
        link: 'record',
      };
    case 'tasks.update':
      return { type, change: 'complete', memberId: '', titleContains: '' };
    case 'job.assign':
      return { type, memberId: '' };
    case 'notify':
      return {
        type,
        memberId: subject === 'deal' || subject === 'order' ? '' : 'assignee',
        message: '{record}',
      };
    case 'stage.move':
      return { type, stage: '' };
    case 'note.add':
      return { type, text: '' };
  }
};
const blank = (p: PageProps): Draft => ({
  name: '',
  enabled: true,
  trigger: newTrigger('deal.stage', p),
  conditions: [],
  wait: { amount: 0, unit: 'days' },
  actions: [newAction('task.create', 'deal')],
});

function namers(p: PageProps) {
  const stage = (id: string) => p.ws.stages.find((s) => s.id === id)?.name ?? id;
  const person = (id: string) =>
    id === 'assignee'
      ? 'its assignee'
      : id
        ? (p.data.contacts.find((c) => c.id === id)?.name ?? 'a removed member')
        : 'nobody';
  return { stage, person };
}
/** One readable sentence per rule, so the list explains itself. */
function describe(p: PageProps, rule: Draft) {
  const { stage, person } = namers(p);
  const t = rule.trigger;
  const when =
    t.type === 'deal.stage'
      ? `a project moves to ${stage(t.stageId)}`
      : t.type === 'job.stage'
        ? `a job moves to ${t.stage}`
        : t.type === 'date.reached'
          ? `${t.offsetDays ? `${Math.abs(t.offsetDays)} day(s) ${t.offsetDays < 0 ? 'before' : 'after'} ` : ''}the ${DATE_LABELS[t.field].toLowerCase()}`
          : t.type === 'deal.inactive'
            ? `a project has had no activity for ${t.days} day(s)`
            : t.type === 'contact.created'
              ? `a ${t.kind ? CONTACT_LABELS[t.kind] : 'person or company'} is added`
              : TRIGGER_LABELS[t.type].toLowerCase();
  const wait = rule.wait.amount ? `${rule.wait.amount} ${rule.wait.unit}` : '';
  const conditions = rule.conditions.map((c) =>
    c.type === 'deal.stage.is'
      ? `it is still at ${stage(c.stageId)}`
      : c.type === 'job.stage.is'
        ? `a job is at ${c.stage}`
        : c.type === 'no.activity'
          ? 'nobody worked on it'
          : 'the job has no assignee',
  );
  const actions = rule.actions.map((a) =>
    a.type === 'task.create'
      ? `create “${a.title}” for ${person(a.memberId)}`
      : a.type === 'tasks.create'
        ? `create ${a.items.length} tasks (${a.items.map((t) => `“${t.title}”`).join(', ')})`
        : a.type === 'tasks.update'
          ? `${a.change === 'complete' ? 'complete' : `reassign to ${person(a.memberId)}`} the open tasks${a.titleContains ? ` containing “${a.titleContains}”` : ''}`
          : a.type === 'job.assign'
            ? `assign the job to ${person(a.memberId)}`
            : a.type === 'notify'
              ? `notify ${person(a.memberId)}`
              : a.type === 'stage.move'
                ? `move to ${triggerSubject(rule.trigger) === 'deal' ? stage(a.stage) : a.stage}`
                : 'add a note',
  );
  return { when, wait, conditions, actions };
}

export function Automations(
  p: PageProps & { example: boolean; fastForward: (until: string) => Promise<void> },
) {
  const [editing, setEditing] = useState<Draft | null>(null);
  const ws = (r: { workspaceId: string }) => r.workspaceId === p.ws.id;
  const rules = active(p.data.automations.filter(ws));
  const runs = p.data.automationRuns.filter(ws);
  const name = (id: string) => p.data.automations.find((a) => a.id === id)?.name ?? 'Removed';
  const waiting = runs
    .filter((r) => r.status === 'waiting')
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const history = runs
    .filter((r) => r.status !== 'waiting')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 40);
  const shown = rules.filter((r) =>
    JSON.stringify(r).toLowerCase().includes(p.search.toLowerCase()),
  );
  const toggle = (rule: Automation) =>
    void p
      .run('automation.enable', { id: rule.id, enabled: !rule.enabled })
      .catch((e) => p.notify(e.message));
  return (
    <>
      <PageTitle
        title="Automations"
        description="When something happens, optionally wait and check, then act. Automations never record payments, approve expenses, change prices, or create or release orders."
        action={
          <Button icon="plus" onClick={() => setEditing(blank(p))}>
            Add automation
          </Button>
        }
      />
      {shown.length ? (
        <div className="op-automation-list">
          {shown.map((rule) => {
            const s = describe(p, rule);
            const last = runs
              .filter((r) => r.automationId === rule.id && r.status !== 'waiting')
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
            return (
              <article
                key={rule.id}
                className={rule.enabled ? 'op-automation' : 'op-automation off'}
              >
                <header>
                  <h2>{rule.name}</h2>
                  <label className="op-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={`${rule.name} is ${rule.enabled ? 'on' : 'off'}`}
                      checked={rule.enabled}
                      onChange={() => toggle(rule)}
                    />
                    <span>{rule.enabled ? 'On' : 'Off'}</span>
                  </label>
                </header>
                <ol className="op-automation-steps">
                  <li>
                    <b>When</b>
                    <span>{s.when}</span>
                  </li>
                  {s.wait && (
                    <li>
                      <b>Wait</b>
                      <span>{s.wait}</span>
                    </li>
                  )}
                  {s.conditions.length > 0 && (
                    <li>
                      <b>If</b>
                      <span>{s.conditions.join(' and ')}</span>
                    </li>
                  )}
                  <li>
                    <b>Then</b>
                    <span>{s.actions.join(', then ')}</span>
                  </li>
                </ol>
                <footer>
                  <small>
                    {last
                      ? `Last run ${new Date(last.updatedAt).toLocaleString()}: ${last.status}`
                      : 'Has not run yet'}
                  </small>
                  <div className="op-row-actions">
                    <button onClick={() => setEditing(structuredClone(rule))}>Edit</button>
                    <button
                      onClick={() =>
                        p.form({
                          title: 'Archive automation',
                          description:
                            'It stops running and its waiting runs are cancelled. Its history stays in the log.',
                          fields: [],
                          submitLabel: 'Archive automation',
                          submit: (_v, key) =>
                            p.run(
                              'record.archive',
                              { collection: 'automations', id: rule.id },
                              key,
                            ),
                        })
                      }
                    >
                      Archive
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          title={rules.length ? 'No matching automations' : 'No automations yet'}
          action={
            !rules.length && (
              <Button icon="plus" onClick={() => setEditing(blank(p))}>
                Add automation
              </Button>
            )
          }
        >
          For example: when a quote is sent, wait 3 days, then if nobody followed up, create a task.
        </Empty>
      )}
      <Panel
        title={`Waiting (${waiting.length})`}
        action={
          p.example &&
          waiting.length > 0 && (
            <Button
              secondary
              icon="arrow"
              onClick={() =>
                void p.fastForward(waiting[0]!.dueAt).catch((e) => p.notify(e.message))
              }
            >
              Example only: skip the next wait
            </Button>
          )
        }
      >
        {waiting.length ? (
          <div className="op-list">
            {waiting.map((r) => (
              <div key={r.id}>
                <span>
                  <strong>{name(r.automationId)}</strong>
                  <small>{subjectLabel(p.data, r.subject)}</small>
                </span>
                <small>Checks {new Date(r.dueAt).toLocaleString()}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="op-caption">
            Nothing is waiting. Rules with a wait show their pending checks here.
          </p>
        )}
      </Panel>
      <Panel title="Recent runs">
        {history.length ? (
          <Table headings={['When', 'Automation', 'Record', 'Result']}>
            {history.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.updatedAt).toLocaleString()}</td>
                <td>
                  <strong>{name(r.automationId)}</strong>
                </td>
                <td>{subjectLabel(p.data, r.subject)}</td>
                <td>
                  <Badge tone={STATUS_TONES[r.status]}>{r.status}</Badge>
                  <small>{r.outcome}</small>
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="op-caption">
            Runs appear here with what each automation did or why it skipped.
          </p>
        )}
      </Panel>
      {editing && <AutomationEditor p={p} initial={editing} close={() => setEditing(null)} />}
    </>
  );
}

function AutomationEditor({
  p,
  initial,
  close,
}: {
  p: PageProps;
  initial: Draft;
  close: () => void;
}) {
  const key = useRef(crypto.randomUUID());
  const id = useId();
  const [draft, setDraft] = useState<Draft>(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const kind = triggerSubject(draft.trigger);
  const allowed = ALLOWED[kind];
  const members = active(p.data.contacts.filter((c) => c.workspaceId === p.ws.id)).filter(
    (c) => c.kind === 'member',
  );
  const hasAssignee = kind === 'job' || kind === 'task';
  const people = (none: string | null) => [
    ...(none === null ? [] : [{ value: '', label: none }]),
    ...(hasAssignee ? [{ value: 'assignee', label: 'Its assignee' }] : []),
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ];
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setTrigger = (trigger: AutomationTrigger) =>
    setDraft((d) => {
      const next = triggerSubject(trigger);
      // Keep the steps that still apply; drop the rest so the rule stays valid.
      return {
        ...d,
        trigger,
        conditions: d.conditions.filter((c) => ALLOWED[next].conditions.includes(c.type)),
        actions: d.actions
          .filter((a) => ALLOWED[next].actions.includes(a.type))
          .map((a) => (a.type === 'stage.move' && next !== kind ? { ...a, stage: '' } : a)),
      };
    });
  const setAction = (i: number, action: AutomationAction) =>
    set({ actions: draft.actions.map((a, j) => (i === j ? action : a)) });
  const stageOptions =
    kind === 'deal'
      ? p.ws.stages.filter((s) => s.outcome === 'open').map((s) => ({ value: s.id, label: s.name }))
      : PRODUCTION_STAGES.filter((s) => s !== 'Awaiting release').map((s) => ({
          value: s,
          label: s,
        }));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) close();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [busy, close]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await p.run('automation.save', { ...draft }, key.current);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Your entries are preserved.');
    } finally {
      setBusy(false);
    }
  }
  const s = describe(p, draft);
  const t = draft.trigger;
  return (
    <div
      className="op-dialog-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <section
        className="op-editor wide-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby={id + 'title'}
      >
        <div className="op-panel-heading">
          <div>
            <h2 id={id + 'title'}>{draft.id ? 'Edit automation' : 'Add automation'}</h2>
            <p>
              Triggers and actions come from a fixed list. Use {'{record}'} to insert the record’s
              name.
            </p>
          </div>
          <button
            className="op-icon-button"
            aria-label="Close form"
            onClick={close}
            disabled={busy}
          >
            <Icon name="close" />
          </button>
        </div>
        <form onSubmit={submit} className="op-automation-form">
          <div className="op-form-grid">
            <label className="wide">
              <span>Name *</span>
              <input
                autoFocus
                required
                maxLength={120}
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </label>
          </div>
          <fieldset>
            <legend>When</legend>
            <div className="op-form-grid">
              <label>
                <span>Trigger</span>
                <select
                  value={t.type}
                  onChange={(e) =>
                    setTrigger(newTrigger(e.target.value as AutomationTrigger['type'], p))
                  }
                >
                  {Object.entries(TRIGGER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              {t.type === 'deal.stage' && (
                <label>
                  <span>Stage</span>
                  <select
                    value={t.stageId}
                    onChange={(e) => setTrigger({ ...t, stageId: e.target.value })}
                  >
                    {p.ws.stages.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {t.type === 'job.stage' && (
                <label>
                  <span>Production stage</span>
                  <select
                    value={t.stage}
                    onChange={(e) => setTrigger({ ...t, stage: e.target.value as typeof t.stage })}
                  >
                    {PRODUCTION_STAGES.map((st) => (
                      <option key={st}>{st}</option>
                    ))}
                  </select>
                </label>
              )}
              {t.type === 'date.reached' && (
                <>
                  <label>
                    <span>Date</span>
                    <select
                      value={t.field}
                      onChange={(e) =>
                        setTrigger({ ...t, field: e.target.value as typeof t.field })
                      }
                    >
                      {Object.entries(DATE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Days after the date</span>
                    <input
                      type="number"
                      min={-60}
                      max={60}
                      value={t.offsetDays}
                      onChange={(e) => setTrigger({ ...t, offsetDays: Number(e.target.value) })}
                    />
                    <small>Use a negative number for days before. Dates use UTC for now.</small>
                  </label>
                </>
              )}
              {t.type === 'contact.created' && (
                <label>
                  <span>Type</span>
                  <select
                    value={t.kind}
                    onChange={(e) => setTrigger({ ...t, kind: e.target.value as typeof t.kind })}
                  >
                    <option value="">Any person or company</option>
                    {Object.entries(CONTACT_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label[0]!.toUpperCase() + label.slice(1)}
                      </option>
                    ))}
                  </select>
                  <small>Companies are recorded on a person for now.</small>
                </label>
              )}
              {t.type === 'deal.inactive' && (
                <label>
                  <span>Days without activity</span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={t.days}
                    onChange={(e) => setTrigger({ ...t, days: Number(e.target.value) })}
                  />
                  <small>Counts from the last change, or from when this rule is turned on.</small>
                </label>
              )}
            </div>
          </fieldset>
          <fieldset>
            <legend>Wait</legend>
            <div className="op-form-grid">
              <label>
                <span>Wait before checking</span>
                <input
                  type="number"
                  min={0}
                  max={draft.wait.unit === 'days' ? 365 : 720}
                  value={draft.wait.amount}
                  onChange={(e) => set({ wait: { ...draft.wait, amount: Number(e.target.value) } })}
                />
                <small>0 runs right away.</small>
              </label>
              <label>
                <span>Unit</span>
                <select
                  value={draft.wait.unit}
                  onChange={(e) =>
                    set({ wait: { ...draft.wait, unit: e.target.value as Draft['wait']['unit'] } })
                  }
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </select>
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>If (optional)</legend>
            <div className="op-module-options">
              {allowed.conditions.map((type) => {
                const current = draft.conditions.find((c) => c.type === type);
                return (
                  <label key={type}>
                    <input
                      type="checkbox"
                      checked={Boolean(current)}
                      onChange={(e) =>
                        set({
                          conditions: e.target.checked
                            ? [...draft.conditions, newCondition(type, p)]
                            : draft.conditions.filter((c) => c.type !== type),
                        })
                      }
                    />
                    <span>
                      <strong>{CONDITION_LABELS[type]}</strong>
                      {current?.type === 'deal.stage.is' && (
                        <select
                          aria-label="Stage"
                          value={current.stageId}
                          onChange={(e) =>
                            set({
                              conditions: draft.conditions.map((c) =>
                                c.type === type
                                  ? { type: 'deal.stage.is', stageId: e.target.value }
                                  : c,
                              ),
                            })
                          }
                        >
                          {p.ws.stages.map((st) => (
                            <option key={st.id} value={st.id}>
                              {st.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {current?.type === 'job.stage.is' && (
                        <select
                          aria-label="Production stage"
                          value={current.stage}
                          onChange={(e) =>
                            set({
                              conditions: draft.conditions.map((c) =>
                                c.type === type
                                  ? {
                                      type: 'job.stage.is',
                                      stage: e.target.value as typeof current.stage,
                                    }
                                  : c,
                              ),
                            })
                          }
                        >
                          {PRODUCTION_STAGES.map((st) => (
                            <option key={st}>{st}</option>
                          ))}
                        </select>
                      )}
                      {type === 'no.activity' && <small>Needs a wait.</small>}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <fieldset>
            <legend>Then</legend>
            {draft.actions.map((a, i) => (
              <div className="op-automation-action" key={i}>
                <div className="op-form-grid">
                  <label>
                    <span>Action {i + 1}</span>
                    <select
                      value={a.type}
                      onChange={(e) =>
                        setAction(i, newAction(e.target.value as AutomationAction['type'], kind))
                      }
                    >
                      {allowed.actions.map((type) => (
                        <option key={type} value={type}>
                          {ACTION_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {a.type === 'task.create' && (
                    <>
                      <label>
                        <span>Assign to</span>
                        <select
                          value={a.memberId}
                          onChange={(e) => setAction(i, { ...a, memberId: e.target.value })}
                        >
                          {people('Nobody').map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="wide">
                        <span>Task title *</span>
                        <input
                          required
                          maxLength={200}
                          value={a.title}
                          onChange={(e) => setAction(i, { ...a, title: e.target.value })}
                        />
                      </label>
                      <label>
                        <span>Due in days</span>
                        <input
                          type="number"
                          min={0}
                          max={365}
                          value={a.dueInDays}
                          onChange={(e) =>
                            setAction(i, { ...a, dueInDays: Number(e.target.value) })
                          }
                        />
                      </label>
                      <label>
                        <span>Repeat</span>
                        <select
                          value={a.recurrence ?? 'none'}
                          onChange={(e) =>
                            setAction(i, {
                              ...a,
                              recurrence: e.target.value as NonNullable<typeof a.recurrence>,
                            })
                          }
                        >
                          <option value="none">Does not repeat</option>
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </label>
                      {kind !== 'contact' && (
                        <label>
                          <span>Link to</span>
                          <select
                            value={a.link ?? 'record'}
                            onChange={(e) =>
                              setAction(i, { ...a, link: e.target.value as 'record' | 'none' })
                            }
                          >
                            <option value="record">The record’s order</option>
                            <option value="none">No order</option>
                          </select>
                        </label>
                      )}
                      <label className="wide">
                        <span>Notes</span>
                        <textarea
                          rows={3}
                          maxLength={2000}
                          value={a.notes ?? ''}
                          onChange={(e) => setAction(i, { ...a, notes: e.target.value })}
                        />
                      </label>
                    </>
                  )}
                  {a.type === 'tasks.create' && (
                    <>
                      {kind !== 'contact' && (
                        <label>
                          <span>Link to</span>
                          <select
                            value={a.link ?? 'record'}
                            onChange={(e) =>
                              setAction(i, { ...a, link: e.target.value as 'record' | 'none' })
                            }
                          >
                            <option value="record">The record’s order</option>
                            <option value="none">No order</option>
                          </select>
                        </label>
                      )}
                      <div className="wide op-automation-checklist">
                        {a.items.map((item, k) => {
                          const setItem = (patch: Partial<typeof item>) =>
                            setAction(i, {
                              ...a,
                              items: a.items.map((x, m) => (m === k ? { ...x, ...patch } : x)),
                            });
                          return (
                            <div key={k}>
                              <label>
                                <span>Task {k + 1} *</span>
                                <input
                                  required
                                  maxLength={200}
                                  value={item.title}
                                  onChange={(e) => setItem({ title: e.target.value })}
                                />
                              </label>
                              <label>
                                <span>Assign to</span>
                                <select
                                  value={item.memberId}
                                  onChange={(e) => setItem({ memberId: e.target.value })}
                                >
                                  {people('Nobody').map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Due in days</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={365}
                                  value={item.dueInDays}
                                  onChange={(e) => setItem({ dueInDays: Number(e.target.value) })}
                                />
                              </label>
                              {a.items.length > 1 && (
                                <button
                                  type="button"
                                  className="op-text-button"
                                  aria-label={`Remove task ${k + 1}`}
                                  onClick={() =>
                                    setAction(i, { ...a, items: a.items.filter((_, m) => m !== k) })
                                  }
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {a.items.length < 20 && (
                          <Button
                            secondary
                            icon="plus"
                            onClick={() =>
                              setAction(i, {
                                ...a,
                                items: [...a.items, { title: '', memberId: '', dueInDays: 0 }],
                              })
                            }
                          >
                            Add task
                          </Button>
                        )}
                      </div>
                    </>
                  )}
                  {a.type === 'tasks.update' && (
                    <>
                      <label>
                        <span>Change</span>
                        <select
                          value={a.change}
                          onChange={(e) =>
                            setAction(i, {
                              ...a,
                              change: e.target.value as typeof a.change,
                              memberId: '',
                            })
                          }
                        >
                          <option value="complete">Mark them complete</option>
                          <option value="reassign">Reassign them</option>
                        </select>
                      </label>
                      {a.change === 'reassign' && (
                        <label>
                          <span>Reassign to *</span>
                          <select
                            required
                            value={a.memberId}
                            onChange={(e) => setAction(i, { ...a, memberId: e.target.value })}
                          >
                            <option value="">Choose a member</option>
                            {people(null).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      <label className="wide">
                        <span>Only tasks whose title contains</span>
                        <input
                          maxLength={120}
                          value={a.titleContains}
                          placeholder="All open tasks"
                          onChange={(e) => setAction(i, { ...a, titleContains: e.target.value })}
                        />
                        <small>
                          Open tasks linked to the record’s order
                          {kind === 'deal' ? 's (every order of the project)' : ''}.
                        </small>
                      </label>
                    </>
                  )}
                  {a.type === 'job.assign' && (
                    <label>
                      <span>Team member *</span>
                      <select
                        required
                        value={a.memberId}
                        onChange={(e) => setAction(i, { ...a, memberId: e.target.value })}
                      >
                        <option value="">Choose a member</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <small>They will see this job; production never sees prices.</small>
                    </label>
                  )}
                  {a.type === 'notify' && (
                    <>
                      <label>
                        <span>Notify *</span>
                        <select
                          required
                          value={a.memberId}
                          onChange={(e) => setAction(i, { ...a, memberId: e.target.value })}
                        >
                          {!hasAssignee && <option value="">Choose a member</option>}
                          {people(null).map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="wide">
                        <span>Message *</span>
                        <input
                          required
                          maxLength={500}
                          value={a.message}
                          onChange={(e) => setAction(i, { ...a, message: e.target.value })}
                        />
                        <small>Shown in the app; nothing is emailed.</small>
                      </label>
                    </>
                  )}
                  {a.type === 'stage.move' && (
                    <label>
                      <span>Stage *</span>
                      <select
                        required
                        value={a.stage}
                        onChange={(e) => setAction(i, { ...a, stage: e.target.value })}
                      >
                        <option value="">Choose a stage</option>
                        {stageOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <small>
                        {kind === 'deal'
                          ? 'Won and lost stay a person’s decision.'
                          : kind === 'order'
                            ? 'Moves the order’s jobs at the If stage, or every open job.'
                            : 'Orders are never released by an automation.'}
                      </small>
                    </label>
                  )}
                  {a.type === 'note.add' && (
                    <label className="wide">
                      <span>Note *</span>
                      <input
                        required
                        maxLength={500}
                        value={a.text}
                        onChange={(e) => setAction(i, { ...a, text: e.target.value })}
                      />
                    </label>
                  )}
                </div>
                {draft.actions.length > 1 && (
                  <button
                    type="button"
                    className="op-text-button"
                    onClick={() => set({ actions: draft.actions.filter((_, j) => j !== i) })}
                  >
                    Remove action
                  </button>
                )}
              </div>
            ))}
            {draft.actions.length < 10 && (
              <Button
                secondary
                icon="plus"
                onClick={() =>
                  set({ actions: [...draft.actions, newAction(allowed.actions[0]!, kind)] })
                }
              >
                Add action
              </Button>
            )}
          </fieldset>
          <p className="op-automation-preview" aria-live="polite">
            <b>When</b> {s.when}
            {s.wait && (
              <>
                , <b>wait</b> {s.wait}
              </>
            )}
            {s.conditions.length > 0 && (
              <>
                , <b>if</b> {s.conditions.join(' and ')}
              </>
            )}
            , <b>then</b> {s.actions.join(', then ')}.
          </p>
          <label className="op-switch">
            <input
              type="checkbox"
              role="switch"
              checked={draft.enabled}
              onChange={(e) => set({ enabled: e.target.checked })}
            />
            <span>{draft.enabled ? 'On after saving' : 'Off after saving'}</span>
          </label>
          {error && (
            <p role="alert" className="op-error">
              {error}
            </p>
          )}
          <div className="op-form-actions">
            <Button secondary onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save automation'}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

/** Notifications addressed to the signed-in person; the server sends only theirs. */
export function Notifications(p: PageProps) {
  const unread = (p.data.notifications ?? []).filter((n) => n.workspaceId === p.ws.id && !n.read);
  if (!unread.length) return null;
  return (
    <Panel title={`For you (${unread.length})`}>
      <div className="op-list">
        {unread.map((n) => (
          <div key={n.id}>
            <span>
              <strong>{n.message}</strong>
              <small>{new Date(n.createdAt).toLocaleString()}</small>
            </span>
            <button
              className="op-text-button"
              onClick={() =>
                void p.run('notification.read', { id: n.id }).catch((e) => p.notify(e.message))
              }
            >
              Mark read
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
}
