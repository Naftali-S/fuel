/**
 * One place to find food, Canada first:
 *   search:  your foods → Canadian Nutrient File → Open Food Facts (Canada)
 *   barcode: your foods (incl. cached lookups) → OFF Canada file → live OFF
 * Live results are cached in your database so a second scan works offline.
 */
import type { SqlDriver } from '@/db/driver';
import { normalizeBarcode, type NormalizedBarcode, type ScannedSymbology } from '@/lib/barcode';

import { foodByBarcode, saveFood, searchMyFoods } from './food-store';
import { referenceByBarcode, searchReference } from './reference-db';
import type { FoodRecord } from './types';

export type FoodOrigin = 'mine' | 'cnf' | 'off-ca' | 'off-live';

export interface FoodHit {
  origin: FoodOrigin;
  food: FoodRecord;
  /** Id in the user's database, when the food is stored there. */
  foodId?: number;
}

export interface Catalog {
  main: SqlDriver;
  cnf?: SqlDriver | null;
  offCa?: SqlDriver | null;
  /** Live Open Food Facts lookup by canonical GTIN. */
  fetchOffProduct?: (gtin: string) => Promise<FoodRecord | null>;
}

export async function searchFoods(c: Catalog, query: string, limit = 40): Promise<FoodHit[]> {
  const [mine, cnf, off] = await Promise.all([
    searchMyFoods(c.main, query, 8),
    c.cnf ? searchReference(c.cnf, query, 20) : Promise.resolve([]),
    c.offCa ? searchReference(c.offCa, query, 20) : Promise.resolve([]),
  ]);
  const hits: FoodHit[] = [
    ...mine.map((f) => ({ origin: 'mine' as const, food: f, foodId: f.id })),
    ...cnf.map((f) => ({ origin: 'cnf' as const, food: f })),
    ...off.map((f) => ({ origin: 'off-ca' as const, food: f })),
  ];
  return hits.slice(0, limit);
}

export type BarcodeLookup =
  | { status: 'found'; hit: FoodHit }
  | { status: 'not-found'; gtin: string }
  | { status: 'invalid'; reason: Extract<NormalizedBarcode, { ok: false }>['reason'] }
  | { status: 'error'; gtin: string; message: string };

export async function lookupBarcode(c: Catalog, raw: string, symbology?: ScannedSymbology): Promise<BarcodeLookup> {
  const code = normalizeBarcode(raw, symbology);
  if (!code.ok) return { status: 'invalid', reason: code.reason };

  const mine = await foodByBarcode(c.main, code.candidates);
  if (mine) return { status: 'found', hit: { origin: 'mine', food: mine, foodId: mine.id } };

  if (c.offCa) {
    const off = await referenceByBarcode(c.offCa, code.candidates);
    if (off) return { status: 'found', hit: { origin: 'off-ca', food: off } };
  }

  if (!c.fetchOffProduct) return { status: 'not-found', gtin: code.gtin };
  let live: FoodRecord | null;
  try {
    live = await c.fetchOffProduct(code.gtin);
  } catch (e) {
    return { status: 'error', gtin: code.gtin, message: e instanceof Error ? e.message : String(e) };
  }
  if (!live) return { status: 'not-found', gtin: code.gtin };
  const food = { ...live, barcodes: [...new Set([code.gtin, ...live.barcodes])] };
  const foodId = await saveFood(c.main, food);
  return { status: 'found', hit: { origin: 'off-live', food, foodId } };
}
