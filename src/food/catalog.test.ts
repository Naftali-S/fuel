import { migrate } from '@/db/migrations';
import { openMemoryDriver, type TestDriver } from '@/db/testing/node-sqlite-driver';

import { lookupBarcode, searchFoods, type Catalog } from './catalog';
import { getFood, saveFood } from './food-store';
import {
  createReferenceSchema,
  finalizeReference,
  ftsQuery,
  insertReferenceFood,
  referenceMeta,
  searchReference,
} from './reference-db';
import type { FoodRecord } from './types';

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

const opened: TestDriver[] = [];
async function referenceDb(foods: FoodRecord[], boosts: number[] = []): Promise<TestDriver> {
  const db = openMemoryDriver();
  opened.push(db);
  await createReferenceSchema(db);
  for (const [i, f] of foods.entries()) await insertReferenceFood(db, f, boosts[i] ?? 0);
  await finalizeReference(db, { source: foods[0]?.source ?? 'cnf', version: 'test' });
  return db;
}
async function mainDb(): Promise<TestDriver> {
  const db = openMemoryDriver();
  opened.push(db);
  await migrate(db);
  return db;
}
afterEach(() => opened.splice(0).forEach((d) => d.close()));

describe('ftsQuery', () => {
  it('quotes each word as a required prefix and drops operators', () => {
    expect(ftsQuery('Greek yogurt')).toBe('"greek"* "yogurt"*');
    expect(ftsQuery('milk OR "x" NEAR(y) -z*')).toBe('"milk"* "or"* "x"* "near"* "y"* "z"*');
    expect(ftsQuery('  ,.;  ')).toBeNull();
  });
});

describe('reference search', () => {
  it('matches word prefixes and ignores accents', async () => {
    const db = await referenceDb([
      food({ sourceId: '1', name: 'Cheese, cheddar' }),
      food({ sourceId: '2', name: 'Crème fraîche', nameFr: 'Crème fraîche' }),
      food({ sourceId: '3', name: 'Egg, chicken, whole, raw' }),
    ]);
    expect((await searchReference(db, 'ched')).map((f) => f.name)).toEqual(['Cheese, cheddar']);
    expect((await searchReference(db, 'creme')).map((f) => f.name)).toEqual(['Crème fraîche']);
    expect(await searchReference(db, 'pizza')).toEqual([]);
  });

  it('ranks shorter names and popular items first', async () => {
    const db = await referenceDb(
      [
        food({ sourceId: '1', name: 'Milk, partly skimmed, 2% M.F., fortified with vitamin D' }),
        food({ sourceId: '2', name: 'Milk, 2%' }),
        food({ sourceId: '3', name: 'Milk chocolate bar', source: 'off' }),
      ],
      [0, 0, 5],
    );
    const names = (await searchReference(db, 'milk')).map((f) => f.name);
    expect(names[0]).toBe('Milk chocolate bar');
    expect(names.indexOf('Milk, 2%')).toBeLessThan(names.indexOf('Milk, partly skimmed, 2% M.F., fortified with vitamin D'));
  });

  it('round-trips nutrients, servings and metadata', async () => {
    const f = food({ nutrients: { energy_kcal: 61, calcium_mg: 120 }, servings: [{ label: '1 cup', amount: 258 }] });
    const db = await referenceDb([f]);
    expect((await searchReference(db, 'food'))[0]).toEqual({ ...f, nameFr: null, brand: null, category: null });
    expect(await referenceMeta(db)).toEqual({ schema_version: '1', source: 'cnf', version: 'test' });
  });
});

describe('catalog', () => {
  const cereal = food({
    source: 'off',
    sourceId: '0077544827004',
    name: 'Crunchy cereal',
    brand: 'Brand A',
    barcodes: ['0077544827004'],
  });

  it('searches your foods, then CNF, then OFF Canada', async () => {
    const main = await mainDb();
    await saveFood(main, food({ source: 'user', sourceId: 'u1', name: 'My oat bowl' }));
    const c: Catalog = {
      main,
      cnf: await referenceDb([food({ name: 'Oats, rolled, dry' })]),
      offCa: await referenceDb([food({ source: 'off', sourceId: '9', name: 'Oat crisps' })]),
    };
    const hits = await searchFoods(c, 'oat');
    expect(hits.map((h) => [h.origin, h.food.name])).toEqual([
      ['mine', 'My oat bowl'],
      ['cnf', 'Oats, rolled, dry'],
      ['off-ca', 'Oat crisps'],
    ]);
  });

  it('finds a barcode in the OFF Canada file from a 12-digit UPC scan', async () => {
    const c: Catalog = { main: await mainDb(), offCa: await referenceDb([cereal]) };
    const r = await lookupBarcode(c, '077544827004', 'ean13');
    expect(r).toMatchObject({ status: 'found', hit: { origin: 'off-ca', food: { name: 'Crunchy cereal' } } });
  });

  it('falls back to the live lookup once, then serves the cached copy', async () => {
    const fetchOffProduct = jest.fn(async () => ({ ...cereal, barcodes: [] }));
    const c: Catalog = { main: await mainDb(), offCa: await referenceDb([food({})]), fetchOffProduct };

    const first = await lookupBarcode(c, '0077544827004');
    expect(first).toMatchObject({ status: 'found', hit: { origin: 'off-live' } });
    const second = await lookupBarcode(c, '077544827004');
    expect(second).toMatchObject({ status: 'found', hit: { origin: 'mine', food: { name: 'Crunchy cereal' } } });
    expect(fetchOffProduct).toHaveBeenCalledTimes(1);
    expect(fetchOffProduct).toHaveBeenCalledWith('0077544827004');

    const id = first.status === 'found' ? first.hit.foodId! : 0;
    expect(await getFood(c.main, id)).toMatchObject({ barcodes: ['0077544827004'], nutrients: { energy_kcal: 100 } });
  });

  it('reports invalid, unknown and failed lookups', async () => {
    const main = await mainDb();
    expect(await lookupBarcode({ main }, '12345')).toEqual({ status: 'invalid', reason: 'bad-length' });
    expect(await lookupBarcode({ main, fetchOffProduct: async () => null }, '0077544827004')).toEqual({
      status: 'not-found',
      gtin: '0077544827004',
    });
    const failing = async () => {
      throw new Error('offline');
    };
    expect(await lookupBarcode({ main, fetchOffProduct: failing }, '0077544827004')).toEqual({
      status: 'error',
      gtin: '0077544827004',
      message: 'offline',
    });
  });

  it('updates a cached food in place when saved again', async () => {
    const main = await mainDb();
    const id1 = await saveFood(main, cereal);
    const id2 = await saveFood(main, { ...cereal, name: 'Crunchy cereal (new recipe)', nutrients: { energy_kcal: 380 } });
    expect(id2).toBe(id1);
    expect(await getFood(main, id1)).toMatchObject({ name: 'Crunchy cereal (new recipe)', nutrients: { energy_kcal: 380 } });
  });
});
