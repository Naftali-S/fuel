import { migrate } from '@/db/migrations';
import { openMemoryDriver, type TestDriver } from '@/db/testing/node-sqlite-driver';

import { getFood, saveFood } from './food-store';
import { labelToFoodRecord, labelValues, parseDecimal } from './label';
import { combineIngredients, loadRecipe, saveRecipe } from './recipe';
import type { FoodRecord } from './types';

describe('parseDecimal', () => {
  it('accepts English and French decimals', () => {
    expect(parseDecimal('1.5')).toBe(1.5);
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal(' 12 ')).toBe(12);
    expect(parseDecimal('.5')).toBe(0.5);
    expect(parseDecimal('')).toBeUndefined();
    expect(parseDecimal('-3')).toBeNaN();
    expect(parseDecimal('1.2.3')).toBeNaN();
  });
});

describe('labelToFoodRecord', () => {
  const input = {
    name: '  Greek   yogurt ',
    brand: 'Local Dairy',
    basis: 'g' as const,
    servingLabel: '3/4 cup (175 g)',
    servingAmount: 175,
    values: { energy_kcal: 140, protein_g: 17.5, fat_g: 3.5, sodium_mg: 70, calcium_mg: undefined },
    barcode: '077544827004',
  };

  it('converts per-serving label values to per 100 g', () => {
    const f = labelToFoodRecord(input, 'user-1');
    expect(f).toMatchObject({
      source: 'user',
      sourceId: 'user-1',
      name: 'Greek yogurt',
      brand: 'Local Dairy',
      servings: [{ label: '3/4 cup (175 g)', amount: 175 }],
      barcodes: ['0077544827004'],
    });
    expect(f.nutrients).toEqual({ energy_kcal: 80, protein_g: 10, fat_g: 2, sodium_mg: 40 });
    expect(labelValues(f, 175)).toEqual({ energy_kcal: 140, protein_g: 17.5, fat_g: 3.5, sodium_mg: 70 });
  });

  it('rejects missing names, sizes, calories and bad barcodes', () => {
    expect(() => labelToFoodRecord({ ...input, name: ' ' }, 'x')).toThrow('name');
    expect(() => labelToFoodRecord({ ...input, servingAmount: 0 }, 'x')).toThrow('Serving size');
    expect(() => labelToFoodRecord({ ...input, values: { protein_g: 1 } }, 'x')).toThrow('Calories');
    expect(() => labelToFoodRecord({ ...input, values: { energy_kcal: NaN } }, 'x')).toThrow('Calories');
    expect(() => labelToFoodRecord({ ...input, barcode: '12345' }, 'x')).toThrow('barcode');
  });
});

describe('recipes', () => {
  const food = (sourceId: string, nutrients: Record<string, number>): FoodRecord => ({
    source: 'cnf',
    sourceId,
    name: sourceId,
    region: 'CA',
    basis: 'g',
    nutrients,
    servings: [],
    barcodes: [],
    microCompleteness: 0,
  });

  it('combines ingredients per 100 g of the finished dish', () => {
    const c = combineIngredients(
      [
        { nutrients: { energy_kcal: 380, protein_g: 13 }, amount: 100 }, // dry pasta
        { nutrients: { energy_kcal: 40, protein_g: 1 }, amount: 200 }, // sauce
      ],
      600, // cooked weight after absorbing water
    );
    expect(c.totalWeight).toBe(600);
    expect(c.per100.energy_kcal).toBeCloseTo((380 + 80) / 6, 4);
    expect(c.per100.protein_g).toBeCloseTo((13 + 2) / 6, 4);
  });

  it('only counts a micronutrient as known when every ingredient has it', () => {
    const c = combineIngredients([
      { nutrients: { energy_kcal: 1, iron_mg: 1, sodium_mg: 1 }, amount: 10 },
      { nutrients: { energy_kcal: 1, iron_mg: 1 }, amount: 10 },
    ]);
    expect(c.microCompleteness).toBeCloseTo(1 / 12, 2);
  });

  it('saves, reloads and updates a recipe as a loggable food', async () => {
    const db: TestDriver = openMemoryDriver();
    await migrate(db);
    const pasta = await saveFood(db, food('pasta', { energy_kcal: 380 }));
    const sauce = await saveFood(db, food('sauce', { energy_kcal: 40 }));

    const id = await saveRecipe(db, {
      name: 'Pasta night',
      items: [
        { foodId: pasta, amount: 100 },
        { foodId: sauce, amount: 200 },
      ],
      cookedWeight: 600,
      servings: 3,
    });
    const loaded = (await loadRecipe(db, id))!;
    expect(loaded.food).toMatchObject({ source: 'recipe', name: 'Pasta night', servings: [{ label: '1 serving', amount: 200 }] });
    expect(loaded.items.map((i) => [i.food.name, i.amount])).toEqual([
      ['pasta', 100],
      ['sauce', 200],
    ]);
    expect(loaded).toMatchObject({ cookedWeight: 600, servings: 3 });

    await saveRecipe(db, { name: 'Pasta night', items: [{ foodId: pasta, amount: 100 }] }, id);
    const updated = (await getFood(db, id))!;
    expect(updated.nutrients.energy_kcal).toBeCloseTo(380, 6);
    expect((await loadRecipe(db, id))!.items).toHaveLength(1);
    await expect(saveRecipe(db, { name: 'Loop', items: [{ foodId: id, amount: 1 }] }, id)).rejects.toThrow('itself');
    db.close();
  });
});
