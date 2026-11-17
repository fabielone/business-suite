import { useEffect, useState } from 'react';
import {
  actorScope,
  authorizeCommand,
  entryMs,
  formatDuration,
  openEntry,
  orderJobs,
  workedMs,
  type TimeEntry,
} from '@suite/core/operations';
import { Badge, Button, Empty, PageTitle, Panel, Stats, Table } from './components';
import type { PageProps } from './pages';

/** Re-renders every `ms` so running timers count up. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
/** Midnight today and the Monday of this week, in this device's time zone. */
function periods(now: number) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const week = new Date(today);
  week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
  return { today: today.toISOString(), week: week.toISOString() };
}
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const day = (iso: string) =>
  new Date(iso).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
/** `datetime-local` value in this device's time zone. */
const localInput = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const allowed = (p: PageProps, type: string, payload: Record<string, unknown>) => {
  try {
    authorizeCommand(p.data, { id: 'check', workspaceId: p.ws.id, type, payload }, p.actor);
    return true;
  } catch {
    return false;
  }
};
const nameOf = (p: PageProps, id: string) =>
  p.data.contacts.find((c) => c.id === id)?.name ?? 'Former member';

/** What an entry was spent on: "#12 Reception signage · Installation" or "General work". */
function workingOn(p: PageProps, e: Pick<TimeEntry, 'orderId' | 'jobId'>) {
  const order = p.data.projects.find((o) => o.id === e.orderId);
  if (!order) return 'General work';
  const job = orderJobs(order).find((j) => j.id === e.jobId);
  return `${order.number ? `#${order.number} ` : ''}${order.title}${job ? ` · ${job.name}` : ''}`;
}

/** Orders and jobs this person may log time against, as `orderId|jobId` choices. */
function targets(p: PageProps, memberId: string) {
  const choices = [{ value: '|', label: 'General work (no order)' }];
  for (const order of p.data.projects.filter(
    (o) => o.workspaceId === p.ws.id && !o.archived && o.status !== 'completed',
  )) {
    const value = `${order.id}|`;
    if (allowed(p, 'time.clockIn', { memberId, orderId: order.id }))
      choices.push({ value, label: workingOn(p, { orderId: order.id, jobId: '' }) });
    for (const job of orderJobs(order))
      if (
        !['Delivered', 'Closed'].includes(job.stage) &&
        allowed(p, 'time.clockIn', { memberId, orderId: order.id, jobId: job.id })
      )
        choices.push({
          value: `${order.id}|${job.id}`,
          label: workingOn(p, { orderId: order.id, jobId: job.id }),
        });
  }
  return choices;
}

export function TimeClock(p: PageProps) {
  const now = useNow();
  const nowIso = new Date(now).toISOString();
  const { today, week } = periods(now);
  const self = actorScope(p.data, p.ws.id, p.actor).mine[0] ?? '';
  const reviewer = p.grants.includes('time.review');
  const entries = (p.data.timeEntries ?? [])
    .filter((e) => e.workspaceId === p.ws.id && !e.archived)
    .sort((a, b) => b.start.localeCompare(a.start));
  const running = self ? openEntry(p.data, p.ws.id, self) : undefined;
  const choices = self ? targets(p, self) : [];
  const [target, setTarget] = useState('|');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (type: string, payload: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      await p.run(type, payload);
      p.notify(done);
      setNote('');
    } catch (e) {
      p.notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const clockIn = (memberId: string, value = target) => {
    const [orderId = '', jobId = ''] = value.split('|');
    return act(
      'time.clockIn',
      { memberId, orderId, jobId, note: note.trim(), at: new Date().toISOString() },
      `${memberId === self ? 'You are' : `${nameOf(p, memberId)} is`} on the clock.`,
    );
  };
  const clockOut = (entry: TimeEntry) =>
    act(
      'time.clockOut',
      {
        id: entry.id,
        note: entry.memberId === self ? note.trim() : '',
        at: new Date().toISOString(),
      },
      `Clocked out after ${formatDuration(entryMs(entry, new Date().toISOString()))} h.`,
    );
  const correct = (entry: TimeEntry) =>
    p.form({
      title: `Correct hours · ${nameOf(p, entry.memberId)}`,
      description:
        'Corrections keep a record of the original times and your reason in Activity. Leave the end empty to keep the shift running.',
      fields: [
        { name: 'start', label: 'Clock in', type: 'datetime-local', required: true },
        { name: 'end', label: 'Clock out', type: 'datetime-local' },
        { name: 'reason', label: 'Reason', required: true, wide: true },
      ],
      initial: { start: localInput(entry.start), end: localInput(entry.end), reason: '' },
      submitLabel: 'Save correction',
      submit: (v, key) =>
        p.run(
          'time.adjust',
          {
            id: entry.id,
            start: new Date(String(v.start)).toISOString(),
            end: v.end ? new Date(String(v.end)).toISOString() : '',
            reason: v.reason,
            ...(self ? { by: self } : {}),
          },
          key,
        ),
    });
  const people = p.data.contacts.filter(
    (c) => c.workspaceId === p.ws.id && c.kind === 'member' && !c.archived,
  );
  const onClock = entries.filter((e) => !e.end);
  const mine = entries.filter((e) => e.memberId === self);
  const canTrack = p.grants.includes('time.track');
  return (
    <>
      <PageTitle
        title="Time clock"
        description={
          reviewer
            ? 'Clock in and out, see who is working now and correct hours with a reason.'
            : 'Clock in when you start and out when you stop. Your hours are saved on this device first.'
        }
      />
      {canTrack && !self && (
        <Empty title="Your sign-in is not linked to a team member">
          Ask a manager to add you in People as a team member with the email you sign in with.
        </Empty>
      )}
      {canTrack && self && (
        <section className={`op-clock ${running ? 'running' : ''}`} aria-live="polite">
          <div className="op-clock-face">
            <span className="op-clock-state">
              <span className="op-clock-dot" aria-hidden="true" />
              {running ? `On the clock since ${time(running.start)}` : 'Off the clock'}
            </span>
            <strong className="op-clock-timer" aria-label="Time on this shift">
              {formatDuration(running ? entryMs(running, nowIso) : 0, true)}
            </strong>
            <small>
              {running ? workingOn(p, running) : 'Choose what you are working on, then clock in.'}
            </small>
          </div>
          <div className="op-clock-controls">
            {!running && choices.length > 1 && (
              <label>
                Working on
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Note <span className="op-optional">optional</span>
              <input
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                placeholder={running ? 'What did you finish?' : 'Where are you working?'}
              />
            </label>
            {running ? (
              <Button
                className="op-clock-button out"
                disabled={busy || !allowed(p, 'time.clockOut', { id: running.id })}
                onClick={() => void clockOut(running)}
              >
                Clock out
              </Button>
            ) : (
              <Button
                className="op-clock-button"
                disabled={busy || !allowed(p, 'time.clockIn', { memberId: self })}
                onClick={() => void clockIn(self)}
              >
                Clock in
              </Button>
            )}
          </div>
          <Stats
            values={[
              {
                label: 'Today',
                value: formatDuration(workedMs(p.data, p.ws.id, self, today, nowIso, nowIso)),
              },
              {
                label: 'This week',
                value: formatDuration(workedMs(p.data, p.ws.id, self, week, nowIso, nowIso)),
              },
              { label: 'Shifts this week', value: mine.filter((e) => e.start >= week).length },
            ]}
          />
        </section>
      )}
      {reviewer && (
        <Panel title={`On the clock now (${onClock.length})`}>
          {onClock.length ? (
            <div className="op-list">
              {onClock.map((e) => (
                <div key={e.id}>
                  <span>
                    <strong>{nameOf(p, e.memberId)}</strong>
                    <small>
                      since {time(e.start)} · {workingOn(p, e)}
                    </small>
                  </span>
                  <span className="op-clock-running">
                    {formatDuration(entryMs(e, nowIso), true)}
                  </span>
                  {e.memberId !== self && allowed(p, 'time.clockOut', { id: e.id }) && (
                    <button
                      className="op-text-button"
                      disabled={busy}
                      onClick={() => void clockOut(e)}
                    >
                      Clock out
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="op-caption">Nobody is on the clock.</p>
          )}
        </Panel>
      )}
      {reviewer && (
        <Panel title="Hours by person">
          <Table headings={['Person', 'Status', 'Today', 'This week', '']}>
            {people.map((c) => {
              const open = openEntry(p.data, p.ws.id, c.id);
              return (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    {c.position && <small>{c.position}</small>}
                  </td>
                  <td>
                    {open ? <Badge tone="good">Working</Badge> : <Badge tone="plain">Off</Badge>}
                  </td>
                  <td className="op-num">
                    {formatDuration(workedMs(p.data, p.ws.id, c.id, today, nowIso, nowIso))}
                  </td>
                  <td className="op-num">
                    {formatDuration(workedMs(p.data, p.ws.id, c.id, week, nowIso, nowIso))}
                  </td>
                  <td>
                    {!open && c.id !== self && allowed(p, 'time.clockIn', { memberId: c.id }) && (
                      <button
                        className="op-text-button"
                        disabled={busy}
                        onClick={() => void clockIn(c.id, '|')}
                      >
                        Clock in
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Panel>
      )}
      <Panel title={reviewer ? 'All shifts' : 'Your shifts'}>
        {(reviewer ? entries : mine).length ? (
          <Table
            headings={[
              ...(reviewer ? ['Person'] : []),
              'Day',
              'In',
              'Out',
              'Hours',
              'Working on',
              '',
            ]}
          >
            {(reviewer ? entries : mine).slice(0, 60).map((e) => (
              <tr key={e.id}>
                {reviewer && <td>{nameOf(p, e.memberId)}</td>}
                <td>{day(e.start)}</td>
                <td>{time(e.start)}</td>
                <td>{e.end ? time(e.end) : <Badge tone="good">Running</Badge>}</td>
                <td className="op-num">{formatDuration(entryMs(e, nowIso))}</td>
                <td>
                  {workingOn(p, e)}
                  {e.note && <small>{e.note}</small>}
                  {e.adjustedReason && <small>Corrected: {e.adjustedReason}</small>}
                </td>
                <td>
                  {allowed(p, 'time.adjust', { id: e.id }) && (
                    <button className="op-text-button" onClick={() => correct(e)}>
                      Correct
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        ) : (
          <p className="op-caption">No shifts yet. Clock in to start your first one.</p>
        )}
      </Panel>
    </>
  );
}

/** Top-bar reminder that the signed-in person is on the clock; opens the time clock. */
export function ClockChip({ p }: { p: PageProps }) {
  const now = useNow();
  const self = actorScope(p.data, p.ws.id, p.actor).mine[0] ?? '';
  const running = self ? openEntry(p.data, p.ws.id, self) : undefined;
  if (!running || !p.grants.includes('time.track')) return null;
  return (
    <button className="op-clock-chip" onClick={() => p.go('time')} title="Open the time clock">
      <span className="op-clock-dot" aria-hidden="true" />
      <span className="sr-only">On the clock: </span>
      {formatDuration(entryMs(running, new Date(now).toISOString()), true)}
    </button>
  );
}
