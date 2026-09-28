/**
 * Storage and lookups for micronutrient tracking: the user's target
 * overrides, targets for their profile, entries over a date range, and
 * good food sources from the Canadian Nutrient File.
 */
import type { SqlDriver } from '@/db/driver';
import { NUTRIENTS } from '@/db/nutrient-catalog';
import { ageOn, type Profile } from '@/engine/energy';
import type { IsoDate } from '@/engine/dates';
import type { Serving } from '@/food/types';

import { applyOverrides, referenceTargets, type NutrientTarget, type TargetOverride } from './targets';

const KNOWN = new Set(NUTRIENTS.map((n) => n.id));

export async function loadOverrides(db: SqlDriver): Promise<TargetOverride[]> {
  const rows = await db.all<{ nutrient_id: string; min_amount: number | null; max_amount: number | null }>(
    "SELECT nutrient_id, min_amount, max_amount FROM nutrient_targets WHERE source = 'user'",
  );
  return rows.map((r) => ({ nutrientId: r.nutrient_id, min: r.min_amount, max: r.max_amount }));
}

/** Sets the user's own daily target for a nutrient; null clears it (back to Health Canada's). */
export async function setOverride(db: SqlDriver, nutrientId: string, min: number | null): Promise<void> {
  if (!KNOWN.has(nutrientId)) throw new RangeError(`Unknown nutrient ${nutrientId}.`);
  if (min === null) {
    await db.run('DELETE FROM nutrient_targets WHERE nutrient_id = ?', [nutrientId]);
    return;
  }
  if (!(min > 0) || !Number.isFinite(min)) throw new RangeError('A target must be greater than zero.');
  await db.run(
    "INSERT OR REPLACE INTO nutrient_targets (nutrient_id, min_amount, max_amount, source) VALUES (?, ?, NULL, 'user')",
    [nutrientId, min],
  );
}

/** Targets for this person: DRIs for their sex and age, then their own overrides. */
export async function personalTargets(
  db: SqlDriver,
  profile: Profile | null,
  today: IsoDate,
): Promise<Record<string, NutrientTarget>> {
  const base = referenceTargets(profile?.sex ?? 'unspecified', profile ? ageOn(profile.birthDate, today) : null);
  return applyOverrides(base, await loadOverrides(db));
}

/** Log entries per date from `from` to `to` (dates with no entries are omitted). */
export async function entriesByDate(
  db: SqlDriver,
  from: IsoDate,
  to: IsoDate,
): Promise<Map<IsoDate, { nutrients: Record<string, number> }[]>> {
  const rows = await db.all<{ date: string; nutrients: string }>(
    'SELECT date, nutrients FROM log_entries WHERE date BETWEEN ? AND ? ORDER BY date',
    [from, to],
  );
  const out = new Map<IsoDate, { nutrients: Record<string, number> }[]>();
  for (const r of rows) {
    const list = out.get(r.date) ?? [];
    list.push({ nutrients: JSON.parse(r.nutrients) as Record<string, number> });
    out.set(r.date, list);
  }
  return out;
}

export interface FoodSource {
  name: string;
  portion: Serving;
  /** Nutrient amount in that portion. */
  amount: number;
  kcal: number;
}

/** Categories and ingredients that aren't sensible "eat more of this" advice. */
const SKIP_CATEGORIES = ['Spices and Herbs', 'Babyfoods', 'Fats and Oils', 'Soups, Sauces and Gravies'];
const SKIP_NAMES =
  /leavening|baking powder|cream of tartar|tablets?\b|\bblood\b|spleen|\bnative\b|cod liver|soy sauce|\bdry\b|dried|powder|flour|crude/i;
const PORTION_GRAMS = [30, 350] as const;
const MAX_PORTION_KCAL = 450;

/**
 * Everyday foods from a reference database that give the most of a
 * nutrient in one realistic serving, drawn from the foods richest in it per
 * calorie. Near-duplicates ("Salmon, …, raw" vs "…, baked") collapse.
 */
export async function bestSources(ref: SqlDriver, nutrientId: string, limit = 5): Promise<FoodSource[]> {
  if (!KNOWN.has(nutrientId)) return [];
  const path = `$.${nutrientId}`;
  const rows = await ref.all<{ name: string; nutrients: string; servings: string }>(
    `SELECT name, nutrients, servings FROM foods
      WHERE json_extract(nutrients, ?) > 0
        AND json_extract(nutrients, '$.energy_kcal') >= 15
        AND ifnull(category, '') NOT IN (${SKIP_CATEGORIES.map(() => '?').join(', ')})
      ORDER BY 1.0 * json_extract(nutrients, ?) / json_extract(nutrients, '$.energy_kcal') DESC
      LIMIT 250`,
    [path, ...SKIP_CATEGORIES, path],
  );
  const candidates: FoodSource[] = [];
  for (const r of rows) {
    if (SKIP_NAMES.test(r.name)) continue;
    const n = JSON.parse(r.nutrients) as Record<string, number>;
    const servings = JSON.parse(r.servings) as Serving[];
    const portion = servings.find((s) => s.amount >= PORTION_GRAMS[0] && s.amount <= PORTION_GRAMS[1]);
    if (!portion) continue;
    const kcal = (n.energy_kcal * portion.amount) / 100;
    if (kcal > MAX_PORTION_KCAL) continue;
    candidates.push({ name: r.name, portion, amount: (n[nutrientId] * portion.amount) / 100, kcal });
  }
  candidates.sort((a, b) => b.amount - a.amount);
  const seen = new Set<string>();
  const out: FoodSource[] = [];
  for (const c of candidates) {
    const key = c.name.toLowerCase().split(',').slice(0, 2).join(',').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
