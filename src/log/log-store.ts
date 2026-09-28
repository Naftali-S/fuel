/**
 * The food log. Each entry stores a snapshot of the food's name and the
 * nutrients for the amount eaten, so editing or deleting a food never
 * rewrites past days.
 */
import type { SqlDriver } from '@/db/driver';
import { addDays, daysBetween, type IsoDate } from '@/engine/dates';
import type { DayIntake, DayStatus } from '@/engine/expenditure';
import { getFood } from '@/food/food-store';
import { scaleNutrients, type Portion } from '@/food/portion';

export const MEALS = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type Meal = (typeof MEALS)[number];

export const MEAL_LABELS: Record<Meal, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

/** A sensible default meal for the time of day. */
export function mealForTime(d: Date): Meal {
  const minutes = d.getHours() * 60 + d.getMinutes();
  if (minutes < 10 * 60 + 30) return 'breakfast';
  if (minutes < 15 * 60) return 'lunch';
  if (minutes < 21 * 60) return 'dinner';
  return 'snacks';
}

export function isMeal(value: unknown): value is Meal {
  return typeof value === 'string' && (MEALS as readonly string[]).includes(value);
}

export interface LogEntry {
  id: number;
  date: IsoDate;
  meal: Meal;
  foodId: number | null;
  foodName: string;
  /** Total eaten, in `unit`. */
  amount: number;
  unit: 'g' | 'ml';
  /** Number of portions (null for entries without portion info). */
  quantity: number | null;
  servingLabel: string | null;
  servingAmount: number | null;
  nutrients: Record<string, number>;
}

export interface NewEntry {
  date: IsoDate;
  meal: Meal;
  foodId: number;
  portion: Portion;
  quantity: number;
}

interface EntryRow {
  id: number;
  date: string;
  meal: string;
  food_id: number | null;
  food_name: string;
  amount: number;
  unit: string;
  quantity: number | null;
  serving_label: string | null;
  serving_amount: number | null;
  nutrients: string;
}

function rowToEntry(r: EntryRow): LogEntry {
  return {
    id: r.id,
    date: r.date,
    meal: (MEALS as readonly string[]).includes(r.meal) ? (r.meal as Meal) : 'snacks',
    foodId: r.food_id,
    foodName: r.food_name,
    amount: r.amount,
    unit: r.unit === 'ml' ? 'ml' : 'g',
    quantity: r.quantity,
    servingLabel: r.serving_label,
    servingAmount: r.serving_amount,
    nutrients: JSON.parse(r.nutrients) as Record<string, number>,
  };
}

function checkQuantity(portion: Portion, quantity: number) {
  if (!(quantity > 0) || !(portion.amount > 0) || !Number.isFinite(quantity * portion.amount)) {
    throw new RangeError('Amount must be greater than zero.');
  }
}

export async function addEntry(db: SqlDriver, e: NewEntry, now = new Date()): Promise<number> {
  checkQuantity(e.portion, e.quantity);
  const food = await getFood(db, e.foodId);
  if (!food) throw new Error('That food no longer exists.');
  const amount = e.portion.amount * e.quantity;
  const { lastInsertRowId } = await db.run(
    `INSERT INTO log_entries (date, meal, food_id, food_name, amount, unit, quantity, serving_label,
       serving_amount, nutrients, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      e.date,
      e.meal,
      food.id,
      food.brand ? `${food.name} (${food.brand})` : food.name,
      amount,
      food.basis,
      e.quantity,
      e.portion.label,
      e.portion.amount,
      JSON.stringify(scaleNutrients(food.nutrients, amount)),
      now.toISOString(),
    ],
  );
  return lastInsertRowId;
}

export async function getEntry(db: SqlDriver, id: number): Promise<LogEntry | null> {
  const row = await db.get<EntryRow>('SELECT * FROM log_entries WHERE id = ?', [id]);
  return row ? rowToEntry(row) : null;
}

/** Changes an entry's meal, date or portion. Nutrients rescale from the entry's own snapshot. */
export async function updateEntry(
  db: SqlDriver,
  id: number,
  change: { meal?: Meal; date?: IsoDate; portion?: Portion; quantity?: number },
): Promise<void> {
  const entry = await getEntry(db, id);
  if (!entry) throw new Error('That entry no longer exists.');
  const portion = change.portion ?? {
    label: entry.servingLabel ?? `${entry.amount} ${entry.unit}`,
    amount: entry.servingAmount ?? entry.amount,
  };
  const quantity = change.quantity ?? entry.quantity ?? 1;
  checkQuantity(portion, quantity);
  const amount = portion.amount * quantity;
  const factor = amount / entry.amount;
  const nutrients = Object.fromEntries(Object.entries(entry.nutrients).map(([k, v]) => [k, v * factor]));
  await db.run(
    `UPDATE log_entries SET meal = ?, date = ?, amount = ?, quantity = ?, serving_label = ?, serving_amount = ?,
       nutrients = ? WHERE id = ?`,
    [change.meal ?? entry.meal, change.date ?? entry.date, amount, quantity, portion.label, portion.amount, JSON.stringify(nutrients), id],
  );
}

export async function deleteEntry(db: SqlDriver, id: number): Promise<void> {
  await db.run('DELETE FROM log_entries WHERE id = ?', [id]);
}

export async function entriesForDate(db: SqlDriver, date: IsoDate): Promise<LogEntry[]> {
  const rows = await db.all<EntryRow>('SELECT * FROM log_entries WHERE date = ? ORDER BY created_at, id', [date]);
  return rows.map(rowToEntry);
}

export function sumNutrients(entries: readonly { nutrients: Readonly<Record<string, number>> }[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const e of entries) {
    for (const [k, v] of Object.entries(e.nutrients)) total[k] = (total[k] ?? 0) + v;
  }
  return total;
}

/** Sets an explicit status for a day, or clears it (null) to use the default. */
export async function setDayStatus(db: SqlDriver, date: IsoDate, status: DayStatus | null): Promise<void> {
  if (status === null) await db.run('DELETE FROM day_status WHERE date = ?', [date]);
  else await db.run('INSERT OR REPLACE INTO day_status (date, status) VALUES (?, ?)', [date, status]);
}

/**
 * A day's status: the user's explicit choice if any; otherwise past days
 * with entries count as complete, today as partial, and empty days as unlogged.
 */
export function defaultStatus(date: IsoDate, today: IsoDate, hasEntries: boolean): DayStatus {
  if (!hasEntries) return 'unlogged';
  return date < today ? 'complete' : 'partial';
}

export async function dayStatus(
  db: SqlDriver,
  date: IsoDate,
  today: IsoDate,
): Promise<{ status: DayStatus; explicit: boolean }> {
  const row = await db.get<{ status: DayStatus }>('SELECT status FROM day_status WHERE date = ?', [date]);
  if (row) return { status: row.status, explicit: true };
  const n = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM log_entries WHERE date = ?', [date]);
  return { status: defaultStatus(date, today, (n?.n ?? 0) > 0), explicit: false };
}

/** Daily logged energy and status from `from` to `to`, for the expenditure engine. */
export async function intakeDays(db: SqlDriver, from: IsoDate, to: IsoDate, today: IsoDate): Promise<DayIntake[]> {
  const totals = await db.all<{ date: string; kcal: number | null; n: number }>(
    `SELECT date, SUM(json_extract(nutrients, '$.energy_kcal')) AS kcal, COUNT(*) AS n
       FROM log_entries WHERE date BETWEEN ? AND ? GROUP BY date`,
    [from, to],
  );
  const explicit = await db.all<{ date: string; status: DayStatus }>(
    'SELECT date, status FROM day_status WHERE date BETWEEN ? AND ?',
    [from, to],
  );
  const byDate = new Map(totals.map((t) => [t.date, t]));
  const statusByDate = new Map(explicit.map((s) => [s.date, s.status]));
  const out: DayIntake[] = [];
  for (let i = 0; i <= daysBetween(from, to); i++) {
    const date = addDays(from, i);
    const t = byDate.get(date);
    const status = statusByDate.get(date) ?? defaultStatus(date, today, (t?.n ?? 0) > 0);
    out.push({ date, kcal: t ? (t.kcal ?? 0) : null, status });
  }
  return out;
}

/** Foods logged most recently, newest first (one row per food). */
export async function recentFoodIds(db: SqlDriver, limit = 20): Promise<number[]> {
  const rows = await db.all<{ food_id: number }>(
    `SELECT food_id FROM log_entries WHERE food_id IS NOT NULL
      GROUP BY food_id ORDER BY MAX(created_at) DESC LIMIT ?`,
    [limit],
  );
  return rows.map((r) => r.food_id);
}
