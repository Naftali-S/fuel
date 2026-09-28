import { migrate } from '@/db/migrations';
import { openMemoryDriver, type TestDriver } from '@/db/testing/node-sqlite-driver';
import { saveFood, searchMyFoods } from '@/food/food-store';
import type { FoodRecord } from '@/food/types';

import {
  addEntry,
  dayStatus,
  deleteEntry,
  entriesForDate,
  getEntry,
  intakeDays,
  recentFoodIds,
  setDayStatus,
  sumNutrients,
  updateEntry,
} from './log-store';

const oats: FoodRecord = {
  source: 'cnf',
  sourceId: '123',
  name: 'Grains, oats',
  region: 'CA',
  basis: 'g',
  nutrients: { energy_kcal: 389, protein_g: 16.9, iron_mg: 4.72 },
  servings: [{ label: '½ cup', amount: 40 }],
  barcodes: [],
  microCompleteness: 0.1,
};
const halfCup = { label: '½ cup', amount: 40 };
const T0 = new Date('2026-09-28T12:00:00Z');

let db: TestDriver;
let oatsId: number;
beforeEach(async () => {
  db = openMemoryDriver();
  await migrate(db);
  oatsId = await saveFood(db, oats);
});
afterEach(() => db.close());

describe('entries', () => {
  it('snapshots the nutrients for the amount eaten', async () => {
    const id = await addEntry(db, { date: '2026-09-28', meal: 'breakfast', foodId: oatsId, portion: halfCup, quantity: 1.5 }, T0);
    const e = (await getEntry(db, id))!;
    expect(e).toMatchObject({ foodName: 'Grains, oats', amount: 60, unit: 'g', quantity: 1.5, servingLabel: '½ cup' });
    expect(e.nutrients.energy_kcal).toBeCloseTo(233.4, 6);
    expect(e.nutrients.iron_mg).toBeCloseTo(2.832, 6);
  });

  it('keeps past entries unchanged when the food is edited', async () => {
    const id = await addEntry(db, { date: '2026-09-28', meal: 'breakfast', foodId: oatsId, portion: halfCup, quantity: 1 });
    await saveFood(db, { ...oats, name: 'Oats (edited)', nutrients: { energy_kcal: 1 } });
    expect((await getEntry(db, id))!).toMatchObject({ foodName: 'Grains, oats' });
    expect((await getEntry(db, id))!.nutrients.energy_kcal).toBeCloseTo(155.6, 6);
  });

  it('rescales on edit and can move meals', async () => {
    const id = await addEntry(db, { date: '2026-09-28', meal: 'breakfast', foodId: oatsId, portion: halfCup, quantity: 1 });
    await updateEntry(db, id, { quantity: 2, meal: 'snacks' });
    const e = (await getEntry(db, id))!;
    expect(e).toMatchObject({ meal: 'snacks', amount: 80, quantity: 2 });
    expect(e.nutrients.energy_kcal).toBeCloseTo(311.2, 6);
    await updateEntry(db, id, { portion: { label: '100 g', amount: 100 }, quantity: 1 });
    expect((await getEntry(db, id))!.nutrients.energy_kcal).toBeCloseTo(389, 6);
  });

  it('rejects zero or missing amounts and unknown foods', async () => {
    const base = { date: '2026-09-28', meal: 'lunch' as const, foodId: oatsId, portion: halfCup };
    await expect(addEntry(db, { ...base, quantity: 0 })).rejects.toThrow(RangeError);
    await expect(addEntry(db, { ...base, quantity: NaN })).rejects.toThrow(RangeError);
    await expect(addEntry(db, { ...base, foodId: 999, quantity: 1 })).rejects.toThrow('no longer exists');
  });

  it('lists a day in order, sums it, and deletes', async () => {
    const a = await addEntry(db, { date: '2026-09-28', meal: 'breakfast', foodId: oatsId, portion: halfCup, quantity: 1 }, T0);
    await addEntry(db, { date: '2026-09-28', meal: 'dinner', foodId: oatsId, portion: halfCup, quantity: 2 }, new Date(+T0 + 1000));
    await addEntry(db, { date: '2026-09-29', meal: 'lunch', foodId: oatsId, portion: halfCup, quantity: 1 });
    const day = await entriesForDate(db, '2026-09-28');
    expect(day.map((e) => e.meal)).toEqual(['breakfast', 'dinner']);
    expect(sumNutrients(day).energy_kcal).toBeCloseTo(466.8, 6);
    await deleteEntry(db, a);
    expect(await entriesForDate(db, '2026-09-28')).toHaveLength(1);
  });
});

describe('day status', () => {
  const log = (date: string) => addEntry(db, { date, meal: 'lunch', foodId: oatsId, portion: halfCup, quantity: 1 });

  it('defaults past logged days to complete, today to partial, empty days to unlogged', async () => {
    await log('2026-09-27');
    await log('2026-09-28');
    expect(await dayStatus(db, '2026-09-27', '2026-09-28')).toEqual({ status: 'complete', explicit: false });
    expect(await dayStatus(db, '2026-09-28', '2026-09-28')).toEqual({ status: 'partial', explicit: false });
    expect(await dayStatus(db, '2026-09-26', '2026-09-28')).toEqual({ status: 'unlogged', explicit: false });
  });

  it('lets the user override and clear the status', async () => {
    await setDayStatus(db, '2026-09-26', 'fasting');
    expect(await dayStatus(db, '2026-09-26', '2026-09-28')).toEqual({ status: 'fasting', explicit: true });
    await setDayStatus(db, '2026-09-26', null);
    expect((await dayStatus(db, '2026-09-26', '2026-09-28')).explicit).toBe(false);
  });

  it('feeds the engine one row per day with energy and status', async () => {
    await log('2026-09-25');
    await log('2026-09-27');
    await log('2026-09-28');
    await setDayStatus(db, '2026-09-27', 'partial');
    const days = await intakeDays(db, '2026-09-25', '2026-09-28', '2026-09-28');
    expect(days.map((d) => [d.date, d.status, d.kcal === null ? null : Math.round(d.kcal)])).toEqual([
      ['2026-09-25', 'complete', 156],
      ['2026-09-26', 'unlogged', null],
      ['2026-09-27', 'partial', 156],
      ['2026-09-28', 'partial', 156],
    ]);
  });
});

describe('recent foods', () => {
  it('orders by last logged and ranks logged foods first in search', async () => {
    const other = await saveFood(db, { ...oats, sourceId: '456', name: 'Oat bran' });
    await addEntry(db, { date: '2026-09-27', meal: 'lunch', foodId: oatsId, portion: halfCup, quantity: 1 }, T0);
    await addEntry(db, { date: '2026-09-28', meal: 'lunch', foodId: other, portion: halfCup, quantity: 1 }, new Date(+T0 + 1000));
    expect(await recentFoodIds(db)).toEqual([other, oatsId]);
    expect((await searchMyFoods(db, 'oat')).map((f) => f.name)).toEqual(['Oat bran', 'Grains, oats']);
  });
});
