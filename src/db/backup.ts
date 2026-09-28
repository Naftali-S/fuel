/**
 * Whole-database JSON backup and restore. Backups contain personal data:
 * they are written to a file the user shares themselves and are never
 * uploaded by the app.
 */
import type { SqlDriver, SqlRow, SqlValue } from './driver';
import { SCHEMA_VERSION, schemaVersion } from './migrations';

export const BACKUP_FORMAT = 'fuel-backup';
export const BACKUP_FORMAT_VERSION = 1;

/** User tables in dependency order (parents first). `nutrients` is reference data. */
export const BACKUP_TABLES = [
  'settings',
  'foods',
  'food_barcodes',
  'food_nutrients',
  'servings',
  'recipe_items',
  'recipes',
  'log_entries',
  'day_status',
  'weights',
  'steps',
  'goals',
  'targets',
  'checkins',
  'nutrient_targets',
  'hevy_templates',
  'hevy_workouts',
  'hevy_sets',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface Backup {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  schemaVersion: number;
  exportedAt: string;
  appVersion: string | null;
  tables: Partial<Record<BackupTable, SqlRow[]>>;
}

export class BackupError extends Error {
  override name = 'BackupError';
}

/** Settings keys that must never leave the device, even if stored by mistake. */
const SECRET_KEY = /api[_-]?key|token|secret|password/i;

export async function exportBackup(
  db: SqlDriver,
  { now = new Date(), appVersion = null }: { now?: Date; appVersion?: string | null } = {},
): Promise<Backup> {
  const tables: Partial<Record<BackupTable, SqlRow[]>> = {};
  for (const table of BACKUP_TABLES) {
    let rows = await db.all(`SELECT * FROM "${table}"`);
    if (table === 'settings') rows = rows.filter((r) => !SECRET_KEY.test(String(r.key)));
    tables[table] = rows.map((r) => ({ ...r }));
  }
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: await schemaVersion(db),
    exportedAt: now.toISOString(),
    appVersion,
    tables,
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isSqlValue(v: unknown): v is SqlValue {
  return v === null || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
}

/** Parses and structurally validates backup JSON. Throws BackupError. */
export function parseBackup(json: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new BackupError('This file is not valid JSON.');
  }
  if (!isPlainObject(data) || data.format !== BACKUP_FORMAT) {
    throw new BackupError('This file is not a Fuel backup.');
  }
  if (data.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new BackupError(`Unsupported backup format version ${String(data.formatVersion)}.`);
  }
  if (typeof data.schemaVersion !== 'number' || !Number.isInteger(data.schemaVersion) || data.schemaVersion < 1) {
    throw new BackupError('Backup has no valid schema version.');
  }
  if (data.schemaVersion > SCHEMA_VERSION) {
    throw new BackupError('This backup was made by a newer version of Fuel. Update the app first.');
  }
  if (!isPlainObject(data.tables)) throw new BackupError('Backup has no tables.');
  const known = new Set<string>(BACKUP_TABLES);
  for (const [table, rows] of Object.entries(data.tables)) {
    if (!known.has(table)) throw new BackupError(`Unknown table "${table}" in backup.`);
    if (!Array.isArray(rows)) throw new BackupError(`Table "${table}" is not a list.`);
    for (const row of rows) {
      if (!isPlainObject(row)) throw new BackupError(`Table "${table}" has an invalid row.`);
      for (const v of Object.values(row)) {
        if (!isSqlValue(v)) throw new BackupError(`Table "${table}" has an invalid value.`);
      }
    }
  }
  return data as unknown as Backup;
}

export interface ImportSummary {
  rows: number;
}

/**
 * Replaces all user data with the backup's contents, atomically: on any
 * error nothing is changed.
 */
export async function importBackup(db: SqlDriver, backup: Backup): Promise<ImportSummary> {
  // Column names come from the live schema, never from the file, before being put in SQL.
  const columns = new Map<string, Set<string>>();
  for (const table of BACKUP_TABLES) {
    const info = await db.all<{ name: string }>(`PRAGMA table_info("${table}")`);
    columns.set(table, new Set(info.map((c) => c.name)));
  }

  let rows = 0;
  await db.transaction(async (tx) => {
    for (const table of [...BACKUP_TABLES].reverse()) {
      await tx.run(`DELETE FROM "${table}"`);
    }
    for (const table of BACKUP_TABLES) {
      const allowed = columns.get(table)!;
      for (const row of backup.tables[table] ?? []) {
        const keys = Object.keys(row);
        for (const k of keys) {
          if (!allowed.has(k)) throw new BackupError(`Table "${table}" has unknown column "${k}".`);
        }
        if (keys.length === 0) continue;
        const cols = keys.map((k) => `"${k}"`).join(', ');
        const marks = keys.map(() => '?').join(', ');
        await tx.run(`INSERT INTO "${table}" (${cols}) VALUES (${marks})`, keys.map((k) => row[k]));
        rows++;
      }
    }
  });
  return { rows };
}
