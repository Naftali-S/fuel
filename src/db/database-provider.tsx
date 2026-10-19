/**
 * App database: expo-sqlite behind the SqlDriver interface, migrated before
 * any screen renders.
 */
import { SQLiteProvider, useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { useMemo, type ReactNode } from 'react';

import type { SqlDriver, SqlValue } from './driver';
import { migrate } from './migrations';
import { createSerialQueue } from './serial';

export const DATABASE_NAME = 'fuel.db';

// One queue per connection: transactions on the same connection run one at a time.
const queues = new WeakMap<SQLiteDatabase, ReturnType<typeof createSerialQueue>>();
function queueFor(db: SQLiteDatabase) {
  let q = queues.get(db);
  if (!q) {
    q = createSerialQueue();
    queues.set(db, q);
  }
  return q;
}

export function wrapExpoDatabase(db: SQLiteDatabase): SqlDriver {
  const queue = queueFor(db);
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
    // Queued, so two transactions never overlap on this connection.
    transaction: (fn) => queue(() => db.withTransactionAsync(() => fn(driver))),
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
