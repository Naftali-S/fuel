import { BackupError, exportBackup, importBackup, parseBackup, type Backup } from './backup';
import type { SqlDriver } from './driver';
import { migrate, SCHEMA_VERSION, schemaVersion } from './migrations';
import { NUTRIENTS } from './nutrient-catalog';
import { openMemoryDriver, type TestDriver } from './testing/node-sqlite-driver';

const NOW = '2026-09-27T12:00:00.000Z';

let db: TestDriver;

beforeEach(async () => {
  db = openMemoryDriver();
  await migrate(db);
});

afterEach(() => db.close());

async function seed(d: SqlDriver) {
  await d.run(
    `INSERT INTO foods (id, name, brand, source, source_id, region, created_at, updated_at)
     VALUES (1, 'Rolled oats', NULL, 'cnf', '4567', 'CA', ?, ?)`,
    [NOW, NOW],
  );
  await d.run(`INSERT INTO food_nutrients (food_id, nutrient_id, amount) VALUES (1, 'energy_kcal', 379), (1, 'iron_mg', 4.3)`);
  await d.run(`INSERT INTO food_barcodes (gtin, food_id) VALUES ('0055577102152', 1)`);
  await d.run(`INSERT INTO servings (food_id, label, amount, is_default) VALUES (1, '½ cup', 40, 1)`);
  await d.run(
    `INSERT INTO log_entries (date, meal, food_id, food_name, amount, nutrients, created_at)
     VALUES ('2026-09-27', 'breakfast', 1, 'Rolled oats', 40, '{"energy_kcal":151.6}', ?)`,
    [NOW],
  );
  await d.run(`INSERT INTO weights (date, kg, source) VALUES ('2026-09-27', 82.4, 'manual')`);
  await d.run(`INSERT INTO settings (key, value) VALUES ('profile', '{"heightCm":180}'), ('hevy_api_key', '"do-not-export"')`);
}

async function freshDb(): Promise<TestDriver> {
  const d = openMemoryDriver();
  await migrate(d);
  return d;
}

describe('migrate', () => {
  it('creates the schema and seeds the nutrient catalog', async () => {
    expect(await schemaVersion(db)).toBe(SCHEMA_VERSION);
    const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM nutrients');
    expect(row?.n).toBe(NUTRIENTS.length);
  });

  it('is idempotent', async () => {
    expect(await migrate(db)).toBe(SCHEMA_VERSION);
  });

  it('enforces foreign keys', async () => {
    await expect(
      db.run(`INSERT INTO food_nutrients (food_id, nutrient_id, amount) VALUES (999, 'energy_kcal', 1)`),
    ).rejects.toThrow();
  });

  it('refuses a database from a newer app version', async () => {
    await db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
    await expect(migrate(db)).rejects.toThrow(/newer than this app/);
  });
});

describe('backup', () => {
  it('round-trips all user data through JSON into a fresh database', async () => {
    await seed(db);
    const first = await exportBackup(db, { now: new Date(NOW), appVersion: '0.1.0' });
    const restored = await freshDb();
    const summary = await importBackup(restored, parseBackup(JSON.stringify(first)));
    const second = await exportBackup(restored, { now: new Date(NOW), appVersion: '0.1.0' });
    restored.close();
    expect(summary.rows).toBe(8);
    expect(second).toEqual(first);
  });

  it('never exports secrets kept in settings', async () => {
    await seed(db);
    const backup = await exportBackup(db);
    expect(backup.tables.settings?.map((r) => r.key)).toEqual(['profile']);
    expect(JSON.stringify(backup)).not.toContain('do-not-export');
  });

  it('replaces existing data on import', async () => {
    await seed(db);
    const fresh = await freshDb();
    const empty = await exportBackup(fresh);
    fresh.close();
    await importBackup(db, empty);
    const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM foods');
    expect(row?.n).toBe(0);
  });

  it('changes nothing when an import fails part-way', async () => {
    await seed(db);
    const bad: Backup = {
      ...(await exportBackup(db)),
      tables: {
        weights: [
          { date: '2026-09-28', kg: 80, source: 'manual' },
          { date: '2026-09-29', not_a_column: 1 },
        ],
      },
    };
    await expect(importBackup(db, bad)).rejects.toThrow(BackupError);
    const row = await db.get<{ n: number }>('SELECT COUNT(*) AS n FROM weights');
    expect(row?.n).toBe(1);
  });

  describe('parseBackup rejects', () => {
    const valid = { format: 'fuel-backup', formatVersion: 1, schemaVersion: 1, exportedAt: NOW, appVersion: null, tables: {} };
    const cases: [string, unknown][] = [
      ['non-JSON', 'not json'],
      ['another format', { ...valid, format: 'something-else' }],
      ['a newer schema', { ...valid, schemaVersion: SCHEMA_VERSION + 1 }],
      ['unknown tables', { ...valid, tables: { passwords: [] } }],
      ['non-scalar values', { ...valid, tables: { weights: [{ kg: { $gt: 1 } }] } }],
      ['boolean values', { ...valid, tables: { weights: [{ kg: true }] } }],
    ];
    it.each(cases)('%s', (_, input) => {
      const json = typeof input === 'string' ? input : JSON.stringify(input);
      expect(() => parseBackup(json)).toThrow(BackupError);
    });
  });
});
