/**
 * Calendar-day helpers. Engine days are local calendar dates as ISO strings
 * ("YYYY-MM-DD"); arithmetic runs in UTC so DST never shifts a day.
 */
export type IsoDate = string;

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().startsWith(value);
}

function toUtcMs(date: IsoDate): number {
  if (!isIsoDate(date)) throw new RangeError(`Not an ISO date: ${date}`);
  return Date.parse(`${date}T00:00:00Z`);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(toUtcMs(date) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / MS_PER_DAY);
}

/** Inclusive list of dates from `start` to `end`. */
export function dateRange(start: IsoDate, end: IsoDate): IsoDate[] {
  const n = daysBetween(start, end);
  const out: IsoDate[] = [];
  for (let i = 0; i <= n; i++) out.push(addDays(start, i));
  return out;
}

/** Local calendar date of a JS Date (device time zone). */
export function localIsoDate(d: Date): IsoDate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
