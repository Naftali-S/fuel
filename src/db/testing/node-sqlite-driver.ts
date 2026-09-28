/**
 * Test-only SqlDriver backed by Node's built-in SQLite (node:sqlite), so
 * migrations and queries run against a real SQLite engine in Jest.
 * Loaded via process.getBuiltinModule to bypass the Jest module resolver.
 */
import type { RunResult, SqlDriver, SqlValue } from '../driver';

interface NodeStatement {
  run(...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  all(...params: SqlValue[]): unknown[];
  get(...params: SqlValue[]): unknown;
}

interface NodeDatabase {
  exec(sql: string): void;
  prepare(sql: string): NodeStatement;
  close(): void;
}

type NodeSqliteModule = { DatabaseSync: new (path: string) => NodeDatabase };

export interface TestDriver extends SqlDriver {
  close(): void;
}

export function openMemoryDriver(): TestDriver {
  const getBuiltin = (process as unknown as { getBuiltinModule(id: string): unknown }).getBuiltinModule;
  const { DatabaseSync } = getBuiltin('node:sqlite') as NodeSqliteModule;
  const db = new DatabaseSync(':memory:');

  const driver: TestDriver = {
    async exec(sql) {
      db.exec(sql);
    },
    async run(sql, params = []): Promise<RunResult> {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async all<T>(sql: string, params: readonly SqlValue[] = []) {
      return db.prepare(sql).all(...params).map((row) => ({ ...(row as object) })) as T[];
    },
    async get<T>(sql: string, params: readonly SqlValue[] = []) {
      const row = db.prepare(sql).get(...params);
      return row === undefined ? null : ({ ...(row as object) } as T);
    },
    async transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        await fn(driver);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close() {
      db.close();
    },
  };
  return driver;
}
