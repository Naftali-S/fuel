/**
 * Foods kept in the user's own database: custom foods, recipes and cached
 * online lookups. Reference data (CNF, OFF Canada) stays in its own files.
 */
import type { SqlDriver } from '@/db/driver';

import type { FoodRecord, FoodRegion, FoodSource } from './types';

export interface StoredFood extends FoodRecord {
  id: number;
}

/** Unique id for foods created on this device ("user-…", "recipe-…"). */
export function newSourceId(prefix: 'user' | 'recipe'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Inserts or updates a food by (source, sourceId). Returns its id. */
export async function saveFood(db: SqlDriver, food: FoodRecord, now = new Date()): Promise<number> {
  const ts = now.toISOString();
  let id = 0;
  await db.transaction(async (tx) => {
    const existing = await tx.get<{ id: number }>('SELECT id FROM foods WHERE source = ? AND source_id = ?', [
      food.source,
      food.sourceId,
    ]);
    const fields = [
      food.name,
      food.brand ?? null,
      food.region,
      food.basis,
      food.microCompleteness,
      ts,
    ] as const;
    if (existing) {
      id = existing.id;
      await tx.run(
        `UPDATE foods SET name = ?, brand = ?, region = ?, basis = ?, micro_completeness = ?, updated_at = ?,
           archived = 0 WHERE id = ?`,
        [...fields, id],
      );
      await tx.run('DELETE FROM food_nutrients WHERE food_id = ?', [id]);
      await tx.run('DELETE FROM servings WHERE food_id = ?', [id]);
      await tx.run('DELETE FROM food_barcodes WHERE food_id = ?', [id]);
    } else {
      id = (
        await tx.run(
          `INSERT INTO foods (name, brand, region, basis, micro_completeness, updated_at, source, source_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [...fields, food.source, food.sourceId, ts],
        )
      ).lastInsertRowId;
    }
    const estimated = new Set(food.estimated ?? []);
    for (const [nutrientId, amount] of Object.entries(food.nutrients)) {
      await tx.run('INSERT INTO food_nutrients (food_id, nutrient_id, amount, is_estimate) VALUES (?, ?, ?, ?)', [
        id,
        nutrientId,
        amount,
        estimated.has(nutrientId) ? 1 : 0,
      ]);
    }
    for (const [i, s] of food.servings.entries()) {
      await tx.run('INSERT INTO servings (food_id, label, amount, is_default) VALUES (?, ?, ?, ?)', [
        id,
        s.label,
        s.amount,
        i === 0 ? 1 : 0,
      ]);
    }
    for (const gtin of food.barcodes) {
      await tx.run('INSERT OR IGNORE INTO food_barcodes (gtin, food_id) VALUES (?, ?)', [gtin, id]);
    }
  });
  return id;
}

interface FoodRow {
  id: number;
  name: string;
  brand: string | null;
  source: string;
  source_id: string | null;
  region: string | null;
  basis: string;
  micro_completeness: number | null;
}

async function hydrate(db: SqlDriver, row: FoodRow): Promise<StoredFood> {
  const nutrients = await db.all<{ nutrient_id: string; amount: number; is_estimate: number }>(
    'SELECT nutrient_id, amount, is_estimate FROM food_nutrients WHERE food_id = ?',
    [row.id],
  );
  const estimated = nutrients.filter((n) => n.is_estimate).map((n) => n.nutrient_id);
  const servings = await db.all<{ label: string; amount: number }>(
    'SELECT label, amount FROM servings WHERE food_id = ? ORDER BY is_default DESC, id',
    [row.id],
  );
  const barcodes = await db.all<{ gtin: string }>('SELECT gtin FROM food_barcodes WHERE food_id = ? ORDER BY gtin', [
    row.id,
  ]);
  return {
    id: row.id,
    source: row.source as FoodSource,
    sourceId: row.source_id ?? String(row.id),
    name: row.name,
    brand: row.brand,
    region: (row.region as FoodRegion) ?? null,
    basis: row.basis === 'ml' ? 'ml' : 'g',
    nutrients: Object.fromEntries(nutrients.map((n) => [n.nutrient_id, n.amount])),
    servings,
    barcodes: barcodes.map((b) => b.gtin),
    microCompleteness: row.micro_completeness ?? 0,
    ...(estimated.length > 0 && { estimated }),
  };
}

export async function getFood(db: SqlDriver, id: number): Promise<StoredFood | null> {
  const row = await db.get<FoodRow>('SELECT * FROM foods WHERE id = ?', [id]);
  return row ? hydrate(db, row) : null;
}

export async function foodByBarcode(db: SqlDriver, candidates: readonly string[]): Promise<StoredFood | null> {
  if (candidates.length === 0) return null;
  const marks = candidates.map(() => '?').join(', ');
  const row = await db.get<FoodRow>(
    `SELECT f.* FROM food_barcodes b JOIN foods f ON f.id = b.food_id
      WHERE b.gtin IN (${marks}) AND f.archived = 0
      ORDER BY f.source = 'user' DESC, f.updated_at DESC LIMIT 1`,
    [...candidates],
  );
  return row ? hydrate(db, row) : null;
}

/** Word-prefix search over the user's own foods (small table; LIKE is enough). */
export async function searchMyFoods(db: SqlDriver, query: string, limit = 10): Promise<StoredFood[]> {
  const words = query.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.slice(0, 6) ?? [];
  if (words.length === 0) return [];
  const where = words.map(() => `(lower(name) LIKE ? ESCAPE '\\' OR lower(ifnull(brand, '')) LIKE ? ESCAPE '\\')`);
  const params = words.flatMap((w) => {
    const like = `%${w.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return [like, like];
  });
  // Recently logged first, then your own foods and recipes, then other saved foods.
  const rows = await db.all<FoodRow>(
    `SELECT f.* FROM foods f
       LEFT JOIN (SELECT food_id, MAX(created_at) AS last_logged FROM log_entries GROUP BY food_id) l
         ON l.food_id = f.id
      WHERE f.archived = 0 AND ${where.join(' AND ')}
      ORDER BY l.last_logged IS NULL, l.last_logged DESC, f.source IN ('user', 'recipe') DESC, f.updated_at DESC
      LIMIT ?`,
    [...params, limit],
  );
  return Promise.all(rows.map((r) => hydrate(db, r)));
}
