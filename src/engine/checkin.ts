/**
 * Weekly check-in: ties trend weight, adaptive expenditure, training/step
 * modifiers, strength trend and the goal into new calorie and macro targets.
 * Pure: callers load data from storage and persist the result.
 */
import { addDays, daysBetween, type IsoDate } from './dates';
import { basalMetabolicRate, priorExpenditure, type Profile } from './energy';
import { estimateExpenditure, type DayIntake } from './expenditure';
import { dailyTrainingKcal, leadingAdjustment, stepsNetKcal, type WorkoutSummary } from './modifiers';
import { strengthChange, strengthSignal, type LiftSet, type StrengthChange, type StrengthSignal } from './strength';
import {
  calorieTarget,
  DEFAULT_MACRO_PREFS,
  macroTargets,
  type CalorieTarget,
  type Goal,
  type MacroPrefs,
  type Macros,
  type TargetFlag,
} from './targets';
import { computeTrend, trendAt, type WeighIn } from './trend';

export interface StepDay {
  date: IsoDate;
  count: number;
}

export interface CheckinInput {
  today: IsoDate;
  profile: Profile;
  goal: Goal;
  weighIns: readonly WeighIn[];
  days: readonly DayIntake[];
  workouts?: readonly WorkoutSummary[];
  steps?: readonly StepDay[];
  liftSets?: readonly LiftSet[];
  previousTargetKcal?: number;
  macroPrefs?: MacroPrefs;
  allowLargeChange?: boolean;
}

export type CoachNote = TargetFlag | StrengthSignal | 'expenditure-paused' | 'early-estimate';

export interface CheckinResult {
  date: IsoDate;
  trendKg: number;
  /** Trend change over the last 14 days, % body weight per week. */
  observedRatePctPerWeek: number | null;
  expenditureKcal: number;
  expenditureSdKcal: number;
  /** Training + steps modifier included in expenditure today. */
  leadingKcal: number;
  target: CalorieTarget;
  macros: Macros;
  strength: StrengthChange | null;
  notes: CoachNote[];
}

/** Days of logged data before the estimate is considered settled. */
const SETTLED_DAYS = 14;

export function runCheckin(input: CheckinInput): CheckinResult | null {
  const { today, profile } = input;
  const weighIns = input.weighIns.filter((w) => w.date <= today);
  const days = input.days.filter((d) => d.date <= today);
  if (weighIns.length === 0) return null;

  const trend = computeTrend(weighIns, { through: today });
  const trendKg = trendAt(trend, today)!;
  const twoWeeksAgo = trendAt(trend, addDays(today, -14));
  const observedRatePctPerWeek = twoWeeksAgo ? ((trendKg - twoWeeksAgo) / twoWeeksAgo) * 50 : null;

  const first = trend[0];
  const priorKcal = priorExpenditure(profile, first.weighedKg ?? first.trendKg, first.date);

  const leadingKcal = buildLeading(input, trendKg);
  const series = estimateExpenditure(weighIns, days, { priorKcal, leadingKcal });
  const point = series.find((p) => p.date === today) ?? series[series.length - 1];

  const recent = days.filter(
    (d) => d.status === 'complete' && d.kcal !== null && daysBetween(d.date, today) < 7,
  );
  const recentIntakeKcal =
    recent.length >= 4 ? recent.reduce((s, d) => s + (d.kcal ?? 0), 0) / recent.length : undefined;

  const target = calorieTarget({
    expenditureKcal: point.kcal,
    trendKg,
    goal: input.goal,
    bmrKcal: basalMetabolicRate(profile, trendKg, today),
    recentIntakeKcal,
    previousKcal: input.previousTargetKcal,
    allowLargeChange: input.allowLargeChange,
  });

  const macros = macroTargets(target.kcal, proteinBasisKg(profile, trendKg), input.macroPrefs ?? DEFAULT_MACRO_PREFS);
  const strength = input.liftSets ? strengthChange(input.liftSets, today) : null;

  const notes: CoachNote[] = [...target.flags];
  if (point.paused) notes.push('expenditure-paused');
  const loggedDays = days.filter((d) => d.status === 'complete' || d.status === 'fasting').length;
  if (loggedDays < SETTLED_DAYS) notes.push('early-estimate');
  const signal = strengthSignal(strength, target.ratePctPerWeek, observedRatePctPerWeek ?? 0);
  if (signal) notes.push(signal);

  return {
    date: today,
    trendKg,
    observedRatePctPerWeek,
    expenditureKcal: point.kcal,
    expenditureSdKcal: point.sdKcal,
    leadingKcal: leadingKcal(today),
    target,
    macros,
    strength,
    notes,
  };
}

/** Protein is based on scale weight, or on weight at 15% body fat when that is lower. */
function proteinBasisKg(profile: Profile, trendKg: number): number {
  const bf = profile.bodyFatPct;
  if (bf === undefined || bf <= 0 || bf >= 70) return trendKg;
  return Math.min(trendKg, (trendKg * (1 - bf / 100)) / 0.85);
}

function buildLeading(input: CheckinInput, bodyKg: number): (date: IsoDate) => number {
  const parts: ((date: IsoDate) => number)[] = [];
  if (input.workouts && input.workouts.length > 0) {
    const training = dailyTrainingKcal(input.workouts, bodyKg);
    const historyStart = [...training.keys()].sort()[0];
    parts.push((d) => leadingAdjustment(training, d, { historyStart, missingIsZero: true }));
  }
  if (input.steps && input.steps.length > 0) {
    const steps = new Map(input.steps.map((s) => [s.date, stepsNetKcal(s.count, bodyKg)]));
    const historyStart = [...steps.keys()].sort()[0];
    parts.push((d) => leadingAdjustment(steps, d, { historyStart, missingIsZero: false }));
  }
  return (date) => parts.reduce((sum, f) => sum + f(date), 0);
}
