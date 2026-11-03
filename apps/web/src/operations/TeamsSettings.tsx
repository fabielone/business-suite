import { useState } from 'react';
import { DEFAULT_HOURS, active, activeTeams, hoursOf, type Team } from '@suite/core/operations';
import { Badge, Button, Panel } from './components';
import type { PageProps } from './pages';

const ALERTS: { label: string; value: string }[] = [
  ...[1, 2, 3, 4, 6, 8].map((h) => ({
    label: `${h} business hour${h > 1 ? 's' : ''}`,
    value: `${h}h`,
  })),
  ...[1, 2, 3].map((d) => ({ label: `${d} business day${d > 1 ? 's' : ''}`, value: `${d}d` })),
];
const alertValue = (a: Team['alert']) => `${a.amount}${a.unit === 'hours' ? 'h' : 'd'}`;
const alertFrom = (v: string): Team['alert'] => ({
  amount: Number(v.slice(0, -1)),
  unit: v.endsWith('h') ? 'hours' : 'days',
});
const alertLabel = (a: Team['alert']) =>
  ALERTS.find((x) => x.value === alertValue(a))?.label ??
  `${a.amount} business ${a.unit === 'hours' ? 'hour(s)' : 'day(s)'}`;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ZONES = [
  'America/Mexico_City',
  'America/Monterrey',
  'America/Tijuana',
  'America/Cancun',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/Madrid',
];

type Draft = { id: string; name: string; memberIds: string[]; leadIds: string[]; alert: string };

/**
 * Teams (departments) and the business hours that time unclaimed-work alerts. Teams decide
 * where work waits and who sees it; they never change what a role may do.
 */
export function TeamsSettings(p: PageProps) {
  const manage = p.grants.includes('workspace.manage');
  const teams = activeTeams(p.ws);
  const people = active(p.data.contacts.filter((c) => c.workspaceId === p.ws.id)).filter(
    (c) => c.kind === 'member',
  );
  const name = (id: string) => people.find((c) => c.id === id)?.name ?? 'Former member';
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const hours = hoursOf(p.ws);
  const [h, setH] = useState({ ...hours, days: [...hours.days] });
  const save = async (type: string, payload: Record<string, unknown>, done?: () => void) => {
    setError('');
    try {
      await p.run(type, payload);
      done?.();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const toggle = (list: string[], id: string, on: boolean) =>
    on ? [...new Set([...list, id])] : list.filter((x) => x !== id);
  const edit = (team?: Team) =>
    setDraft(
      team
        ? { ...team, alert: alertValue(team.alert) }
        : { id: '', name: '', memberIds: [], leadIds: [], alert: '1d' },
    );
  return (
    <>
      <Panel
        title="Teams"
        action={
          manage && (
            <Button icon="plus" onClick={() => edit()}>
              Add team
            </Button>
          )
        }
      >
        <p className="op-caption">
          Tasks can go to a whole team (up for grabs: any member claims it) or to one person.
          Members see their own teams’ work, never another team’s. Teams do not change what
          someone’s role allows, and production never sees prices.
        </p>
        {teams.length === 0 && manage && (
          <Button onClick={() => void save('team.defaults', {})}>
            Add Production, Sales, Marketing and Office
          </Button>
        )}
        <div className="op-team-grid">
          {teams.map((team) => (
            <div key={team.id} className="op-team-card">
              <strong>{team.name}</strong>
              <small>
                {team.memberIds.length
                  ? team.memberIds
                      .map((m) => name(m) + (team.leadIds.includes(m) ? ' (lead)' : ''))
                      .join(', ')
                  : 'No members yet'}
              </small>
              <span>
                <Badge tone="info">Alert after {alertLabel(team.alert)}</Badge>
              </span>
              {!team.leadIds.length && <small>No lead: alerts go to owners and managers.</small>}
              {manage && (
                <div className="op-row-actions">
                  <button onClick={() => edit(team)}>Edit</button>
                  <button onClick={() => void save('team.archive', { id: team.id })}>
                    Archive
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        {draft && (
          <form
            className="op-form-grid op-teams-form"
            onSubmit={(e) => {
              e.preventDefault();
              void save(
                'team.save',
                {
                  ...(draft.id ? { id: draft.id } : {}),
                  name: draft.name,
                  memberIds: draft.memberIds,
                  leadIds: draft.leadIds.filter((m) => draft.memberIds.includes(m)),
                  alert: alertFrom(draft.alert),
                },
                () => setDraft(null),
              );
            }}
          >
            <label>
              Team name
              <input
                required
                maxLength={60}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              Alert the lead when work waits unclaimed for
              <select
                value={draft.alert}
                onChange={(e) => setDraft({ ...draft, alert: e.target.value })}
              >
                {ALERTS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              <small>Counted in business hours only. Then one reminder per business day.</small>
            </label>
            <fieldset className="wide">
              <legend>Members and leads</legend>
              {people.length === 0 && (
                <small>Add team members in People first (type: member).</small>
              )}
              {people.map((c) => (
                <div key={c.id} className="op-days">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.memberIds.includes(c.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          memberIds: toggle(draft.memberIds, c.id, e.target.checked),
                          leadIds: e.target.checked
                            ? draft.leadIds
                            : draft.leadIds.filter((m) => m !== c.id),
                        })
                      }
                    />
                    {c.name}
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      disabled={!draft.memberIds.includes(c.id)}
                      checked={draft.leadIds.includes(c.id)}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          leadIds: toggle(draft.leadIds, c.id, e.target.checked),
                        })
                      }
                    />
                    Lead
                  </label>
                </div>
              ))}
            </fieldset>
            <div className="op-row-actions wide">
              <Button type="submit">Save team</Button>
              <button type="button" onClick={() => setDraft(null)}>
                Cancel
              </button>
            </div>
          </form>
        )}
        {error && (
          <p className="op-error" role="alert">
            {error}
          </p>
        )}
      </Panel>
      <Panel title="Business hours">
        <p className="op-caption">
          Unclaimed-work alerts only count time while the business is open, so work left on Friday
          evening does not alert anyone over the weekend.
        </p>
        <form
          className="op-form-grid op-teams-form"
          onSubmit={(e) => {
            e.preventDefault();
            void save('workspace.hours', { ...h });
          }}
        >
          <label>
            Time zone
            <input
              list="op-time-zones"
              value={h.timeZone}
              disabled={!manage}
              onChange={(e) => setH({ ...h, timeZone: e.target.value })}
            />
            <datalist id="op-time-zones">
              {ZONES.map((z) => (
                <option key={z} value={z} />
              ))}
            </datalist>
          </label>
          <label>
            Opens
            <input
              type="time"
              value={h.start}
              disabled={!manage}
              onChange={(e) => setH({ ...h, start: e.target.value })}
            />
          </label>
          <label>
            Closes
            <input
              type="time"
              value={h.end}
              disabled={!manage}
              onChange={(e) => setH({ ...h, end: e.target.value })}
            />
          </label>
          <fieldset className="op-days wide">
            <legend>Working days</legend>
            {DAYS.map((d, i) => (
              <label key={d}>
                <input
                  type="checkbox"
                  disabled={!manage}
                  checked={h.days.includes(i)}
                  onChange={(e) =>
                    setH({
                      ...h,
                      days: e.target.checked
                        ? [...h.days, i].sort()
                        : h.days.filter((x) => x !== i),
                    })
                  }
                />
                {d}
              </label>
            ))}
          </fieldset>
          {manage && (
            <div className="op-row-actions wide">
              <Button type="submit">Save business hours</Button>
              {!p.ws.businessHours && (
                <small>
                  Using the default: Monday to Friday, {DEFAULT_HOURS.start}–{DEFAULT_HOURS.end},{' '}
                  {DEFAULT_HOURS.timeZone}.
                </small>
              )}
            </div>
          )}
        </form>
      </Panel>
    </>
  );
}
