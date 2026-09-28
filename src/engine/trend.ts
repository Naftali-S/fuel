/**
 * Trend weight: a time-aware exponential moving average of scale weight.
 *
 *   trend += (1 − e^(−Δd/τ)) · (weight − trend)
 *
 * Δd is the number of days since the previous weigh-in, so gaps are handled
 * without pretending the missing days existed. τ ≈ 10 days smooths out daily
 * water and gut-content swings while still following real change.
 */
import { addDays, daysBetween, type IsoDate } from './dates';

export interface WeighIn {
  date: IsoDate;
  kg: number;
}

export interface TrendPoint {
  date: IsoDate;
  trendKg: number;
  /** Average of that day's weigh-ins, or null when none. */
  weighedKg: number | null;
}

export interface TrendOptions {
  /** Smoothing time constant in days. */
  tauDays?: number;
  /** Extend the series (carrying the trend) through this date. */
  through?: IsoDate;
}

export const DEFAULT_TAU_DAYS = 10;

/** Largest pull a single weigh-in may exert, in kg (grows with the gap). */
function maxInnovationKg(gapDays: number): number {
  return 2.5 + 0.1 * gapDays;
}

function dailyAverages(weighIns: readonly WeighIn[]): Map<IsoDate, number> {
  const sums = new Map<IsoDate, { total: number; n: number }>();
  for (const w of weighIns) {
    if (!Number.isFinite(w.kg) || w.kg <= 0) continue;
    const s = sums.get(w.date) ?? { total: 0, n: 0 };
    s.total += w.kg;
    s.n += 1;
    sums.set(w.date, s);
  }
  const out = new Map<IsoDate, number>();
  for (const [date, s] of sums) out.set(date, s.total / s.n);
  return out;
}

export function computeTrend(weighIns: readonly WeighIn[], options: TrendOptions = {}): TrendPoint[] {
  const tau = options.tauDays ?? DEFAULT_TAU_DAYS;
  const byDay = dailyAverages(weighIns);
  if (byDay.size === 0) return [];

  const days = [...byDay.keys()].sort();
  const first = days[0];
  let last = days[days.length - 1];
  if (options.through && options.through > last) last = options.through;

  // Seed with the first week's average so one noisy first reading
  // doesn't skew the early trend.
  const seedDays = days.filter((d) => daysBetween(first, d) < 7);
  let trend = seedDays.reduce((sum, d) => sum + byDay.get(d)!, 0) / seedDays.length;
  let lastWeighed = first;

  const out: TrendPoint[] = [];
  const n = daysBetween(first, last);
  for (let i = 0; i <= n; i++) {
    const date = addDays(first, i);
    const kg = byDay.get(date) ?? null;
    if (kg !== null && i > 0) {
      const gap = daysBetween(lastWeighed, date);
      const alpha = 1 - Math.exp(-gap / tau);
      const limit = maxInnovationKg(gap);
      const innovation = Math.max(-limit, Math.min(limit, kg - trend));
      trend += alpha * innovation;
      lastWeighed = date;
    }
    out.push({ date, trendKg: trend, weighedKg: kg });
  }
  return out;
}

/** Trend value on a date, or undefined outside the series. */
export function trendAt(series: readonly TrendPoint[], date: IsoDate): number | undefined {
  if (series.length === 0) return undefined;
  const i = daysBetween(series[0].date, date);
  return i >= 0 && i < series.length ? series[i].trendKg : undefined;
}
