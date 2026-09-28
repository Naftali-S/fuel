/**
 * Versioned schema migrations, tracked in SQLite's `PRAGMA user_version`.
 * Each migration runs in its own transaction. Never edit a shipped
 * migration; add a new one.
 *
 * Conventions: dates are local ISO dates ('YYYY-MM-DD'), timestamps are
 * ISO 8601 UTC strings, food nutrient amounts are per 100 g (or 100 mL when
 * `basis` = 'ml'), JSON columns hold JSON text.
 */
import type { SqlDriver } from './driver';
import { NUTRIENTS } from './nutrient-catalog';

export interface Migration {
  version: number;
  up(tx: SqlDriver): Promise<void>;
}

const V1_SCHEMA = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE nutrients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL CHECK (unit IN ('kcal', 'g', 'mg', 'mcg')),
  category TEXT NOT NULL,
  sort INTEGER NOT NULL,
  daily_value REAL
);

CREATE TABLE foods (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  source TEXT NOT NULL CHECK (source IN ('cnf', 'off', 'usda', 'user', 'recipe')),
  source_id TEXT,
  region TEXT,
  basis TEXT NOT NULL DEFAULT 'g' CHECK (basis IN ('g', 'ml')),
  verified INTEGER NOT NULL DEFAULT 0,
  micro_completeness REAL,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (source, source_id)
);

CREATE TABLE food_barcodes (
  gtin TEXT NOT NULL,
  food_id INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  PRIMARY KEY (gtin, food_id)
) WITHOUT ROWID;

CREATE TABLE food_nutrients (
  food_id INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  nutrient_id TEXT NOT NULL REFERENCES nutrients(id),
  amount REAL NOT NULL,
  is_estimate INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (food_id, nutrient_id)
) WITHOUT ROWID;

CREATE TABLE servings (
  id INTEGER PRIMARY KEY,
  food_id INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  is_default INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX servings_food ON servings(food_id);

-- A recipe is a food (source 'recipe') whose nutrients are computed from its items.
CREATE TABLE recipe_items (
  recipe_food_id INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  food_id INTEGER NOT NULL REFERENCES foods(id),
  amount REAL NOT NULL CHECK (amount > 0),
  PRIMARY KEY (recipe_food_id, position)
) WITHOUT ROWID;

-- Entries snapshot name and nutrients so editing a food never rewrites history.
CREATE TABLE log_entries (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  meal TEXT NOT NULL,
  food_id INTEGER REFERENCES foods(id) ON DELETE SET NULL,
  food_name TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  serving_label TEXT,
  nutrients TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX log_entries_date ON log_entries(date);

CREATE TABLE day_status (
  date TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('complete', 'partial', 'unlogged', 'fasting'))
);

CREATE TABLE weights (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  measured_at TEXT,
  kg REAL NOT NULL CHECK (kg > 0),
  body_fat_pct REAL,
  source TEXT NOT NULL
);
CREATE INDEX weights_date ON weights(date);

CREATE TABLE steps (
  date TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count >= 0),
  source TEXT NOT NULL
);

CREATE TABLE goals (
  id INTEGER PRIMARY KEY,
  start_date TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('lose', 'maintain', 'gain')),
  rate_pct_per_week REAL NOT NULL,
  target_kg REAL,
  macro_prefs TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE targets (
  date TEXT PRIMARY KEY,
  kcal REAL NOT NULL,
  protein_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('coach', 'manual'))
);

CREATE TABLE checkins (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  expenditure_kcal REAL NOT NULL,
  trend_kg REAL NOT NULL,
  target_kcal REAL NOT NULL,
  result TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE nutrient_targets (
  nutrient_id TEXT PRIMARY KEY REFERENCES nutrients(id),
  min_amount REAL,
  max_amount REAL,
  source TEXT NOT NULL CHECK (source IN ('dri', 'user'))
);

CREATE TABLE hevy_workouts (
  id TEXT PRIMARY KEY,
  title TEXT,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  updated_at TEXT
);
CREATE INDEX hevy_workouts_date ON hevy_workouts(date);

CREATE TABLE hevy_sets (
  workout_id TEXT NOT NULL REFERENCES hevy_workouts(id) ON DELETE CASCADE,
  exercise_index INTEGER NOT NULL,
  set_index INTEGER NOT NULL,
  exercise_template_id TEXT,
  exercise_title TEXT,
  set_type TEXT,
  weight_kg REAL,
  reps INTEGER,
  rpe REAL,
  duration_s REAL,
  distance_m REAL,
  PRIMARY KEY (workout_id, exercise_index, set_index)
) WITHOUT ROWID;

CREATE TABLE hevy_templates (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  type TEXT,
  primary_muscle TEXT,
  is_custom INTEGER NOT NULL DEFAULT 0
);
`;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    async up(tx) {
      await tx.exec(V1_SCHEMA);
      for (const [i, n] of NUTRIENTS.entries()) {
        await tx.run('INSERT INTO nutrients (id, name, unit, category, sort) VALUES (?, ?, ?, ?, ?)', [
          n.id,
          n.name,
          n.unit,
          n.category,
          i,
        ]);
      }
    },
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function schemaVersion(db: SqlDriver): Promise<number> {
  const row = await db.get<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/** Brings the database up to SCHEMA_VERSION. Returns the final version. */
export async function migrate(db: SqlDriver): Promise<number> {
  await db.exec('PRAGMA foreign_keys = ON');
  let version = await schemaVersion(db);
  if (version > SCHEMA_VERSION) {
    throw new Error(`Database schema v${version} is newer than this app (v${SCHEMA_VERSION}). Update Fuel.`);
  }
  for (const m of MIGRATIONS) {
    if (m.version <= version) continue;
    await db.transaction(async (tx) => {
      await m.up(tx);
      await tx.exec(`PRAGMA user_version = ${m.version}`);
    });
    version = m.version;
  }
  return version;
}
