import type { SuiteData, TimeEntry } from './types.js';

/** A clock time sent by a device may be this far ahead of the server clock. */
export const CLOCK_SKEW_MS = 2 * 60 * 1000;
/** Offline clock-ins and clock-outs keep their device time if synced within this window. */
export const CLOCK_BACKDATE_MS = 24 * 60 * 60 * 1000;
/** One entry may not span longer than this; longer shifts need a reviewer's correction. */
export const MAX_SHIFT_MS = 24 * 60 * 60 * 1000;

const entries = (data: SuiteData, workspaceId: string) =>
  (data.timeEntries ?? []).filter((e) => e.workspaceId === workspaceId && !e.archived);

/** The member's running entry, if they are on the clock. */
export function openEntry(
  data: SuiteData,
  workspaceId: string,
  memberId: string,
): TimeEntry | undefined {
  return entries(data, workspaceId).find((e) => e.memberId === memberId && !e.end);
}

/** Milliseconds worked; a running entry counts up to `now`. */
export function entryMs(entry: TimeEntry, now = new Date().toISOString()): number {
  const end = entry.end || now;
  return Math.max(0, Date.parse(end) - Date.parse(entry.start));
}

/** Time worked between `from` (inclusive) and `to` (exclusive), clipping entries that cross it. */
export function workedMs(
  data: SuiteData,
  workspaceId: string,
  memberId: string,
  from: string,
  to: string,
  now = new Date().toISOString(),
): number {
  const a = Date.parse(from),
    b = Date.parse(to);
  return entries(data, workspaceId)
    .filter((e) => e.memberId === memberId)
    .reduce((total, e) => {
      const start = Math.max(a, Date.parse(e.start));
      const end = Math.min(b, Date.parse(e.end || now));
      return total + Math.max(0, end - start);
    }, 0);
}

/** `1:05` style hours and minutes for totals; `1:05:09` with seconds for running timers. */
export function formatDuration(ms: number, seconds = false): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return seconds ? `${h}:${pad(m)}:${pad(s)}` : `${h}:${pad(m)}`;
}
