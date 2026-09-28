/**
 * App database: expo-sqlite behind the SqlDriver interface, migrated before
 * any screen renders.
 */
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useMemo, type ReactNode } from 'react';

import type { SqlDriver, SqlValue } from './driver';
import { migrate } from './migrations';

export const DATABASE_NAME = 'fuel.db';

export function wrapExpoDatabase(db: SQLiteDatabase): SqlDriver {
  const driver: SqlDriver = {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params = []) => {
      const r = await db.runAsync(sql, params as SqlValue[]);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    all: (sql, params = []) => db.getAllAsync(sql, params as SqlValue[]),
    get: (sql, params = []) => db.getFirstAsync(sql, params as SqlValue[]),
    // Same connection (not the exclusive variant, which opens a new one) so the
    // foreign_keys pragma set at startup applies inside transactions too.
    transaction: (fn) => db.withTransactionAsync(() => fn(driver)),
  };
  return driver;
}

async function initDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL');
  await migrate(wrapExpoDatabase(db));
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase}>
      {children}
    </SQLiteProvider>
  );
}

export function useDatabase(): SqlDriver {
  const db = useSQLiteContext();
  return useMemo(() => wrapExpoDatabase(db), [db]);
}
