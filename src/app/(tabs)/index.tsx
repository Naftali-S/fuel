import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function TodayScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ThemedText type="subtitle">Today</ThemedText>
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText>
          Fuel is in Phase 0. Food logging, the energy dashboard and coaching arrive in later phases.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Use the Diagnostics tab to verify the barcode scanner and Apple Health access on this device.
        </ThemedText>
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
