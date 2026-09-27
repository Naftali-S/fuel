import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { runHealthProbe, type HealthProbeResult } from '@/features/health/health-probe';

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

  const probeHealth = async () => {
    setProbing(true);
    setHealth(await runHealthProbe());
    setProbing(false);
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
          Scan any packaged food. The raw code and its normalized GTIN are shown.
        </ThemedText>
        <Button label="Open scanner" onPress={() => router.push('/scan')} />
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Apple Health</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Requests read access to body weight and steps, then reads the latest values.
        </ThemedText>
        <Button label={probing ? 'Checking…' : 'Test Apple Health'} disabled={probing} onPress={probeHealth} />
        {health && <ThemedText type="small">{describeHealth(health)}</ThemedText>}
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
});
