import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { NUTRIENTS } from '@/db/nutrient-catalog';
import type { FoodOrigin } from '@/food/catalog';
import type { FoodRecord } from '@/food/types';

const ORIGIN_LABEL: Record<FoodOrigin, string> = {
  mine: 'Your foods',
  cnf: 'Canadian Nutrient File',
  'off-ca': 'Open Food Facts',
  'off-live': 'Open Food Facts',
};

function regionBadge(food: FoodRecord): string {
  if (food.region === 'CA') return '🇨🇦';
  if (food.region === 'US') return '🇺🇸 US data';
  return '🌐';
}

const fmt = (x: number | undefined, digits = 0) =>
  x === undefined ? '–' : x.toLocaleString(undefined, { maximumFractionDigits: digits });

export function FoodCard({ food, origin }: { food: FoodRecord; origin: FoodOrigin }) {
  const [open, setOpen] = useState(false);
  const n = food.nutrients;
  const unit = food.basis === 'ml' ? '100 mL' : '100 g';
  const serving = food.servings[0];

  return (
    <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityHint="Shows all nutrients">
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.header}>
          <ThemedText type="smallBold" style={styles.name}>
            {food.name}
          </ThemedText>
          <ThemedText type="small" style={food.region === 'US' ? styles.us : undefined}>
            {regionBadge(food)}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {[food.brand, ORIGIN_LABEL[origin]].filter(Boolean).join(' · ')}
        </ThemedText>
        <ThemedText type="small">
          Per {unit}: {fmt(n.energy_kcal)} kcal · P {fmt(n.protein_g, 1)} g · F {fmt(n.fat_g, 1)} g · C {fmt(n.carbs_g, 1)} g
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Micronutrient data: {Math.round(food.microCompleteness * 100)}%
          {serving ? ` · ${serving.label} = ${fmt(serving.amount, 1)} ${food.basis === 'ml' ? 'mL' : 'g'}` : ''}
        </ThemedText>
        {open && (
          <View style={styles.table}>
            {NUTRIENTS.filter((d) => n[d.id] !== undefined).map((d) => (
              <View key={d.id} style={styles.row}>
                <ThemedText type="small">{d.name}</ThemedText>
                <ThemedText type="small">
                  {fmt(n[d.id], 2)} {d.unit}
                </ThemedText>
              </View>
            ))}
          </View>
        )}
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  name: { flex: 1 },
  us: { color: Accent.secondary },
  table: { marginTop: Spacing.two, gap: Spacing.half },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
