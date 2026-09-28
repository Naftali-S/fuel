import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChipRow, Field, TextButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDatabase } from '@/db/database-provider';
import { NUTRIENTS } from '@/db/nutrient-catalog';
import { DAILY_VALUES } from '@/nutrition/reference-values';
import { localIsoDate } from '@/engine/dates';
import { getFood, type StoredFood } from '@/food/food-store';
import { parseDecimal } from '@/food/label';
import { portionLabel, portionsFor, scaleNutrients, type Portion } from '@/food/portion';
import {
  addEntry,
  deleteEntry,
  getEntry,
  isMeal,
  MEAL_LABELS,
  MEALS,
  mealForTime,
  updateEntry,
  type LogEntry,
  type Meal,
} from '@/log/log-store';

const QUICK = [0.25, 0.5, 1, 1.5, 2, 3];
const fmt = (x: number | undefined, digits = 0) =>
  x === undefined ? '–' : x.toLocaleString(undefined, { maximumFractionDigits: digits });

interface Loaded {
  food: StoredFood | null;
  entry: LogEntry | null;
  portions: Portion[];
  /** Nutrients per 100 basis units. */
  per100: Record<string, number>;
  basis: 'g' | 'ml';
  name: string;
}

export default function LogFoodScreen() {
  const params = useLocalSearchParams<{ foodId?: string; entryId?: string; date?: string; meal?: string }>();
  const db = useDatabase();
  const [data, setData] = useState<Loaded | null>(null);
  const [portionIdx, setPortionIdx] = useState(0);
  const [qtyText, setQtyText] = useState('1');
  const [meal, setMeal] = useState<Meal>(isMeal(params.meal) ? params.meal : mealForTime(new Date()));
  const [showAll, setShowAll] = useState(false);
  const date = data?.entry?.date ?? params.date ?? localIsoDate(new Date());

  // Reload on focus so estimates added in "Fill in nutrients" show immediately;
  // the user's portion, amount and meal are only initialised on the first load.
  const initialised = useRef(false);
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (params.entryId) {
          const entry = await getEntry(db, Number(params.entryId));
          if (!entry) throw new Error('That entry no longer exists.');
          const food = entry.foodId ? await getFood(db, entry.foodId) : null;
          const own: Portion = { label: entry.servingLabel ?? `${entry.amount} ${entry.unit}`, amount: entry.servingAmount ?? entry.amount };
          const portions = food ? portionsFor(food) : [];
          let idx = portions.findIndex((p) => p.label === own.label && p.amount === own.amount);
          if (idx < 0) {
            portions.unshift(own);
            idx = 0;
          }
          const per100 = Object.fromEntries(Object.entries(entry.nutrients).map(([k, v]) => [k, (v * 100) / entry.amount]));
          if (cancelled) return;
          setData({ food, entry, portions, per100, basis: entry.unit, name: entry.foodName });
          if (!initialised.current) {
            setPortionIdx(idx);
            setQtyText(String(entry.quantity ?? 1));
            setMeal(entry.meal);
          }
        } else {
          const food = await getFood(db, Number(params.foodId));
          if (!food) throw new Error('That food no longer exists.');
          if (cancelled) return;
          setData({
            food,
            entry: null,
            portions: portionsFor(food),
            per100: food.nutrients,
            basis: food.basis,
            name: food.brand ? `${food.name} (${food.brand})` : food.name,
          });
        }
        initialised.current = true;
      })().catch((e) => {
        Alert.alert('Couldn’t open', e instanceof Error ? e.message : String(e));
        router.back();
      });
      return () => {
        cancelled = true;
      };
    }, [db, params.entryId, params.foodId]),
  );

  if (!data) return <ThemedView style={styles.fill} />;

  const portion = data.portions[portionIdx] ?? data.portions[0];
  const qty = parseDecimal(qtyText);
  const valid = qty !== undefined && Number.isFinite(qty) && qty > 0;
  const n = scaleNutrients(data.per100, portion.amount * (valid ? qty : 0));
  const unit = data.basis === 'ml' ? 'mL' : 'g';

  const save = async () => {
    if (!valid) return;
    try {
      if (data.entry) await updateEntry(db, data.entry.id, { meal, portion, quantity: qty });
      else await addEntry(db, { date, meal, foodId: data.food!.id, portion, quantity: qty });
      router.dismissAll();
    } catch (e) {
      Alert.alert('Couldn’t save', e instanceof Error ? e.message : String(e));
    }
  };

  const remove = () =>
    Alert.alert('Delete this entry?', data.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(db, data.entry!.id);
          router.dismissAll();
        },
      },
    ]);

  const editFood = () => {
    const f = data.food!;
    router.push({ pathname: f.source === 'recipe' ? '/recipe-editor' : '/food-editor', params: { foodId: String(f.id) } });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.gap}>
        <ThemedText type="smallBold">{data.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {date}
          {data.food?.region === 'US' ? ' · 🇺🇸 US data' : ''}
        </ThemedText>
      </View>

      <View style={styles.gap}>
        <ThemedText type="small" themeColor="textSecondary">
          Portion
        </ThemedText>
        <ChipRow options={data.portions.map((p, i) => ({ value: i, label: p.label }))} value={portionIdx} onChange={setPortionIdx} />
      </View>

      <View style={styles.gap}>
        <Field
          label="How many"
          value={qtyText}
          onChangeText={setQtyText}
          keyboardType="decimal-pad"
          selectTextOnFocus
          hint={valid ? `${fmt(portion.amount * qty, 1)} ${unit} total` : 'Enter an amount greater than zero.'}
        />
        <ChipRow
          options={QUICK.map((q) => ({ value: q, label: q === 0.25 ? '¼' : q === 0.5 ? '½' : q === 1.5 ? '1½' : String(q) }))}
          value={valid ? qty : null}
          onChange={(q) => setQtyText(String(q))}
        />
      </View>

      <View style={styles.gap}>
        <ThemedText type="small" themeColor="textSecondary">
          Meal
        </ThemedText>
        <ChipRow options={MEALS.map((m) => ({ value: m, label: MEAL_LABELS[m] }))} value={meal} onChange={setMeal} scroll={false} />
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="subtitle">{fmt(n.energy_kcal)} kcal</ThemedText>
        <ThemedText type="small">
          Protein {fmt(n.protein_g, 1)} g · Fat {fmt(n.fat_g, 1)} g · Carbs {fmt(n.carbs_g, 1)} g
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {portionLabel(portion, data.basis)} × {valid ? fmt(qty, 2) : '–'}
        </ThemedText>
        <TextButton label={showAll ? 'Hide nutrients' : 'Show all nutrients'} onPress={() => setShowAll((v) => !v)} />
        {showAll &&
          NUTRIENTS.filter((d) => n[d.id] !== undefined).map((d) => {
            const dv = DAILY_VALUES[d.id];
            const estimated = data.food?.estimated?.includes(d.id);
            return (
              <View key={d.id} style={styles.row}>
                <ThemedText type="small">
                  {d.name}
                  {estimated ? ' (est.)' : ''}
                </ThemedText>
                <ThemedText type="small">
                  {fmt(n[d.id], 2)} {d.unit === 'mcg' ? 'µg' : d.unit}
                  {dv ? `  ${Math.round((n[d.id] / dv) * 100)}% DV` : ''}
                </ThemedText>
              </View>
            );
          })}
        {data.food && (
          <ThemedText type="small" themeColor="textSecondary">
            Micronutrient data: {Math.round(data.food.microCompleteness * 100)}%
            {data.food.estimated?.length ? ` (${data.food.estimated.length} estimated)` : ''}
          </ThemedText>
        )}
      </ThemedView>

      <Button label={data.entry ? 'Save changes' : `Add to ${MEAL_LABELS[meal]}`} disabled={!valid} onPress={save} />
      <View style={styles.links}>
        {(data.food?.source === 'user' || data.food?.source === 'recipe') && <TextButton label="Edit this food" onPress={editFood} />}
        {data.entry && <TextButton label="Delete entry" danger onPress={remove} />}
      </View>
      {data.food && data.food.source !== 'cnf' && data.food.source !== 'recipe' && (
        <TextButton
          label={data.food.estimated?.length ? 'Change estimated nutrients' : 'Fill in missing nutrients'}
          onPress={() => router.push({ pathname: '/estimate-food', params: { foodId: String(data.food!.id) } })}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.four, paddingBottom: Spacing.six },
  gap: { gap: Spacing.one },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  links: { flexDirection: 'row', justifyContent: 'space-between' },
});
