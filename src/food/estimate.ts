/**
 * Filling a food's missing micronutrients from a similar reference food
 * (usually its Canadian Nutrient File counterpart). Label values are never
 * overwritten; only absent nutrients are added, and they stay marked as
 * estimates so the app can say so.
 */
import { microCompleteness } from './nutrient-mapping';
import type { FoodRecord } from './types';

/** Label nutrients are always taken from the food itself. */
const NEVER_ESTIMATE = new Set(['energy_kcal', 'fat_g', 'carbs_g', 'protein_g']);

export function fillMissingNutrients(food: FoodRecord, reference: Pick<FoodRecord, 'nutrients'>): FoodRecord {
  const nutrients = { ...food.nutrients };
  const estimated = new Set(food.estimated ?? []);
  for (const [id, value] of Object.entries(reference.nutrients)) {
    if (NEVER_ESTIMATE.has(id) || nutrients[id] !== undefined) continue;
    nutrients[id] = value;
    estimated.add(id);
  }
  return {
    ...food,
    nutrients,
    estimated: [...estimated].sort(),
    microCompleteness: microCompleteness(nutrients),
  };
}

/** Removes previously estimated values, restoring the food's own data. */
export function clearEstimates(food: FoodRecord): FoodRecord {
  const drop = new Set(food.estimated ?? []);
  const nutrients = Object.fromEntries(Object.entries(food.nutrients).filter(([id]) => !drop.has(id)));
  return { ...food, nutrients, estimated: [], microCompleteness: microCompleteness(nutrients) };
}
