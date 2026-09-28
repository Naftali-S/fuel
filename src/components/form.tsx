/**
 * Small form building blocks shared by the logging screens: selectable
 * chips, labelled text fields and a compact food row.
 */
import { Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Accent, Spacing } from '@/constants/theme';
import type { FoodOrigin } from '@/food/catalog';
import type { FoodRecord } from '@/food/types';
import { useTheme } from '@/hooks/use-theme';

export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
  scroll = true,
}: {
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  scroll?: boolean;
}) {
  const chips = options.map((o) => {
    const selected = o.value === value;
    return (
      <Pressable
        key={String(o.value)}
        onPress={() => onChange(o.value)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        style={[styles.chip, selected && styles.chipSelected]}>
        <ThemedText type="small" style={selected ? styles.chipTextSelected : undefined}>
          {o.label}
        </ThemedText>
      </Pressable>
    );
  });
  return scroll ? (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {chips}
    </ScrollView>
  ) : (
    <View style={[styles.chips, styles.wrap]}>{chips}</View>
  );
}

export function Field({ label, hint, style, ...input }: TextInputProps & { label: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }, style]}
        accessibilityLabel={label}
        {...input}
      />
      {hint && (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
    </View>
  );
}

export function TextButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={8}>
      <ThemedText type="smallBold" style={danger ? styles.danger : styles.textButton}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const ORIGIN_SHORT: Record<FoodOrigin, string> = {
  mine: 'Yours',
  cnf: 'CNF',
  'off-ca': 'Open Food Facts',
  'off-live': 'Open Food Facts',
  usda: 'USDA',
};

/** One-line food result: name, brand · source, calories for its first portion. */
export function FoodRow({ food, origin, onPress }: { food: FoodRecord; origin: FoodOrigin; onPress: () => void }) {
  const theme = useTheme();
  const portion = food.servings[0] ?? { label: food.basis === 'ml' ? '100 mL' : '100 g', amount: 100 };
  const kcal = ((food.nutrients.energy_kcal ?? 0) * portion.amount) / 100;
  const flag = food.region === 'US' ? '🇺🇸 ' : food.region === 'CA' ? '🇨🇦 ' : '';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement }]}>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {food.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {flag}
          {[food.brand, ORIGIN_SHORT[origin]].filter(Boolean).join(' · ')}
        </ThemedText>
      </View>
      <View style={styles.rowKcal}>
        <ThemedText type="smallBold">{Math.round(kcal)} kcal</ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {portion.label}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Spacing.two, paddingVertical: Spacing.one },
  wrap: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one + 2,
    borderRadius: Spacing.four,
    borderWidth: 1,
    borderColor: 'rgba(128,128,128,0.4)',
  },
  chipSelected: { backgroundColor: Accent.primary, borderColor: Accent.primary },
  chipTextSelected: { color: Accent.onPrimary },
  field: { gap: Spacing.one },
  input: { fontSize: 17, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderRadius: Spacing.three },
  textButton: { color: Accent.primary },
  danger: { color: '#F2555A' },
  row: {
    flexDirection: 'row',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    alignItems: 'center',
  },
  rowText: { flex: 1, gap: Spacing.half },
  rowKcal: { alignItems: 'flex-end', maxWidth: '40%' },
});
