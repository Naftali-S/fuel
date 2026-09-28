/**
 * Moves backups between the database and files the user controls: export
 * goes to the iOS share sheet (Files, AirDrop…), import comes from the
 * document picker. Temporary copies are deleted afterwards.
 */
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportBackup, parseBackup, type Backup } from '@/db/backup';
import type { SqlDriver } from '@/db/driver';
import { localIsoDate } from '@/engine/dates';

export async function shareBackup(db: SqlDriver): Promise<void> {
  const backup = await exportBackup(db, { appVersion: Constants.expoConfig?.version ?? null });
  const file = new File(Paths.cache, `fuel-backup-${localIsoDate(new Date())}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(backup));
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Save Fuel backup',
    });
  } finally {
    if (file.exists) file.delete();
  }
}

/** Lets the user pick a backup file. Returns null if cancelled; throws BackupError if invalid. */
export async function pickBackup(): Promise<Backup | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = new File(result.assets[0].uri);
  try {
    return parseBackup(await file.text());
  } finally {
    if (file.exists) file.delete();
  }
}
