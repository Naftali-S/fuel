/**
 * Personal micronutrient targets from Health Canada's DRIs (by sex and age),
 * with the user's own overrides on top. When sex is not specified, the
 * higher recommended amount and the lower upper limit of the two are used.
 */
import type { MetabolicSex } from '@/engine/energy';

import { AGE_BANDS, DAILY_VALUES, DRI, type AgeBand, type DriRow, type UpperKind } from './reference-values';

export interface NutrientTarget {
  /** Amount to aim for per day. */
  target?: number;
  /** Where the target comes from. */
  source?: 'RDA' | 'AI' | 'user';
  /** Amount not to exceed per day. */
  upper?: number;
  upperKind?: UpperKind | 'user';
  /** The upper limit counts supplements/fortificants only, so food totals aren't judged against it. */
  upperFromSupplementsOnly?: boolean;
  /** % Daily Value basis from the Canadian Nutrition Facts table. */
  dailyValue?: number;
}

export function ageBand(ageYears: number | null | undefined): AgeBand {
  if (ageYears === null || ageYears === undefined || !Number.isFinite(ageYears)) return '31-50';
  if (ageYears < 31) return '19-30';
  if (ageYears < 51) return '31-50';
  if (ageYears < 71) return '51-70';
  return '71+';
}

function pick(v: DriRow['male'], band: AgeBand): number {
  return typeof v === 'number' ? v : v[AGE_BANDS.indexOf(band)];
}

/** Targets for every nutrient with a DRI or Daily Value. */
export function referenceTargets(sex: MetabolicSex, ageYears: number | null): Record<string, NutrientTarget> {
  const band = ageBand(ageYears);
  const out: Record<string, NutrientTarget> = {};
  for (const [id, dv] of Object.entries(DAILY_VALUES)) out[id] = { dailyValue: dv };
  for (const [id, row] of Object.entries(DRI)) {
    const m = pick(row.male, band);
    const f = pick(row.female, band);
    const target = sex === 'male' ? m : sex === 'female' ? f : Math.max(m, f);
    const upper = row.upper === undefined ? undefined : pick(row.upper, band);
    out[id] = {
      ...out[id],
      target,
      source: row.kind,
      ...(upper !== undefined && {
        upper,
        upperKind: row.upperKind ?? 'UL',
        upperFromSupplementsOnly: row.upperFromSupplementsOnly ?? false,
      }),
    };
  }
  return out;
}

export interface TargetOverride {
  nutrientId: string;
  min: number | null;
  max: number | null;
}

/** The user's own targets replace the reference ones for those nutrients. */
export function applyOverrides(
  targets: Readonly<Record<string, NutrientTarget>>,
  overrides: readonly TargetOverride[],
): Record<string, NutrientTarget> {
  const out: Record<string, NutrientTarget> = { ...targets };
  for (const o of overrides) {
    const base: NutrientTarget = { ...out[o.nutrientId] };
    if (o.min !== null) {
      base.target = o.min;
      base.source = 'user';
    }
    if (o.max !== null) {
      base.upper = o.max;
      base.upperKind = 'user';
      base.upperFromSupplementsOnly = false;
    }
    out[o.nutrientId] = base;
  }
  return out;
}
