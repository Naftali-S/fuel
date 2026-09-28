import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { importBackup } from '@/db/backup';
import { useDatabase } from '@/db/database-provider';
import type { SqlDriver } from '@/db/driver';
import { schemaVersion } from '@/db/migrations';
import { pickBackup, shareBackup } from '@/features/backup/backup-file';
import { runHealthProbe, type HealthProbeResult } from '@/features/health/health-probe';
import { useCatalog } from '@/food/catalog-provider';

function FoodLibraryCard() {
  const { cnfFoods, offCa, progress, error, downloadOffCa, removeOffCa, fetchOffCaManifest } = useCatalog();

  const confirmDownload = async () => {
    try {
      const m = await fetchOffCaManifest();
      const mb = (m.bytes / 1_048_576).toFixed(0);
      Alert.alert(
        'Download Canadian products?',
        `${m.foods.toLocaleString()} products from Open Food Facts (${m.version}), about ${mb} MB. Use Wi-Fi if you can.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Download', onPress: () => void downloadOffCa() },
        ],
      );
    } catch (e) {
      Alert.alert('Not available', errorMessage(e));
    }
  };

  const confirmRemove = () =>
    Alert.alert('Remove Canadian products?', 'Frees the space. Foods you already scanned stay saved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => void removeOffCa() },
    ]);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold">Food library</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {cnfFoods === null ? 'Opening…' : `${cnfFoods.toLocaleString()} generic foods (Canadian Nutrient File 2015)`}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {offCa
          ? `${offCa.foods.toLocaleString()} Canadian products (Open Food Facts, ${offCa.version})`
          : 'Canadian products not downloaded. Scans are looked up online instead.'}
      </ThemedText>
      {progress !== null && <ThemedText type="small">Downloading… {Math.round(progress * 100)}%</ThemedText>}
      {error && <ThemedText type="small">{error}</ThemedText>}
      <Button label="Search foods" onPress={() => router.push('/food-search')} />
      {offCa ? (
        <Button label="Remove Canadian products" disabled={progress !== null} onPress={confirmRemove} />
      ) : (
        <Button
          label={progress === null ? 'Download Canadian products' : 'Downloading…'}
          disabled={progress !== null}
          onPress={confirmDownload}
        />
      )}
      <ThemedText type="small" themeColor="textSecondary">
        Contains information licensed under the{' '}
        <Link href="https://open.canada.ca/en/open-government-licence-canada" style={styles.link}>
          Open Government Licence – Canada
        </Link>
        . Contains data from{' '}
        <Link href="https://world.openfoodfacts.org" style={styles.link}>
          Open Food Facts
        </Link>
        , available under the{' '}
        <Link href="https://opendatacommons.org/licenses/odbl/1-0/" style={styles.link}>
          Open Database License
        </Link>
        . Not affiliated with or endorsed by Health Canada or Open Food Facts.
      </ThemedText>
    </ThemedView>
  );
}

interface DbStats {
  version: number;
  foods: number;
  entries: number;
  weights: number;
}

async function loadStats(db: SqlDriver): Promise<DbStats> {
  const count = async (table: string) => (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))?.n ?? 0;
  return {
    version: await schemaVersion(db),
    foods: await count('foods'),
    entries: await count('log_entries'),
    weights: await count('weights'),
  };
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

function describeHealth(result: HealthProbeResult): string {
  switch (result.status) {
    case 'unavailable':
      return 'HealthKit is not available on this device.';
    case 'error':
      return `HealthKit error: ${result.message}`;
    case 'ok': {
      const weight =
        result.latestWeightKg === null
          ? 'no weight samples (or read access denied)'
          : `${result.latestWeightKg.toFixed(1)} kg on ${result.latestWeightDate?.slice(0, 10)}`;
      const steps = result.stepsToday === null ? 'no step data' : `${Math.round(result.stepsToday)} steps today`;
      return `Connected. Latest weight: ${weight}. ${steps}.`;
    }
  }
}

export default function DiagnosticsScreen() {
  const [health, setHealth] = useState<HealthProbeResult | null>(null);
  const [probing, setProbing] = useState(false);
  const db = useDatabase();
  const [stats, setStats] = useState<DbStats | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshStats = useCallback(() => {
    loadStats(db).then(setStats, (e) => Alert.alert('Database error', errorMessage(e)));
  }, [db]);
  useFocusEffect(refreshStats);

  const probeHealth = async () => {
    setProbing(true);
    setHealth(await runHealthProbe());
    setProbing(false);
  };

  const exportData = async () => {
    setBusy(true);
    try {
      await shareBackup(db);
    } catch (e) {
      Alert.alert('Export failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const importData = async () => {
    try {
      const backup = await pickBackup();
      if (!backup) return;
      Alert.alert(
        'Replace all data?',
        `This replaces everything in Fuel with the backup from ${backup.exportedAt.slice(0, 10)}. This can't be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              try {
                const { rows } = await importBackup(db, backup);
                Alert.alert('Import complete', `Restored ${rows} records.`);
              } catch (e) {
                Alert.alert('Import failed', `Nothing was changed. ${errorMessage(e)}`);
              }
              refreshStats();
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Import failed', errorMessage(e));
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ThemedText type="subtitle">Diagnostics</ThemedText>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Build</ThemedText>
        <ThemedText type="small">
          Fuel {Constants.expoConfig?.version ?? '?'} · {Device.modelName ?? 'unknown device'} · {Platform.OS}{' '}
          {String(Platform.Version)}
        </ThemedText>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Barcode scanner</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Scan any packaged food to look it up: Canadian products first, then Open Food Facts online.
        </ThemedText>
        <Button label="Open scanner" onPress={() => router.push('/scan')} />
      </ThemedView>

      <FoodLibraryCard />

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Apple Health</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Requests read access to body weight and steps, then reads the latest values.
        </ThemedText>
        <Button label={probing ? 'Checking…' : 'Test Apple Health'} disabled={probing} onPress={probeHealth} />
        {health && <ThemedText type="small">{describeHealth(health)}</ThemedText>}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Data</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {stats
            ? `Schema v${stats.version} · ${stats.foods} foods · ${stats.entries} log entries · ${stats.weights} weigh-ins`
            : 'Loading…'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Backups stay on your device until you choose where to save them.
        </ThemedText>
        <Button label={busy ? 'Exporting…' : 'Export backup'} disabled={busy} onPress={exportData} />
        <Button label="Import backup" disabled={busy} onPress={importData} />
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  link: {
    textDecorationLine: 'underline',
  },
});
