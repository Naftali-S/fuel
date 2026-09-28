import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';

import { Field, FoodRow, TextButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useCatalog } from '@/food/catalog-provider';
import { clearEstimates, fillMissingNutrients } from '@/food/estimate';
import { getFood, saveFood, type StoredFood } from '@/food/food-store';
import { searchReference } from '@/food/reference-db';
import type { FoodRecord } from '@/food/types';

export default function EstimateFoodScreen() {
  const { foodId } = useLocalSearchParams<{ foodId: string }>();
  const { catalog } = useCatalog();
  const [food, setFood] = useState<StoredFood | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FoodRecord[]>([]);
  const requestId = useRef(0);

  useEffect(() => {
    getFood(catalog.main, Number(foodId)).then((f) => {
      setFood(f);
      if (f) setQuery(f.name.split(/[\s,]+/).slice(0, 2).join(' '));
    });
  }, [catalog.main, foodId]);

  useEffect(() => {
    const id = ++requestId.current;
    const cnf = catalog.cnf;
    if (!cnf || query.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const results = await searchReference(cnf, query, 25).catch(() => []);
      if (id === requestId.current) setHits(results);
    }, 200);
    return () => clearTimeout(timer);
  }, [catalog.cnf, query]);

  if (!food) return <ThemedView style={styles.fill} />;

  const apply = (ref: FoodRecord) => {
    const filled = fillMissingNutrients(food, ref);
    const added = (filled.estimated?.length ?? 0) - (food.estimated?.length ?? 0);
    if (added <= 0) {
      Alert.alert('Nothing to add', `${ref.name} doesn’t have any nutrients this food is missing.`);
      return;
    }
    Alert.alert(
      `Add ${added} estimated nutrients?`,
      `Missing values will be copied from “${ref.name}” (Canadian Nutrient File) and marked as estimates. Values on the label are never changed. Entries you already logged aren’t affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add estimates',
          onPress: async () => {
            await saveFood(catalog.main, filled);
            router.back();
          },
        },
      ],
    );
  };

  const removeEstimates = async () => {
    await saveFood(catalog.main, clearEstimates(food));
    router.back();
  };

  return (
    <ThemedView style={styles.fill}>
      <View style={styles.top}>
        <ThemedText type="smallBold">{food.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Micronutrient data: {Math.round(food.microCompleteness * 100)}%
          {food.estimated?.length ? ` (${food.estimated.length} estimated)` : ''}. Pick the closest generic food to fill in
          what the label doesn’t list.
        </ThemedText>
        {!!food.estimated?.length && <TextButton label="Remove estimates" danger onPress={removeEstimates} />}
        <Field label="Similar generic food" value={query} onChangeText={setQuery} autoCorrect={false} clearButtonMode="while-editing" />
      </View>
      <FlatList
        data={hits}
        keyExtractor={(f) => f.sourceId}
        renderItem={({ item }) => <FoodRow food={item} origin="cnf" onPress={() => apply(item)} />}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { padding: Spacing.three, gap: Spacing.two },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six },
  sep: { height: Spacing.two },
});
