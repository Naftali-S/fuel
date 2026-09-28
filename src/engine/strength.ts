/**
 * Strength trend from logged lifting sets (Hevy).
 *
 * Estimated one-rep max uses the Epley formula, w × (1 + reps/30), with reps
 * in reserve added from RPE (reps + (10 − RPE)). Only sets of 1–12 reps are
 * used; higher-rep sets predict a max poorly.
 */
import { addDays, type IsoDate } from './dates';

export type SetType = 'normal' | 'warmup' | 'failure' | 'dropset';

export interface LiftSet {
  date: IsoDate;
  exerciseId: string;
  weightKg: number | null;
  reps: number | null;
  rpe?: number | null;
  setType?: SetType;
}

export function estimatedOneRepMax(weightKg: number | null, reps: number | null, rpe?: number | null): number | null {
  if (weightKg === null || reps === null || !(weightKg > 0) || !(reps >= 1) || reps > 12) return null;
  const rir = rpe != null && rpe >= 6 && rpe <= 10 ? 10 - rpe : 0;
  const effective = reps + rir;
  return effective === 1 ? weightKg : weightKg * (1 + effective / 30);
}

function bestByExercise(sets: readonly LiftSet[], from: IsoDate, to: IsoDate): Map<string, number> {
  const best = new Map<string, number>();
  for (const s of sets) {
    if (s.date < from || s.date > to || s.setType === 'warmup') continue;
    const e = estimatedOneRepMax(s.weightKg, s.reps, s.rpe);
    if (e !== null && e > (best.get(s.exerciseId) ?? 0)) best.set(s.exerciseId, e);
  }
  return best;
}

export interface StrengthChange {
  /** Median % change of best e1RM across exercises done in both windows. */
  changePct: number;
  exercises: number;
}

/**
 * Compares the best estimated max per exercise in the last `windowDays`
 * against the same-length window `lookbackDays` earlier.
 */
export function strengthChange(
  sets: readonly LiftSet[],
  endDate: IsoDate,
  { windowDays = 14, lookbackDays = 21, minExercises = 2 } = {},
): StrengthChange | null {
  const recent = bestByExercise(sets, addDays(endDate, -(windowDays - 1)), endDate);
  const earlierEnd = addDays(endDate, -lookbackDays);
  const earlier = bestByExercise(sets, addDays(earlierEnd, -(windowDays - 1)), earlierEnd);
  const changes: number[] = [];
  for (const [id, now] of recent) {
    const before = earlier.get(id);
    if (before) changes.push((now / before - 1) * 100);
  }
  if (changes.length < minExercises) return null;
  changes.sort((a, b) => a - b);
  const mid = changes.length >> 1;
  const median = changes.length % 2 ? changes[mid] : (changes[mid - 1] + changes[mid]) / 2;
  return { changePct: median, exercises: changes.length };
}

export type StrengthSignal = 'strength-drop-cutting' | 'bulk-without-strength';

/**
 * Coaching signal: strength falling on a cut (suggest a slower rate or a
 * diet break) or fast gain without strength progress (suggest a smaller surplus).
 */
export function strengthSignal(
  change: StrengthChange | null,
  plannedRatePctPerWeek: number,
  observedRatePctPerWeek: number,
): StrengthSignal | null {
  if (!change) return null;
  if (plannedRatePctPerWeek < 0 && change.changePct < -3) return 'strength-drop-cutting';
  if (plannedRatePctPerWeek > 0 && observedRatePctPerWeek > 0.5 && change.changePct < 1) return 'bulk-without-strength';
  return null;
}
