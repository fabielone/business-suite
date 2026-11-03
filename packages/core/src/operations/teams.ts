import type { BusinessHours, Task, Team, Workspace } from './types.js';

/** Used until a workspace sets its own hours: Monday to Friday, 09:00–18:00, Mexico City. */
export const DEFAULT_HOURS: BusinessHours = {
  timeZone: 'America/Mexico_City',
  days: [1, 2, 3, 4, 5],
  start: '09:00',
  end: '18:00',
};
/** The usual departments of a small shop, with the agreed alert timings. */
export const DEFAULT_TEAMS: { id: string; name: string; alert: Team['alert'] }[] = [
  { id: 'production', name: 'Production', alert: { amount: 4, unit: 'hours' } },
  { id: 'sales', name: 'Sales', alert: { amount: 2, unit: 'hours' } },
  { id: 'marketing', name: 'Marketing', alert: { amount: 1, unit: 'days' } },
  { id: 'office', name: 'Office', alert: { amount: 1, unit: 'days' } },
];
/** The first alert plus up to four daily reminders; after that it is the lead's call. */
export const MAX_QUEUE_ALERTS = 5;
export const TASK_HISTORY_LIMIT = 50;
/** A task due soon still gets this much business time before its first alert. */
const DUE_GRACE_MINUTES = 60;

export const hoursOf = (ws: Workspace | undefined): BusinessHours =>
  ws?.businessHours ?? DEFAULT_HOURS;
export const activeTeams = (ws: Workspace | undefined): Team[] =>
  (ws?.teams ?? []).filter((t) => !t.archived);
export const teamOf = (ws: Workspace | undefined, teamId: string | undefined) =>
  teamId ? (ws?.teams ?? []).find((t) => t.id === teamId) : undefined;
/** Teams any of these member contacts belongs to. */
export const teamIdsFor = (ws: Workspace | undefined, memberIds: string[]): string[] =>
  activeTeams(ws)
    .filter((t) => t.memberIds.some((m) => memberIds.includes(m)))
    .map((t) => t.id);
/** Waiting in a team's queue: has a team, nobody holds it, still open. */
export const isUpForGrabs = (task: Task) =>
  Boolean(task.teamId) && !task.assigneeId && !task.done && !task.archived;

export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
const formatters = new Map<string, Intl.DateTimeFormat>();
function localParts(ms: number, timeZone: string) {
  let format = formatters.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, format);
  }
  const n: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(ms)))
    if (part.type !== 'literal') n[part.type] = Number(part.value);
  return { y: n.year!, m: n.month!, d: n.day!, h: n.hour! % 24, min: n.minute!, s: n.second! };
}
/** Milliseconds the zone is ahead of UTC at that instant. */
function offset(ms: number, timeZone: string) {
  const p = localParts(ms, timeZone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(ms / 1000) * 1000;
}
/** The instant of a local wall-clock time, correct across daylight-saving changes. */
function localToUtc(y: number, m: number, d: number, minutes: number, timeZone: string) {
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const first = guess - offset(guess, timeZone);
  const second = guess - offset(first, timeZone);
  return second;
}
const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
};
export const dayMinutes = (hours: BusinessHours) => minutesOf(hours.end) - minutesOf(hours.start);
/** Open periods [start, end) in ms, from the local day of `fromMs` onwards (about a year). */
function* openPeriods(fromMs: number, hours: BusinessHours) {
  const p = localParts(fromMs, hours.timeZone);
  let day = Date.UTC(p.y, p.m - 1, p.d);
  for (let i = 0; i < 400; i++, day += 86400000) {
    const date = new Date(day);
    if (!hours.days.includes(date.getUTCDay())) continue;
    const [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    yield [
      localToUtc(y, m, d, minutesOf(hours.start), hours.timeZone),
      localToUtc(y, m, d, minutesOf(hours.end), hours.timeZone),
    ] as const;
  }
}
/**
 * The moment `minutes` of business time have passed after `fromIso`. Zero gives the next
 * open moment (or `fromIso` itself while open). Empty when the hours never open.
 */
export function addBusinessMinutes(fromIso: string, minutes: number, hours: BusinessHours) {
  const from = Date.parse(fromIso);
  let left = minutes * 60000;
  for (const [start, end] of openPeriods(from, hours)) {
    const begin = Math.max(start, from);
    if (begin >= end) continue;
    if (left <= end - begin) return new Date(begin + left).toISOString();
    left -= end - begin;
  }
  return '';
}
export const alertMinutes = (team: Team, hours: BusinessHours) =>
  team.alert.amount * (team.alert.unit === 'hours' ? 60 : dayMinutes(hours));
/** Local HH:MM of an instant, for messages such as "Ana claimed it at 10:31". */
export function localTime(iso: string, hours: BusinessHours) {
  const p = localParts(Date.parse(iso), hours.timeZone);
  return `${String(p.h).padStart(2, '0')}:${String(p.min).padStart(2, '0')}`;
}
/**
 * When the next unclaimed-work alert is due, or empty when none is. The first alert comes
 * after the team's wait in business time, or earlier when the due date comes first; then one
 * reminder per business day, up to MAX_QUEUE_ALERTS in all.
 */
export function nextQueueAlert(ws: Workspace | undefined, task: Task): string {
  const team = teamOf(ws, task.teamId);
  if (!team || team.archived || !isUpForGrabs(task) || !task.queuedAt) return '';
  const alerts = task.alerts ?? 0;
  if (alerts >= MAX_QUEUE_ALERTS) return '';
  const hours = hoursOf(ws);
  if (alerts > 0)
    return addBusinessMinutes(task.lastAlertAt ?? task.queuedAt, dayMinutes(hours), hours);
  const wait = alertMinutes(team, hours);
  let at = addBusinessMinutes(task.queuedAt, wait, hours);
  if (task.due) {
    const [y, m, d] = task.due.split('-').map(Number);
    const dueOpen = addBusinessMinutes(
      new Date(localToUtc(y!, m!, d!, 0, hours.timeZone)).toISOString(),
      0,
      hours,
    );
    const earliest = addBusinessMinutes(task.queuedAt, Math.min(wait, DUE_GRACE_MINUTES), hours);
    const byDue = dueOpen > earliest ? dueOpen : earliest;
    if (byDue && (!at || byDue < at)) at = byDue;
  }
  return at;
}
