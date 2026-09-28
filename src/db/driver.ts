/**
 * Minimal async SQL interface. The app implements it with expo-sqlite;
 * tests implement it with Node's built-in SQLite, so the same SQL runs in both.
 */
export type SqlValue = string | number | null;

export type SqlRow = Record<string, SqlValue>;

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface SqlDriver {
  /** Runs one or more statements without parameters (trusted SQL only). */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<RunResult>;
  all<T = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  get<T = SqlRow>(sql: string, params?: readonly SqlValue[]): Promise<T | null>;
  /** Runs `fn` in an exclusive transaction; use only `tx` inside it. */
  transaction(fn: (tx: SqlDriver) => Promise<void>): Promise<void>;
}
