import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field, FoodRow, TextButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { ensureSaved, searchFoods, type FoodHit } from '@/food/catalog';
import { useCatalog } from '@/food/catalog-provider';
import { getFood, type StoredFood } from '@/food/food-store';
import { parseDecimal } from '@/food/label';
import { scaleNutrients } from '@/food/portion';
import { combineIngredients, loadRecipe, saveRecipe } from '@/food/recipe';

interface Ingredient {
  food: StoredFood;
  amountText: string;
}

const fmt = (x: number | undefined, digits = 0) =>
  x === undefined || !Number.isFinite(x) ? '–' : x.toLocaleString(undefined, { maximumFractionDigits: digits });

function tryCombine(parts: { nutrients: Record<string, number>; amount: number }[], cooked: number | undefined) {
  try {
    return parts.some((p) => p.amount > 0) ? combineIngredients(parts, cooked) : null;
  } catch {
    return null;
  }
}

export default function RecipeEditorScreen() {
  const params = useLocalSearchParams<{ foodId?: string }>();
  const { catalog } = useCatalog();
  const db = catalog.main;
  const editingId = params.foodId ? Number(params.foodId) : undefined;
  const [name, setName] = useState('');
  const [servingsText, setServingsText] = useState('');
  const [cookedText, setCookedText] = useState('');
  const [items, setItems] = useState<Ingredient[]>([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FoodHit[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    if (!editingId) return;
    loadRecipe(db, editingId).then((r) => {
      if (!r) return;
      setName(r.food.name);
      setServingsText(r.servings ? String(r.servings) : '');
      setCookedText(r.cookedWeight ? String(r.cookedWeight) : '');
      setItems(r.items.map((i) => ({ food: i.food, amountText: String(i.amount) })));
    });
  }, [db, editingId]);

  useEffect(() => {
    const id = ++requestId.current;
    if (query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const results = await searchFoods(catalog, query, 12).catch(() => []);
      if (id === requestId.current) setHits(results);
    }, 200);
    return () => clearTimeout(timer);
  }, [catalog, query]);

  const addIngredient = async (hit: FoodHit) => {
    const foodId = await ensureSaved(catalog, hit);
    const food = await getFood(db, foodId);
    if (!food) return;
    setItems((list) => [...list, { food, amountText: String(food.servings[0]?.amount ?? 100) }]);
    setQuery('');
    setHits([]);
  };

  const cooked = parseDecimal(cookedText);
  const servings = parseDecimal(servingsText);
  const preview = tryCombine(
    items.map((i) => ({ nutrients: i.food.nutrients, amount: parseDecimal(i.amountText) ?? 0 })),
    cooked,
  );
  const perServing = !!preview && !!servings && servings > 0;
  const shownWeight = preview ? (perServing ? preview.totalWeight / servings! : preview.totalWeight) : 0;
  const shown = preview ? scaleNutrients(preview.per100, shownWeight) : null;

  const save = async () => {
    try {
      if (items.some((i) => !((parseDecimal(i.amountText) ?? 0) > 0))) throw new RangeError('Every ingredient needs an amount.');
      if (Number.isNaN(cooked) || Number.isNaN(servings)) throw new RangeError('Servings and cooked weight must be numbers.');
      await saveRecipe(
        db,
        {
          name,
          items: items.map((i) => ({ foodId: i.food.id, amount: parseDecimal(i.amountText)! })),
          cookedWeight: cooked ?? null,
          servings: servings ?? null,
        },
        editingId,
      );
      router.back();
    } catch (e) {
      Alert.alert('Check the recipe', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={80}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Recipe name" value={name} onChangeText={setName} placeholder="e.g. Chili, big batch" />
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Field label="Servings (optional)" value={servingsText} onChangeText={setServingsText} keyboardType="decimal-pad" />
          </View>
          <View style={styles.flex}>
            <Field
              label="Cooked weight, g (optional)"
              value={cookedText}
              onChangeText={setCookedText}
              keyboardType="decimal-pad"
              hint="Weigh the finished pot for accuracy."
            />
          </View>
        </View>

        <ThemedText type="smallBold">Ingredients</ThemedText>
        {items.map((item, i) => (
          <ThemedView key={`${item.food.id}:${i}`} type="backgroundElement" style={styles.item}>
            <View style={styles.flex}>
              <ThemedText type="small" numberOfLines={2}>
                {item.food.name}
              </ThemedText>
            </View>
            <View style={styles.amount}>
              <Field
                label={item.food.basis === 'ml' ? 'mL' : 'g'}
                value={item.amountText}
                onChangeText={(t) => setItems((list) => list.map((x, j) => (j === i ? { ...x, amountText: t } : x)))}
                keyboardType="decimal-pad"
              />
            </View>
            <TextButton label="Remove" danger onPress={() => setItems((list) => list.filter((_, j) => j !== i))} />
          </ThemedView>
        ))}
        <Field label="Add ingredient" value={query} onChangeText={setQuery} placeholder="Search foods" autoCorrect={false} />
        {query.trim().length >= 2 &&
          hits.map((h, i) => <FoodRow key={`${h.food.sourceId}:${i}`} food={h.food} origin={h.origin} onPress={() => addIngredient(h)} />)}

        {preview && shown && (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">
              {perServing ? `Per serving (${fmt(shownWeight)} g)` : `Whole recipe (${fmt(shownWeight)} g)`}
            </ThemedText>
            <ThemedText type="small">
              {fmt(shown.energy_kcal)} kcal · P {fmt(shown.protein_g, 1)} g · F {fmt(shown.fat_g, 1)} g · C {fmt(shown.carbs_g, 1)} g
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Micronutrient data: {Math.round(preview.microCompleteness * 100)}%
            </ThemedText>
          </ThemedView>
        )}

        <Button label="Save recipe" onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  pair: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  amount: { width: 90 },
  item: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two, borderRadius: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.one },
});
