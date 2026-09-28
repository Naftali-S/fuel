/**
 * Leading expenditure modifiers from training (Hevy) and steps.
 *
 * The expenditure filter already learns the *average* cost of your routine
 * from weight and intake. These modifiers only add the *departure* of the
 * last week from your own longer baseline, scaled by a gain < 1, so a
 * harder-than-usual week shows up early without being counted twice.
 * With a steady routine they are ~0.
 *
 * Energy costs:
 * - Resistance training ≈ 3.5–6 METs (Compendium of Physical Activities);
 *   kcal/min = MET × 3.5 × kg / 200 (ACSM). Net cost subtracts 1 MET (rest).
 * - Walking ≈ 0.0005 × body mass (kg) net kcal per step.
 */
import { addDays, daysBetween, type IsoDate } from './dates';

export interface WorkoutSummary {
  date: IsoDate;
  durationMin: number;
  /** Working sets (warm-ups excluded). */
  workingSets: number;
}

export const RESISTANCE_MET = 5;
const MET_RANGE = [3.5, 6] as const;
const DENSITY_RANGE = [0.75, 1.25] as const;
const NET_KCAL_PER_STEP_PER_KG = 0.0005;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Median working sets per minute across workouts, or undefined when none qualify. */
export function baselineSetsPerMinute(workouts: readonly WorkoutSummary[]): number | undefined {
  const densities = workouts
    .filter((w) => w.durationMin >= 10 && w.workingSets > 0)
    .map((w) => w.workingSets / w.durationMin)
    .sort((a, b) => a - b);
  if (densities.length === 0) return undefined;
  const mid = densities.length >> 1;
  return densities.length % 2 ? densities[mid] : (densities[mid - 1] + densities[mid]) / 2;
}

/** Net energy of one lifting session above resting, kcal. */
export function workoutNetKcal(w: WorkoutSummary, bodyKg: number, baselineSetsPerMin?: number): number {
  const minutes = clamp(w.durationMin, 0, 240);
  if (minutes === 0) return 0;
  const density = w.workingSets / minutes;
  const factor = baselineSetsPerMin ? clamp(density / baselineSetsPerMin, ...DENSITY_RANGE) : 1;
  const met = clamp(RESISTANCE_MET * factor, ...MET_RANGE);
  return minutes * ((met - 1) * 3.5 * bodyKg) / 200;
}

/** Net training energy per calendar day, kcal. */
export function dailyTrainingKcal(workouts: readonly WorkoutSummary[], bodyKg: number): Map<IsoDate, number> {
  const baseline = baselineSetsPerMinute(workouts);
  const out = new Map<IsoDate, number>();
  for (const w of workouts) {
    out.set(w.date, (out.get(w.date) ?? 0) + workoutNetKcal(w, bodyKg, baseline));
  }
  return out;
}

export function stepsNetKcal(steps: number, bodyKg: number): number {
  return Math.max(0, steps) * NET_KCAL_PER_STEP_PER_KG * bodyKg;
}

export interface LeadingOptions {
  /** First day this data source existed; earlier days are ignored. */
  historyStart: IsoDate;
  /** Treat days without a value as 0 (training) instead of unknown (steps). */
  missingIsZero: boolean;
  shortDays?: number;
  baselineDays?: number;
  /** Fraction of the departure passed through (0–1). */
  gain?: number;
  /** Days of history needed before any modifier is applied. */
  minHistoryDays?: number;
}

function windowMean(
  values: ReadonlyMap<IsoDate, number>,
  end: IsoDate,
  days: number,
  historyStart: IsoDate,
  missingIsZero: boolean,
): number | undefined {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < days; i++) {
    const d = addDays(end, -i);
    if (d < historyStart) break;
    const v = values.get(d);
    if (v !== undefined) {
      sum += v;
      n++;
    } else if (missingIsZero) {
      n++;
    }
  }
  return n > 0 ? sum / n : undefined;
}

/** Short-window minus baseline-window daily mean, times the gain, kcal/day. */
export function leadingAdjustment(values: ReadonlyMap<IsoDate, number>, date: IsoDate, o: LeadingOptions): number {
  const shortDays = o.shortDays ?? 7;
  const baselineDays = o.baselineDays ?? 28;
  const gain = o.gain ?? 0.5;
  if (daysBetween(o.historyStart, date) + 1 < (o.minHistoryDays ?? 14)) return 0;
  const recent = windowMean(values, date, shortDays, o.historyStart, o.missingIsZero);
  const baseline = windowMean(values, date, baselineDays, o.historyStart, o.missingIsZero);
  if (recent === undefined || baseline === undefined) return 0;
  return gain * (recent - baseline);
}
