/**
 * Micronutrient reports for a day or a run of days.
 *
 * Coverage matters: packaged foods often report only a few micronutrients,
 * so a low total may just mean missing data. Coverage is the share of the
 * day's calories that came from foods reporting that nutrient; below 50%
 * the nutrient is shown as "not enough data" instead of low.
 */
import { NUTRIENTS, type NutrientDef } from '@/db/nutrient-catalog';

import type { NutrientTarget } from './targets';

export type NutrientFlag = 'low' | 'ok' | 'high' | 'unknown' | 'none';

export interface NutrientLine {
  nutrient: NutrientDef;
  amount: number;
  target: NutrientTarget;
  /** amount ÷ target, or null without a target. */
  ofTarget: number | null;
  /** amount ÷ Daily Value, or null without one. */
  ofDailyValue: number | null;
  /** 0–1 share of calories from foods that report this nutrient. */
  coverage: number;
  flag: NutrientFlag;
}

export interface NutrientEntry {
  nutrients: Readonly<Record<string, number>>;
}

/** Nutrients reported as amounts of energy or macros are handled elsewhere. */
const EXCLUDED = new Set(['energy_kcal', 'fat_g', 'carbs_g', 'protein_g']);
export const MIN_COVERAGE = 0.5;
export const LOW_FRACTION = 0.7;

export function coverage(entries: readonly NutrientEntry[], nutrientId: string): number {
  const kcal = (e: NutrientEntry) => e.nutrients.energy_kcal ?? 0;
  const total = entries.reduce((s, e) => s + kcal(e), 0);
  if (total > 0) {
    return entries.filter((e) => e.nutrients[nutrientId] !== undefined).reduce((s, e) => s + kcal(e), 0) / total;
  }
  if (entries.length === 0) return 0;
  return entries.filter((e) => e.nutrients[nutrientId] !== undefined).length / entries.length;
}

function flagFor(amount: number, t: NutrientTarget, cov: number): NutrientFlag {
  if (t.target === undefined && t.upper === undefined) return 'none';
  if (t.upper !== undefined && !t.upperFromSupplementsOnly && amount > t.upper) return 'high';
  if (cov < MIN_COVERAGE) return 'unknown';
  if (t.target !== undefined && amount < LOW_FRACTION * t.target) return 'low';
  return 'ok';
}

/** The saturated fat Daily Value on Canadian labels covers saturated + trans fat. */
const DV_INCLUDES: Readonly<Record<string, readonly string[]>> = { sat_fat_g: ['trans_fat_g'] };

function line(
  nutrient: NutrientDef,
  amount: number,
  t: NutrientTarget,
  cov: number,
  dvAmount = amount,
): NutrientLine {
  return {
    nutrient,
    amount,
    target: t,
    ofTarget: t.target ? amount / t.target : null,
    ofDailyValue: t.dailyValue ? dvAmount / t.dailyValue : null,
    coverage: cov,
    flag: flagFor(amount, t, cov),
  };
}

function report(
  entries: readonly NutrientEntry[],
  days: number,
  targets: Readonly<Record<string, NutrientTarget>>,
): NutrientLine[] {
  const total = (id: string) => entries.reduce((s, e) => s + (e.nutrients[id] ?? 0), 0) / days;
  return NUTRIENTS.filter((n) => !EXCLUDED.has(n.id)).map((n) => {
    const amount = total(n.id);
    const dvAmount = (DV_INCLUDES[n.id] ?? []).reduce((s, id) => s + total(id), amount);
    return line(n, amount, targets[n.id] ?? {}, coverage(entries, n.id), dvAmount);
  });
}

/** One day's totals against targets, for every tracked micronutrient. */
export function dayReport(
  entries: readonly NutrientEntry[],
  targets: Readonly<Record<string, NutrientTarget>>,
): NutrientLine[] {
  return report(entries, 1, targets);
}

/** Average daily intake over several days (each day a list of entries). */
export function averageReport(
  days: readonly (readonly NutrientEntry[])[],
  targets: Readonly<Record<string, NutrientTarget>>,
): NutrientLine[] {
  return report(days.flat(), Math.max(1, days.length), targets);
}

/** Short plain-language notes shown under a nutrient's bar. */
export function lineNotes(l: NutrientLine): string[] {
  const notes: string[] = [];
  if (l.ofDailyValue !== null) notes.push(`${Math.round(l.ofDailyValue * 100)}% DV`);
  if (l.coverage < 0.95 && l.amount > 0) notes.push(`data for ${Math.round(l.coverage * 100)}% of calories`);
  if (l.flag === 'unknown') notes.push('not enough data');
  if (l.flag === 'high') notes.push(l.target.upperKind === 'CDRR' ? 'above the chronic-disease risk level' : 'above the upper limit');
  if (l.target.source === 'user') notes.push('your target');
  return notes;
}

/** Nutrients reliably below target, lowest first (for "consistently low" nudges). */
export function consistentlyLow(lines: readonly NutrientLine[], minCoverage = 0.6): NutrientLine[] {
  return lines
    .filter((l) => l.flag === 'low' && l.coverage >= minCoverage)
    .sort((a, b) => (a.ofTarget ?? 1) - (b.ofTarget ?? 1));
}
