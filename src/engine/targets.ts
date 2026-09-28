/**
 * Calorie and macro targets from estimated expenditure and a goal.
 *
 * Calories: expenditure + the energy for the goal rate of change, with
 * guardrails (rate limits, a BMR-based floor, a cap on week-to-week change).
 * The thermic effect of food (~10% of intake) shifts with intake, so the
 * target is solved so the planned rate still holds after that shift.
 *
 * Macros: protein by body weight, a fat minimum (by weight and % of energy),
 * carbohydrate fills the rest (Atwater 4/9/4).
 */
import { KCAL_PER_KG } from './energy';

export type GoalKind = 'lose' | 'maintain' | 'gain';

export interface Goal {
  kind: GoalKind;
  /** Planned change, % of body weight per week (negative to lose). */
  ratePctPerWeek: number;
  /** Optional goal weight; the rate goes to 0 once it is reached. */
  targetKg?: number;
}

export const RATE_LIMITS = { minPctPerWeek: -1, maxPctPerWeek: 0.5 } as const;
export const MIN_CALORIE_FLOOR = 1200;
export const DEFAULT_MAX_CHANGE_KCAL = 200;
const TEF_FRACTION = 0.1;

export type TargetFlag = 'goal-reached' | 'rate-capped' | 'floor' | 'change-capped';

export interface CalorieTargetInput {
  expenditureKcal: number;
  trendKg: number;
  goal: Goal;
  bmrKcal: number;
  /** Average logged intake of recent complete days (defaults to expenditure). */
  recentIntakeKcal?: number;
  /** Last published target; limits the size of the change. */
  previousKcal?: number;
  maxChangeKcal?: number;
  /** Skip the week-to-week change cap (user override). */
  allowLargeChange?: boolean;
}

export interface CalorieTarget {
  kcal: number;
  /** Rate actually planned after limits, % body weight per week. */
  ratePctPerWeek: number;
  flags: TargetFlag[];
}

export function effectiveRate(goal: Goal, trendKg: number): { rate: number; flags: TargetFlag[] } {
  const flags: TargetFlag[] = [];
  if (goal.kind === 'maintain') return { rate: 0, flags };
  let rate = goal.ratePctPerWeek;
  if (goal.kind === 'lose') rate = -Math.abs(rate);
  if (goal.kind === 'gain') rate = Math.abs(rate);
  if (goal.targetKg !== undefined) {
    const reached = goal.kind === 'lose' ? trendKg <= goal.targetKg : trendKg >= goal.targetKg;
    if (reached) return { rate: 0, flags: ['goal-reached'] };
  }
  const capped = Math.max(RATE_LIMITS.minPctPerWeek, Math.min(RATE_LIMITS.maxPctPerWeek, rate));
  if (capped !== rate) flags.push('rate-capped');
  return { rate: capped, flags };
}

export function calorieTarget(input: CalorieTargetInput): CalorieTarget {
  const { rate, flags } = effectiveRate(input.goal, input.trendKg);
  const E = input.expenditureKcal;
  const recent = input.recentIntakeKcal ?? E;
  const balance = ((rate / 100) * input.trendKg * KCAL_PER_KG) / 7;
  // Solve I = E + TEF·(I − recent) + balance for intake I.
  let kcal = (E - TEF_FRACTION * recent + balance) / (1 - TEF_FRACTION);

  const maxChange = input.maxChangeKcal ?? DEFAULT_MAX_CHANGE_KCAL;
  if (input.previousKcal !== undefined && !input.allowLargeChange) {
    const lo = input.previousKcal - maxChange;
    const hi = input.previousKcal + maxChange;
    if (kcal < lo || kcal > hi) {
      kcal = Math.max(lo, Math.min(hi, kcal));
      flags.push('change-capped');
    }
  }
  const floor = Math.max(MIN_CALORIE_FLOOR, input.bmrKcal);
  if (kcal < floor) {
    kcal = floor;
    flags.push('floor');
  }
  return { kcal: Math.round(kcal / 10) * 10, ratePctPerWeek: rate, flags };
}

export interface MacroPrefs {
  proteinGPerKg: number;
  fatMinGPerKg: number;
  /** Preferred share of energy from fat (also the minimum is 20%). */
  fatPct: number;
}

export const DEFAULT_MACRO_PREFS: MacroPrefs = { proteinGPerKg: 2.0, fatMinGPerKg: 0.7, fatPct: 0.25 };
const MIN_FAT_PCT = 0.2;
const MIN_PROTEIN_G_PER_KG = 1.6;

export interface Macros {
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/**
 * Macro grams for a calorie target. `proteinBasisKg` lets the caller use a
 * reference weight (e.g. lean-mass based) instead of scale weight.
 */
export function macroTargets(kcal: number, proteinBasisKg: number, prefs: MacroPrefs = DEFAULT_MACRO_PREFS): Macros {
  let protein = prefs.proteinGPerKg * proteinBasisKg;
  const fatFloor = Math.max(prefs.fatMinGPerKg * proteinBasisKg, (MIN_FAT_PCT * kcal) / 9);
  let fat = Math.max(fatFloor, (prefs.fatPct * kcal) / 9);
  let carbs = (kcal - 4 * protein - 9 * fat) / 4;

  if (carbs < 0) {
    // Very low targets: trim fat to its floor, then protein to its floor.
    fat = fatFloor;
    carbs = (kcal - 4 * protein - 9 * fat) / 4;
    if (carbs < 0) {
      protein = Math.max(MIN_PROTEIN_G_PER_KG * proteinBasisKg, (kcal - 9 * fat) / 4);
      carbs = Math.max(0, (kcal - 4 * protein - 9 * fat) / 4);
    }
  }
  return { kcal, proteinG: Math.round(protein), fatG: Math.round(fat), carbsG: Math.round(carbs) };
}

/**
 * Moves carbohydrate toward training days while keeping the weekly total.
 * `shift` is the fraction of a rest day's carbs moved away (0–0.5).
 */
export function distributeCarbs(daily: Macros, trainingDays: readonly boolean[], shift = 0.15): Macros[] {
  const nTrain = trainingDays.filter(Boolean).length;
  const nRest = trainingDays.length - nTrain;
  if (nTrain === 0 || nRest === 0 || shift <= 0) return trainingDays.map(() => ({ ...daily }));
  const moved = daily.carbsG * Math.min(shift, 0.5);
  const restCarbs = daily.carbsG - moved;
  const trainCarbs = daily.carbsG + (moved * nRest) / nTrain;
  return trainingDays.map((t) => {
    const carbsG = Math.round(t ? trainCarbs : restCarbs);
    return { ...daily, carbsG, kcal: daily.kcal + 4 * (carbsG - daily.carbsG) };
  });
}
