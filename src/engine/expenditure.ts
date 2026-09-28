/**
 * Adaptive energy expenditure from logged intake and scale weight.
 *
 * A two-state Kalman filter over [body mass W (kg), expenditure E (kcal/day)]:
 *
 *   W' = W + (I − E − m) / K        I = logged intake, m = known leading modifier
 *   E' = E + c · (W' − W)           expenditure drifts with body mass
 *
 * and daily scale weight z = W + noise. Days without a trustworthy intake log
 * assume maintenance and widen the uncertainty instead of guessing. The
 * equation-based estimate is the starting mean, so early estimates lean on
 * it and data takes over as it accumulates.
 *
 * E is expressed in *logged* calories, so consistent under- or over-logging is
 * absorbed into the estimate and targets stay achievable as logged.
 *
 * The published value is guarded: it moves at most `maxDailyChangeKcal` per
 * day and holds while too many recent days are unlogged.
 */
import { addDays, daysBetween, type IsoDate } from './dates';
import { KCAL_PER_KG } from './energy';
import type { WeighIn } from './trend';

export type DayStatus = 'complete' | 'partial' | 'unlogged' | 'fasting';

export interface DayIntake {
  date: IsoDate;
  kcal: number | null;
  status: DayStatus;
}

export interface ExpenditureOptions {
  /** Equation-based starting estimate, kcal/day. */
  priorKcal: number;
  /** Uncertainty of the starting estimate (1 SD), kcal/day. */
  priorSdKcal?: number;
  /** Day-to-day scale noise (water, gut content), 1 SD in kg. */
  scaleSdKg?: number;
  /** Day-to-day random walk of true expenditure, 1 SD in kcal. */
  driftSdKcal?: number;
  /** Relative random error of a complete day's log (0.1 = 10%). */
  loggedIntakeCv?: number;
  /** Uncertainty of an unlogged day's intake, 1 SD in kcal. */
  unknownIntakeSdKcal?: number;
  /** Change in expenditure per kg of body mass change, kcal/day per kg. */
  adaptationKcalPerKg?: number;
  /** Known short-term modifier (training, steps) for a date, kcal/day. */
  leadingKcal?: (date: IsoDate) => number;
  /** Largest change of the published estimate per day, kcal. */
  maxDailyChangeKcal?: number;
  /** Hold the published estimate when more than this many of the last 7 days are unlogged. */
  maxUnloggedOf7?: number;
}

export interface ExpenditurePoint {
  date: IsoDate;
  /** Published (guarded) estimate including the leading modifier, kcal/day. */
  kcal: number;
  /** Unguarded filter estimate including the leading modifier. */
  rawKcal: number;
  /** 1 SD uncertainty of the filter estimate, kcal/day. */
  sdKcal: number;
  /** Filter's estimate of true body mass (scale noise removed), kg. */
  massKg: number;
  /** True while the published estimate is held for missing logs. */
  paused: boolean;
}

const DEFAULTS = {
  scaleSdKg: 0.6,
  driftSdKcal: 10,
  loggedIntakeCv: 0.1,
  unknownIntakeSdKcal: 700,
  adaptationKcalPerKg: 15,
  maxDailyChangeKcal: 60,
  maxUnloggedOf7: 3,
} as const;

/** Largest innovation (in SDs) a weigh-in may have before it is ignored. */
const OUTLIER_SDS = 4;

type Mat2 = [number, number, number, number]; // row-major [a, b; c, d]

function isKnownIntake(day: DayIntake | undefined): day is DayIntake & { kcal: number } {
  if (!day) return false;
  if (day.status === 'fasting') return true;
  return day.status === 'complete' && day.kcal !== null && Number.isFinite(day.kcal) && day.kcal >= 0;
}

function intakeOf(day: DayIntake & { kcal: number }): number {
  return day.status === 'fasting' ? 0 : day.kcal;
}

export function estimateExpenditure(
  weighIns: readonly WeighIn[],
  days: readonly DayIntake[],
  options: ExpenditureOptions,
): ExpenditurePoint[] {
  const o = { ...DEFAULTS, ...options };
  const K = KCAL_PER_KG;
  const c = o.adaptationKcalPerKg;
  const priorSd = o.priorSdKcal ?? Math.max(250, 0.15 * o.priorKcal);

  const weightByDay = new Map<IsoDate, { total: number; n: number }>();
  for (const w of weighIns) {
    if (!Number.isFinite(w.kg) || w.kg <= 0) continue;
    const s = weightByDay.get(w.date) ?? { total: 0, n: 0 };
    s.total += w.kg;
    s.n += 1;
    weightByDay.set(w.date, s);
  }
  if (weightByDay.size === 0) return [];

  const dayByDate = new Map<IsoDate, DayIntake>();
  for (const d of days) dayByDate.set(d.date, d);

  const weighDates = [...weightByDay.keys()].sort();
  const start = weighDates[0];
  const lastDates = [weighDates[weighDates.length - 1], ...days.map((d) => d.date)].sort();
  const end = lastDates[lastDates.length - 1];

  const measured = (date: IsoDate) => {
    const s = weightByDay.get(date);
    return s ? s.total / s.n : null;
  };

  // State and covariance.
  let W = measured(start)!;
  let E = o.priorKcal;
  let P: Mat2 = [o.scaleSdKg ** 2, 0, 0, priorSd ** 2];
  const lead = (date: IsoDate) => (o.leadingKcal ? o.leadingKcal(date) : 0);

  let published = o.priorKcal + lead(start);
  const out: ExpenditurePoint[] = [];
  const n = daysBetween(start, end);

  for (let i = 0; i <= n; i++) {
    const date = addDays(start, i);

    // 1. Measurement update with this morning's weigh-in.
    const z = measured(date);
    if (z !== null && i > 0) {
      const S = P[0] + o.scaleSdKg ** 2;
      const innovation = z - W;
      if (Math.abs(innovation) <= OUTLIER_SDS * Math.sqrt(S)) {
        const k0 = P[0] / S;
        const k1 = P[2] / S;
        W += k0 * innovation;
        E += k1 * innovation;
        P = [(1 - k0) * P[0], (1 - k0) * P[1], P[2] - k1 * P[0], P[3] - k1 * P[1]];
      }
    }

    // 2. Publish, with guardrails. Days before tracking began don't count as missed.
    const m = lead(date);
    const raw = E + m;
    let unlogged = 0;
    for (let j = 0; j < Math.min(7, i + 1); j++) {
      if (!isKnownIntake(dayByDate.get(addDays(date, -j)))) unlogged++;
    }
    const paused = i > 0 && unlogged > o.maxUnloggedOf7;
    if (i > 0 && !paused) {
      const step = Math.max(-o.maxDailyChangeKcal, Math.min(o.maxDailyChangeKcal, raw - published));
      published += step;
    }
    out.push({ date, kcal: published, rawKcal: raw, sdKcal: Math.sqrt(P[3]), massKg: W, paused });

    // 3. Predict to tomorrow using today's intake.
    const day = dayByDate.get(date);
    let intake: number;
    let intakeVar: number;
    if (isKnownIntake(day)) {
      intake = intakeOf(day);
      intakeVar = (o.loggedIntakeCv * intake) ** 2;
    } else {
      intake = E + m; // assume maintenance
      intakeVar = o.unknownIntakeSdKcal ** 2;
    }
    const dW = (intake - E - m) / K;
    W += dW;
    E += c * dW;

    // F = [[1, -1/K], [0, 1 - c/K]]; Q = g gᵀ·intakeVar + diag(0, drift²), g = [1/K, c/K].
    const f01 = -1 / K;
    const f11 = 1 - c / K;
    const [p00, p01, p10, p11] = P;
    const a00 = p00 + f01 * p10;
    const a01 = p01 + f01 * p11;
    const a10 = f11 * p10;
    const a11 = f11 * p11;
    const g0 = 1 / K;
    const g1 = c / K;
    P = [
      a00 + a01 * f01 + g0 * g0 * intakeVar,
      a01 * f11 + g0 * g1 * intakeVar,
      a10 + a11 * f01 + g1 * g0 * intakeVar,
      a11 * f11 + g1 * g1 * intakeVar + o.driftSdKcal ** 2,
    ];
  }
  return out;
}
