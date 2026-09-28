/**
 * Opens the reference food databases and provides the food catalog:
 * - cnf.db ships inside the app (Canadian Nutrient File, OGL-Canada) and is
 *   copied into place on first launch or when a new app version changes it;
 * - off-ca.db (Open Food Facts Canada, ODbL) is optional and downloaded from
 *   this project's GitHub release when the user asks.
 */
import Constants from 'expo-constants';
import { Directory, File, Paths } from 'expo-file-system';
import { importDatabaseFromAssetAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useDatabase, wrapExpoDatabase } from '@/db/database-provider';
import type { SqlDriver } from '@/db/driver';

import { getSecret, setSecret } from '@/features/secrets';

import type { Catalog } from './catalog';
import cnfManifest from './cnf-manifest.json';
import { createOffFetcher } from './off-api';
import { referenceMeta } from './reference-db';
import { createUsdaClient } from './usda';

const CNF_DB = 'cnf.db';
const OFF_DB = 'off-ca.db';
const OFF_RELEASE = 'https://github.com/Naftali-S/fuel/releases/download/off-ca/';
const CNF_SETTING = 'ref.cnf.sha256';

export interface OffCaManifest {
  version: string;
  foods: number;
  bytes: number;
}

export interface OffCaInfo {
  version: string;
  foods: number;
}

interface OpenOffCa {
  db: SQLiteDatabase;
  info: OffCaInfo;
}

interface CatalogContextValue {
  catalog: Catalog;
  cnfFoods: number | null;
  offCa: OffCaInfo | null;
  /** Download progress 0–1 while downloading, else null. */
  progress: number | null;
  error: string | null;
  downloadOffCa(): Promise<void>;
  removeOffCa(): Promise<void>;
  fetchOffCaManifest(): Promise<OffCaManifest>;
  /** True once the user has saved a USDA API key. */
  hasUsdaKey: boolean;
  saveUsdaKey(key: string | null): Promise<void>;
}

const CatalogContext = createContext<CatalogContextValue | null>(null);

const sqliteDir = () => new Directory(Paths.document, 'SQLite');
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function openCnf(main: SqlDriver): Promise<SQLiteDatabase> {
  const stored = await main.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [CNF_SETTING]);
  const current = JSON.stringify(cnfManifest.sha256);
  await importDatabaseFromAssetAsync(CNF_DB, {
    assetId: require('../../assets/data/cnf.db'),
    forceOverwrite: stored?.value !== current,
  });
  const db = await openDatabaseAsync(CNF_DB, { useNewConnection: true });
  await main.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [CNF_SETTING, current]);
  return db;
}

async function openOffCa(): Promise<OpenOffCa | null> {
  if (!new File(sqliteDir(), OFF_DB).exists) return null;
  const db = await openDatabaseAsync(OFF_DB, { useNewConnection: true });
  const meta = await referenceMeta(wrapExpoDatabase(db));
  return { db, info: { version: meta.version ?? '?', foods: Number(meta.foods ?? 0) } };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const main = useDatabase();
  const [cnf, setCnf] = useState<SQLiteDatabase | null>(null);
  const [cnfFoods, setCnfFoods] = useState<number | null>(null);
  const [off, setOff] = useState<OpenOffCa | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usdaKey, setUsdaKey] = useState<string | null>(null);
  const offRef = useRef<OpenOffCa | null>(null);

  useEffect(() => {
    offRef.current = off;
  }, [off]);

  useEffect(() => {
    getSecret('usda_api_key').then(setUsdaKey, () => setUsdaKey(null));
  }, []);

  const saveUsdaKey = useCallback(async (key: string | null) => {
    await setSecret('usda_api_key', key);
    setUsdaKey(key?.trim() || null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    openCnf(main)
      .then(async (db) => {
        if (cancelled) return db.closeAsync();
        setCnf(db);
        const meta = await referenceMeta(wrapExpoDatabase(db));
        setCnfFoods(Number(meta.foods ?? 0));
      })
      .catch((e) => setError(`Couldn't open the Canadian Nutrient File: ${errorText(e)}`));
    openOffCa()
      .then((o) => (cancelled ? o?.db.closeAsync() : setOff(o)))
      .catch((e) => setError(`Couldn't open Open Food Facts Canada: ${errorText(e)}`));
    return () => {
      cancelled = true;
    };
  }, [main]);

  const fetchOffCaManifest = useCallback(async (): Promise<OffCaManifest> => {
    const res = await fetch(`${OFF_RELEASE}off-ca.json`);
    if (!res.ok) throw new Error(`The Canadian product list isn't available yet (HTTP ${res.status}).`);
    return (await res.json()) as OffCaManifest;
  }, []);

  const downloadOffCa = useCallback(async () => {
    setError(null);
    setProgress(0);
    const tmp = new File(Paths.cache, `${OFF_DB}.download`);
    try {
      const manifest = await fetchOffCaManifest();
      if (tmp.exists) tmp.delete();
      const task = File.createDownloadTask(`${OFF_RELEASE}${OFF_DB}`, tmp, {
        onProgress: ({ bytesWritten }) => setProgress(Math.min(1, bytesWritten / manifest.bytes)),
      });
      const file = await task.downloadAsync();
      if (!file || file.size !== manifest.bytes) throw new Error('The download was incomplete. Try again.');

      await offRef.current?.db.closeAsync();
      setOff(null);
      const dir = sqliteDir();
      if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
      const dest = new File(dir, OFF_DB);
      if (dest.exists) dest.delete();
      await file.move(dest);
      const opened = await openOffCa();
      if (!opened || opened.info.foods !== manifest.foods) throw new Error('The downloaded file is damaged. Try again.');
      setOff(opened);
    } catch (e) {
      setError(errorText(e));
    } finally {
      if (tmp.exists) tmp.delete();
      setProgress(null);
    }
  }, [fetchOffCaManifest]);

  const removeOffCa = useCallback(async () => {
    await offRef.current?.db.closeAsync();
    setOff(null);
    const dest = new File(sqliteDir(), OFF_DB);
    if (dest.exists) dest.delete();
  }, []);

  const catalog = useMemo<Catalog>(
    () => ({
      main,
      cnf: cnf ? wrapExpoDatabase(cnf) : null,
      offCa: off ? wrapExpoDatabase(off.db) : null,
      fetchOffProduct: createOffFetcher({ appVersion: Constants.expoConfig?.version ?? '0' }),
      usda: usdaKey ? createUsdaClient({ apiKey: usdaKey }) : null,
    }),
    [main, cnf, off, usdaKey],
  );

  const value = useMemo<CatalogContextValue>(
    () => ({
      catalog,
      cnfFoods,
      offCa: off?.info ?? null,
      progress,
      error,
      downloadOffCa,
      removeOffCa,
      fetchOffCaManifest,
      hasUsdaKey: usdaKey !== null,
      saveUsdaKey,
    }),
    [catalog, cnfFoods, off, progress, error, downloadOffCa, removeOffCa, fetchOffCaManifest, usdaKey, saveUsdaKey],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog(): CatalogContextValue {
  const value = useContext(CatalogContext);
  if (!value) throw new Error('useCatalog must be used inside <CatalogProvider>');
  return value;
}
