import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { NUTRIENTS } from '@/db/nutrient-catalog';
import type { FoodOrigin } from '@/food/catalog';
import { portionLabel, portionsFor, scaleNutrients } from '@/food/portion';
import { DAILY_VALUES } from '@/nutrition/reference-values';
import type { FoodRecord } from '@/food/types';

const ORIGIN_LABEL: Record<FoodOrigin, string> = {
  mine: 'Your foods',
  cnf: 'Canadian Nutrient File',
  'off-ca': 'Open Food Facts',
  'off-live': 'Open Food Facts',
  usda: 'USDA FoodData Central',
};

function regionBadge(food: FoodRecord): string {
  if (food.region === 'CA') return '🇨🇦';
  if (food.region === 'US') return '🇺🇸 US data';
  return '🌐';
}

const fmt = (x: number | undefined, digits = 0) =>
  x === undefined ? '–' : x.toLocaleString(undefined, { maximumFractionDigits: digits });

export function FoodCard({ food, origin }: { food: FoodRecord; origin: FoodOrigin }) {
  const portions = portionsFor(food);
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const portion = portions[Math.min(selected, portions.length - 1)];
  const n = scaleNutrients(food.nutrients, portion.amount);

  return (
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

      {portions.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {portions.map((p, i) => (
            <Pressable
              key={`${p.label}:${i}`}
              onPress={() => setSelected(i)}
              accessibilityRole="button"
              accessibilityState={{ selected: i === selected }}
              style={[styles.chip, i === selected && styles.chipSelected]}>
              <ThemedText type="small" style={i === selected ? styles.chipTextSelected : undefined}>
                {p.label}
              </ThemedText>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <ThemedText type="small">
        {portionLabel(portion, food.basis)}: {fmt(n.energy_kcal)} kcal · P {fmt(n.protein_g, 1)} g · F {fmt(n.fat_g, 1)} g ·
        C {fmt(n.carbs_g, 1)} g
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Micronutrient data: {Math.round(food.microCompleteness * 100)}%
      </ThemedText>

      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" hitSlop={8}>
        <ThemedText type="small" style={styles.toggle}>
          {open ? 'Hide nutrients' : 'Show all nutrients'}
        </ThemedText>
      </Pressable>
      {open && (
        <View style={styles.table}>
          {NUTRIENTS.filter((d) => n[d.id] !== undefined).map((d) => (
            <View key={d.id} style={styles.row}>
              <ThemedText type="small">
                {d.name}
                {food.estimated?.includes(d.id) ? ' (est.)' : ''}
              </ThemedText>
              <ThemedText type="small">
                {fmt(n[d.id], 2)} {d.unit === 'mcg' ? 'µg' : d.unit}
                {DAILY_VALUES[d.id] ? `  ${Math.round((n[d.id] / DAILY_VALUES[d.id]) * 100)}% DV` : ''}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  header: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.two },
  name: { flex: 1 },
  us: { color: Accent.secondary },
  chips: { gap: Spacing.two, paddingVertical: Spacing.one },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.4)',
  },
  chipSelected: { backgroundColor: Accent.primary, borderColor: Accent.primary },
  chipTextSelected: { color: Accent.onPrimary },
  toggle: { color: Accent.primary },
  table: { marginTop: Spacing.two, gap: Spacing.half },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
