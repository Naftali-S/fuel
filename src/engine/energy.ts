/**
 * Resting and starting energy estimates from published equations:
 * - Mifflin MD, St Jeor ST, et al. Am J Clin Nutr. 1990;51(2):241-247.
 * - Katch-McArdle (370 + 21.6 × lean mass), used when body fat % is known.
 */
import { daysBetween, type IsoDate } from './dates';

/** Energy stored in 1 kg of body mass change (mixed tissue), kcal. */
export const KCAL_PER_KG = 7700;

/** Sex used by the metabolic equations; 'unspecified' uses the midpoint. */
export type MetabolicSex = 'male' | 'female' | 'unspecified';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'very_high';

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  very_high: 1.9,
};

export interface Profile {
  sex: MetabolicSex;
  birthDate: IsoDate;
  heightCm: number;
  activity: ActivityLevel;
  /** Optional body fat percentage (0–70). Enables Katch-McArdle. */
  bodyFatPct?: number;
}

const SEX_CONSTANT: Record<MetabolicSex, number> = { male: 5, female: -161, unspecified: -78 };

export function ageOn(birthDate: IsoDate, on: IsoDate): number {
  return daysBetween(birthDate, on) / 365.2425;
}

export function mifflinStJeor(sex: MetabolicSex, weightKg: number, heightCm: number, ageYears: number): number {
  return 10 * weightKg + 6.25 * heightCm - 5 * ageYears + SEX_CONSTANT[sex];
}

export function katchMcArdle(leanMassKg: number): number {
  return 370 + 21.6 * leanMassKg;
}

/** Basal metabolic rate, kcal/day. */
export function basalMetabolicRate(profile: Profile, weightKg: number, on: IsoDate): number {
  const bf = profile.bodyFatPct;
  if (bf !== undefined && bf > 0 && bf < 70) {
    return katchMcArdle(weightKg * (1 - bf / 100));
  }
  return mifflinStJeor(profile.sex, weightKg, profile.heightCm, ageOn(profile.birthDate, on));
}

/** Equation-based total daily expenditure used before logged data exists. */
export function priorExpenditure(profile: Profile, weightKg: number, on: IsoDate): number {
  return basalMetabolicRate(profile, weightKg, on) * ACTIVITY_FACTORS[profile.activity];
}
