import { migrate } from '@/db/migrations';
import { NUTRIENTS } from '@/db/nutrient-catalog';
import { openMemoryDriver, type TestDriver } from '@/db/testing/node-sqlite-driver';
import type { Profile } from '@/engine/energy';
import { clearEstimates, fillMissingNutrients } from '@/food/estimate';
import { getFood, saveFood } from '@/food/food-store';
import { createReferenceSchema, finalizeReference, insertReferenceFood } from '@/food/reference-db';
import type { FoodRecord } from '@/food/types';
import { loadProfile, profileProblems, saveProfile } from '@/profile/profile-store';

import { bestSources, entriesByDate, personalTargets, setOverride } from './nutrition-store';
import { DAILY_VALUES, DRI } from './reference-values';
import { averageReport, consistentlyLow, coverage, dayReport } from './report';
import { ageBand, applyOverrides, referenceTargets } from './targets';

const TODAY = '2026-09-28';
const food = (over: Partial<FoodRecord>): FoodRecord => ({
  source: 'cnf',
  sourceId: '1',
  name: 'Food',
  region: 'CA',
  basis: 'g',
  nutrients: { energy_kcal: 100 },
  servings: [],
  barcodes: [],
  microCompleteness: 0,
  ...over,
});

let db: TestDriver;
beforeEach(async () => {
  db = openMemoryDriver();
  await migrate(db);
});
afterEach(() => db.close());

describe('reference values', () => {
  it('only uses nutrients Fuel tracks', () => {
    const ids = new Set(NUTRIENTS.map((n) => n.id));
    for (const id of [...Object.keys(DAILY_VALUES), ...Object.keys(DRI)]) expect(ids).toContain(id);
  });

  it('are stored in the database by migration', async () => {
    expect(await db.get("SELECT daily_value FROM nutrients WHERE id = 'calcium_mg'")).toEqual({ daily_value: 1300 });
    expect(await db.get("SELECT daily_value FROM nutrients WHERE id = 'protein_g'")).toEqual({ daily_value: null });
  });
});

describe('referenceTargets', () => {
  it('matches Health Canada DRIs by sex and age', () => {
    const m25 = referenceTargets('male', 25);
    expect(m25.vitamin_d_mcg).toMatchObject({ target: 15, upper: 100 });
    expect(m25.iron_mg).toMatchObject({ target: 8, source: 'RDA' });
    expect(m25.fibre_g).toMatchObject({ target: 38, source: 'AI' });
    expect(m25.calcium_mg).toMatchObject({ target: 1000, upper: 2500, dailyValue: 1300 });

    const f55 = referenceTargets('female', 55);
    expect(f55.iron_mg.target).toBe(8);
    expect(f55.calcium_mg).toMatchObject({ target: 1200, upper: 2000 });
    expect(f55.fibre_g.target).toBe(21);
    expect(f55.vitamin_b6_mg.target).toBe(1.5);

    const m75 = referenceTargets('male', 75);
    expect(m75.vitamin_d_mcg.target).toBe(20);
    expect(m75.phosphorus_mg.upper).toBe(3000);
  });

  it('uses the higher recommendation when sex is unspecified', () => {
    const u = referenceTargets('unspecified', 40);
    expect(u.iron_mg.target).toBe(18);
    expect(u.zinc_mg.target).toBe(11);
    expect(u.vitamin_a_mcg.target).toBe(900);
  });

  it('marks sodium’s CDRR and supplement-only upper limits', () => {
    const t = referenceTargets('female', 30);
    expect(t.sodium_mg).toMatchObject({ target: 1500, upper: 2300, upperKind: 'CDRR' });
    expect(t.magnesium_mg).toMatchObject({ upper: 350, upperFromSupplementsOnly: true });
    expect(t.sat_fat_g).toEqual({ dailyValue: 20 });
  });

  it('bands ages and defaults to 31–50', () => {
    expect([ageBand(19), ageBand(30.9), ageBand(31), ageBand(70.5), ageBand(71), ageBand(null)]).toEqual([
      '19-30',
      '19-30',
      '31-50',
      '51-70',
      '71+',
      '31-50',
    ]);
  });

  it('lets the user override targets', () => {
    const t = applyOverrides(referenceTargets('male', 30), [{ nutrientId: 'vitamin_d_mcg', min: 25, max: null }]);
    expect(t.vitamin_d_mcg).toMatchObject({ target: 25, source: 'user', upper: 100 });
  });
});

describe('reports', () => {
  const targets = referenceTargets('male', 30);
  const oats = { nutrients: { energy_kcal: 300, iron_mg: 4, magnesium_mg: 400, sodium_mg: 2000 } };
  const bar = { nutrients: { energy_kcal: 100, sodium_mg: 500 } };

  it('weights coverage by calories', () => {
    expect(coverage([oats, bar], 'iron_mg')).toBeCloseTo(0.75, 10);
    expect(coverage([oats, bar], 'sodium_mg')).toBe(1);
    expect(coverage([], 'iron_mg')).toBe(0);
  });

  it('flags low, high, unknown and supplement-only limits correctly', () => {
    const byId = Object.fromEntries(dayReport([oats, bar], targets).map((l) => [l.nutrient.id, l]));
    expect(byId.iron_mg).toMatchObject({ amount: 4, flag: 'low', coverage: 0.75 });
    expect(byId.iron_mg.ofTarget).toBeCloseTo(0.5, 10);
    expect(byId.sodium_mg).toMatchObject({ amount: 2500, flag: 'high' });
    expect(byId.magnesium_mg.flag).toBe('ok'); // 400 mg from food isn't judged against the supplement UL
    expect(byId.vitamin_d_mcg).toMatchObject({ amount: 0, flag: 'unknown', coverage: 0 });
    expect(byId.sat_fat_g.flag).toBe('none');
    expect(byId.energy_kcal).toBeUndefined();
  });

  it('averages days and lists nutrients that stay low', () => {
    const lines = averageReport([[oats], [oats, bar], [bar]], targets);
    const iron = lines.find((l) => l.nutrient.id === 'iron_mg')!;
    expect(iron.amount).toBeCloseTo(8 / 3, 10);
    // Iron averages 2.7/8 mg; magnesium 267/400 mg with 75% coverage. Lowest first.
    expect(consistentlyLow(lines).map((l) => l.nutrient.id)).toEqual(['iron_mg', 'magnesium_mg']);
  });
});

describe('profile', () => {
  const me: Profile = { sex: 'male', birthDate: '1996-03-15', heightCm: 180, activity: 'moderate' };

  it('saves and loads a valid profile', async () => {
    await saveProfile(db, me, TODAY);
    expect(await loadProfile(db, TODAY)).toEqual(me);
  });

  it('explains what is wrong', () => {
    expect(profileProblems({ ...me, birthDate: '2015-01-01' }, TODAY)).toEqual(['Fuel’s targets are for adults 18 and over.']);
    expect(profileProblems({}, TODAY)).toHaveLength(4);
    expect(profileProblems({ ...me, bodyFatPct: 80 }, TODAY)).toHaveLength(1);
  });

  it('personalises targets and applies overrides', async () => {
    await saveProfile(db, { ...me, sex: 'female' }, TODAY);
    await setOverride(db, 'vitamin_d_mcg', 25);
    const t = await personalTargets(db, await loadProfile(db, TODAY), TODAY);
    expect(t.iron_mg.target).toBe(18);
    expect(t.vitamin_d_mcg).toMatchObject({ target: 25, source: 'user' });
    await setOverride(db, 'vitamin_d_mcg', null);
    expect((await personalTargets(db, null, TODAY)).vitamin_d_mcg.source).toBe('RDA');
    await expect(setOverride(db, 'vitamin_d_mcg', 0)).rejects.toThrow(RangeError);
  });
});

describe('entriesByDate', () => {
  it('groups log entries by day', async () => {
    const id = await saveFood(db, food({ nutrients: { energy_kcal: 100, iron_mg: 1 } }));
    for (const date of ['2026-09-26', '2026-09-26', '2026-09-28']) {
      await db.run(
        `INSERT INTO log_entries (date, meal, food_id, food_name, amount, nutrients, created_at)
         VALUES (?, 'lunch', ?, 'Food', 100, '{"iron_mg":1}', ?)`,
        [date, id, TODAY],
      );
    }
    const byDate = await entriesByDate(db, '2026-09-22', '2026-09-28');
    expect([...byDate.keys()]).toEqual(['2026-09-26', '2026-09-28']);
    expect(byDate.get('2026-09-26')).toHaveLength(2);
  });
});

describe('bestSources', () => {
  it('ranks by nutrient per calorie, collapses near-duplicates and skips spices', async () => {
    const ref = openMemoryDriver();
    await createReferenceSchema(ref);
    const add = (sourceId: string, name: string, n: Record<string, number>, category = 'Fish') =>
      insertReferenceFood(ref, food({ sourceId, name, category, nutrients: n, servings: [{ label: '1 fillet', amount: 150 }] }));
    await add('1', 'Fish, salmon, raw', { energy_kcal: 200, vitamin_d_mcg: 10 });
    await add('2', 'Fish, salmon, baked', { energy_kcal: 200, vitamin_d_mcg: 11 });
    await add('3', 'Egg, whole', { energy_kcal: 150, vitamin_d_mcg: 2 }, 'Eggs');
    await add('4', 'Spice, paprika', { energy_kcal: 300, vitamin_d_mcg: 100 }, 'Spices and Herbs');
    await finalizeReference(ref, { source: 'cnf' });
    const sources = await bestSources(ref, 'vitamin_d_mcg');
    expect(sources.map((s) => s.name)).toEqual(['Fish, salmon, baked', 'Egg, whole']);
    expect(sources[0]).toMatchObject({ portion: { label: '1 fillet', amount: 150 }, amount: 16.5, kcal: 300 });
    expect(await bestSources(ref, 'not_a_nutrient')).toEqual([]);
    ref.close();
  });
});

describe('estimates', () => {
  const packaged = food({ source: 'off', sourceId: 'p', nutrients: { energy_kcal: 60, protein_g: 3, calcium_mg: 120 } });
  const generic = { nutrients: { energy_kcal: 64, protein_g: 3.3, calcium_mg: 125, vitamin_d_mcg: 1.2, potassium_mg: 150 } };

  it('adds only missing micronutrients and marks them', () => {
    const filled = fillMissingNutrients(packaged, generic);
    expect(filled.nutrients).toEqual({ energy_kcal: 60, protein_g: 3, calcium_mg: 120, vitamin_d_mcg: 1.2, potassium_mg: 150 });
    expect(filled.estimated).toEqual(['potassium_mg', 'vitamin_d_mcg']);
    expect(filled.microCompleteness).toBeGreaterThan(packaged.microCompleteness);
    expect(clearEstimates(filled).nutrients).toEqual(packaged.nutrients);
  });

  it('persists the estimate markers', async () => {
    const id = await saveFood(db, fillMissingNutrients(packaged, generic));
    expect((await getFood(db, id))!.estimated).toEqual(['potassium_mg', 'vitamin_d_mcg']);
  });
});
