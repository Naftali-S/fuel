/**
 * Read-only reference food databases (Canadian Nutrient File, Open Food
 * Facts Canada). Built offline by scripts/data/*, searched on device.
 * Nutrients and servings are stored as JSON per food: one row read per food.
 */
import type { SqlDriver } from '@/db/driver';

import type { FoodRecord, FoodRegion, FoodSource, Serving } from './types';

export const REFERENCE_SCHEMA_VERSION = 1;

const SCHEMA = `
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE foods (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  source_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_fr TEXT,
  brand TEXT,
  category TEXT,
  region TEXT,
  basis TEXT NOT NULL,
  nutrients TEXT NOT NULL,
  servings TEXT NOT NULL,
  micro_completeness REAL NOT NULL,
  rank_boost REAL NOT NULL DEFAULT 0
);
CREATE TABLE barcodes (
  gtin TEXT PRIMARY KEY,
  food_id INTEGER NOT NULL
) WITHOUT ROWID;
CREATE VIRTUAL TABLE foods_fts USING fts5(
  name, name_fr, brand,
  content='foods', content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);
`;

export async function createReferenceSchema(db: SqlDriver): Promise<void> {
  await db.exec(SCHEMA);
}

/** Adds a food. `rankBoost` (≥ 0) lifts popular items in search results. */
export async function insertReferenceFood(db: SqlDriver, food: FoodRecord, rankBoost = 0): Promise<number> {
  const { lastInsertRowId: id } = await db.run(
    `INSERT INTO foods (source, source_id, name, name_fr, brand, category, region, basis,
       nutrients, servings, micro_completeness, rank_boost)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      food.source,
      food.sourceId,
      food.name,
      food.nameFr ?? null,
      food.brand ?? null,
      food.category ?? null,
      food.region,
      food.basis,
      JSON.stringify(food.nutrients),
      JSON.stringify(food.servings),
      food.microCompleteness,
      rankBoost,
    ],
  );
  for (const gtin of food.barcodes) {
    await db.run('INSERT OR IGNORE INTO barcodes (gtin, food_id) VALUES (?, ?)', [gtin, id]);
  }
  return id;
}

/** Writes metadata and builds the search index. Call once after all inserts. */
export async function finalizeReference(db: SqlDriver, meta: Readonly<Record<string, string>>): Promise<void> {
  const all = { schema_version: String(REFERENCE_SCHEMA_VERSION), ...meta };
  for (const [key, value] of Object.entries(all)) {
    await db.run('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
  }
  await db.exec(`INSERT INTO foods_fts(foods_fts) VALUES ('rebuild'); INSERT INTO foods_fts(foods_fts) VALUES ('optimize');`);
}

export async function referenceMeta(db: SqlDriver): Promise<Record<string, string>> {
  const rows = await db.all<{ key: string; value: string }>('SELECT key, value FROM meta');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/**
 * Turns free text into a safe FTS5 query: each word becomes a quoted
 * prefix term, all required. Returns null when nothing searchable remains.
 */
export function ftsQuery(input: string, join: 'AND' | 'OR' = 'AND'): string | null {
  const words = searchWords(input);
  if (!words.length) return null;
  const terms = words.map((w) => {
    const alts = [w, ...(SYNONYMS[w] ?? [])].map((a) => `"${a}"*`);
    return alts.length > 1 ? `(${alts.join(' OR ')})` : alts[0];
  });
  return terms.join(join === 'AND' ? ' ' : ' OR ');
}

function searchWords(input: string): string[] {
  return (input.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
}

/**
 * Spelling and naming variants: Canadian/US/UK spellings and the terms the
 * Canadian Nutrient File uses ("yogourt", "oats" for oatmeal).
 */
const SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  yogurt: ['yogourt', 'yoghurt'],
  yoghurt: ['yogourt', 'yogurt'],
  yogourt: ['yogurt'],
  oatmeal: ['oats'],
  oat: ['oats'],
  fiber: ['fibre'],
  fibre: ['fiber'],
  chickpea: ['chickpeas', 'garbanzo'],
  chickpeas: ['garbanzo'],
  garbanzo: ['chickpeas'],
  zucchini: ['squash'],
  eggplant: ['aubergine'],
  cilantro: ['coriander'],
  scallion: ['onions'],
  ketchup: ['catsup'],
  donut: ['doughnut', 'doughnuts'],
  doughnut: ['donut'],
  hamburger: ['burger', 'ground'],
  pop: ['soda', 'carbonated'],
  soda: ['carbonated'],
};

interface FoodRow {
  source: string;
  source_id: string;
  name: string;
  name_fr: string | null;
  brand: string | null;
  category: string | null;
  region: string | null;
  basis: string;
  nutrients: string;
  servings: string;
  micro_completeness: number;
  gtin?: string | null;
}

function rowToFood(row: FoodRow): FoodRecord {
  return {
    source: row.source as FoodSource,
    sourceId: row.source_id,
    name: row.name,
    nameFr: row.name_fr,
    brand: row.brand,
    category: row.category,
    region: (row.region as FoodRegion) ?? null,
    basis: row.basis === 'ml' ? 'ml' : 'g',
    nutrients: JSON.parse(row.nutrients) as Record<string, number>,
    servings: JSON.parse(row.servings) as Serving[],
    barcodes: row.gtin ? [row.gtin] : [],
    microCompleteness: row.micro_completeness,
  };
}

/**
 * Ranked full-text search. Search results don't include barcodes.
 * Besides text relevance, names led by the first search word rank higher
 * ("Egg, chicken, whole" before "Bagel, egg"), as do popular products.
 */
export async function searchReference(db: SqlDriver, query: string, limit = 25): Promise<FoodRecord[]> {
  const strict = ftsQuery(query);
  if (!strict) return [];
  const rows = await rankedSearch(db, query, strict, limit);
  // Too few matches for every word ("rolled oats" vs "Grains, oats"): add any-word matches.
  if (rows.length < Math.min(5, limit) && searchWords(query).length > 1) {
    const seen = new Set(rows.map((r) => r.source_id));
    for (const r of await rankedSearch(db, query, ftsQuery(query, 'OR')!, limit)) {
      if (rows.length >= limit) break;
      if (!seen.has(r.source_id)) rows.push(r);
    }
  }
  return rows.map(rowToFood);
}

async function rankedSearch(db: SqlDriver, query: string, match: string, limit: number): Promise<FoodRow[]> {
  const first = searchWords(query)[0]; // letters/digits only: safe inside LIKE
  return db.all<FoodRow>(
    `SELECT f.* FROM foods_fts
       JOIN foods f ON f.id = foods_fts.rowid
      WHERE foods_fts MATCH ?
      ORDER BY bm25(foods_fts, 10.0, 4.0, 6.0) - f.rank_boost
               - CASE WHEN lower(f.name) IN (?, ?) OR lower(f.name) LIKE ? OR lower(f.name) LIKE ?
                        OR lower(ifnull(f.name_fr, '')) LIKE ? OR lower(ifnull(f.name_fr, '')) LIKE ? THEN 6
                      WHEN lower(f.name) LIKE ? THEN 3 ELSE 0 END,
               length(f.name)
      LIMIT ?`,
    // First comma segment (English or French) is the word or its plural ("Egg, …", "Lait, …");
    // otherwise the name starts with it.
    [match, first, `${first}s`, `${first},%`, `${first}s,%`, `${first},%`, `${first}s,%`, `${first}%`, limit],
  );
}

export async function referenceByBarcode(db: SqlDriver, candidates: readonly string[]): Promise<FoodRecord | null> {
  if (candidates.length === 0) return null;
  const marks = candidates.map(() => '?').join(', ');
  const row = await db.get<FoodRow>(
    `SELECT f.*, b.gtin FROM barcodes b JOIN foods f ON f.id = b.food_id WHERE b.gtin IN (${marks}) LIMIT 1`,
    [...candidates],
  );
  return row ? rowToFood(row) : null;
}
