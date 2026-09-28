/**
 * Recipes: foods (source 'recipe') whose nutrients come from their
 * ingredients. Nutrients are per 100 g of the finished dish, using the
 * cooked weight when given (cooking changes water, not nutrients).
 */
import type { SqlDriver } from '@/db/driver';

import { getFood, newSourceId, saveFood, type StoredFood } from './food-store';
import { CORE_MICROS } from './nutrient-mapping';
import { scaleNutrients } from './portion';
import type { FoodRecord } from './types';

export interface RecipeItem {
  foodId: number;
  /** Amount of the ingredient in its own basis units (g or mL). */
  amount: number;
}

export interface RecipeInput {
  name: string;
  items: readonly RecipeItem[];
  /** Weight of the finished dish in g; defaults to the sum of ingredients. */
  cookedWeight?: number | null;
  /** How many servings the recipe makes (adds a "1 serving" portion). */
  servings?: number | null;
}

export interface CombinedNutrients {
  per100: Record<string, number>;
  totalWeight: number;
  /** Share of core micronutrients known for every ingredient. */
  microCompleteness: number;
}

export function combineIngredients(
  parts: readonly { nutrients: Readonly<Record<string, number>>; amount: number }[],
  cookedWeight?: number | null,
): CombinedNutrients {
  const used = parts.filter((p) => p.amount > 0);
  if (used.length === 0) throw new RangeError('Add at least one ingredient.');
  const ingredientWeight = used.reduce((s, p) => s + p.amount, 0);
  const weight = cookedWeight && cookedWeight > 0 ? cookedWeight : ingredientWeight;

  const total: Record<string, number> = {};
  for (const p of used) {
    for (const [id, v] of Object.entries(scaleNutrients(p.nutrients, p.amount))) total[id] = (total[id] ?? 0) + v;
  }
  const per100 = Object.fromEntries(Object.entries(total).map(([id, v]) => [id, Number(((v * 100) / weight).toPrecision(6))]));
  // A micronutrient counts as known only if every ingredient reports it.
  const known = CORE_MICROS.filter((id) => used.every((p) => p.nutrients[id] !== undefined)).length;
  return { per100, totalWeight: weight, microCompleteness: Math.round((known / CORE_MICROS.length) * 100) / 100 };
}

/** Creates or updates a recipe. Returns the recipe's food id. */
export async function saveRecipe(db: SqlDriver, input: RecipeInput, recipeFoodId?: number): Promise<number> {
  const name = input.name.replace(/\s+/g, ' ').trim();
  if (!name) throw new RangeError('Give the recipe a name.');
  const ingredients: { food: StoredFood; amount: number }[] = [];
  for (const item of input.items) {
    const food = await getFood(db, item.foodId);
    if (!food) throw new Error('An ingredient no longer exists.');
    if (food.id === recipeFoodId) throw new RangeError('A recipe can’t contain itself.');
    ingredients.push({ food, amount: item.amount });
  }
  const combined = combineIngredients(
    ingredients.map((i) => ({ nutrients: i.food.nutrients, amount: i.amount })),
    input.cookedWeight,
  );

  const existing = recipeFoodId ? await getFood(db, recipeFoodId) : null;
  const servings = input.servings && input.servings > 0 ? input.servings : null;
  const record: FoodRecord = {
    source: 'recipe',
    sourceId: existing?.sourceId ?? newSourceId('recipe'),
    name,
    brand: null,
    region: 'CA',
    basis: 'g',
    nutrients: combined.per100,
    servings: servings ? [{ label: '1 serving', amount: Number((combined.totalWeight / servings).toFixed(1)) }] : [],
    barcodes: [],
    microCompleteness: combined.microCompleteness,
  };
  const id = await saveFood(db, record);
  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM recipe_items WHERE recipe_food_id = ?', [id]);
    for (const [i, item] of ingredients.entries()) {
      await tx.run('INSERT INTO recipe_items (recipe_food_id, position, food_id, amount) VALUES (?, ?, ?, ?)', [
        id,
        i,
        item.food.id,
        item.amount,
      ]);
    }
    await tx.run('INSERT OR REPLACE INTO recipes (food_id, cooked_weight, servings) VALUES (?, ?, ?)', [
      id,
      input.cookedWeight && input.cookedWeight > 0 ? input.cookedWeight : null,
      servings,
    ]);
  });
  return id;
}

export interface LoadedRecipe {
  food: StoredFood;
  items: { food: StoredFood; amount: number }[];
  cookedWeight: number | null;
  servings: number | null;
}

export async function loadRecipe(db: SqlDriver, foodId: number): Promise<LoadedRecipe | null> {
  const food = await getFood(db, foodId);
  if (!food || food.source !== 'recipe') return null;
  const meta = await db.get<{ cooked_weight: number | null; servings: number | null }>(
    'SELECT cooked_weight, servings FROM recipes WHERE food_id = ?',
    [foodId],
  );
  const rows = await db.all<{ food_id: number; amount: number }>(
    'SELECT food_id, amount FROM recipe_items WHERE recipe_food_id = ? ORDER BY position',
    [foodId],
  );
  const items: LoadedRecipe['items'] = [];
  for (const r of rows) {
    const ingredient = await getFood(db, r.food_id);
    if (ingredient) items.push({ food: ingredient, amount: r.amount });
  }
  return { food, items, cookedWeight: meta?.cooked_weight ?? null, servings: meta?.servings ?? null };
}
