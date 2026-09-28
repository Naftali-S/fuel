import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';

import { Field, FoodRow, TextButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { localIsoDate } from '@/engine/dates';
import { ensureSaved, searchFoods, searchUsda, type FoodHit } from '@/food/catalog';
import { useCatalog } from '@/food/catalog-provider';
import { getFood } from '@/food/food-store';
import { isMeal, MEAL_LABELS, mealForTime, recentFoodIds } from '@/log/log-store';

const DEBOUNCE_MS = 200;

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const date = params.date ?? localIsoDate(new Date());
  const meal = isMeal(params.meal) ? params.meal : mealForTime(new Date());

  const { catalog, offCa, hasUsdaKey } = useCatalog();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [recent, setRecent] = useState<FoodHit[]>([]);
  const [usHits, setUsHits] = useState<{ query: string; hits: FoodHit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const searchable = query.trim().length >= 2;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await recentFoodIds(catalog.main, 15);
      const foods = await Promise.all(ids.map((id) => getFood(catalog.main, id)));
      if (!cancelled) setRecent(foods.flatMap((f) => (f ? [{ origin: 'mine' as const, food: f, foodId: f.id }] : [])));
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [catalog]);

  useEffect(() => {
    const id = ++requestId.current;
    if (!searchable) return;
    const timer = setTimeout(async () => {
      try {
        const results = await searchFoods(catalog, query);
        if (id !== requestId.current) return;
        setHits(results);
        setError(null);
      } catch (e) {
        if (id === requestId.current) setError(e instanceof Error ? e.message : String(e));
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [catalog, query, searchable]);

  const pick = async (hit: FoodHit) => {
    try {
      const foodId = await ensureSaved(catalog, hit);
      router.push({ pathname: '/log-food', params: { foodId: String(foodId), date, meal } });
    } catch (e) {
      Alert.alert('Couldn’t open that food', e instanceof Error ? e.message : String(e));
    }
  };

  const searchUs = async () => {
    try {
      setUsHits({ query, hits: await searchUsda(catalog, query) });
    } catch (e) {
      Alert.alert('USDA search failed', e instanceof Error ? e.message : String(e));
    }
  };

  const showUs = usHits && usHits.query === query;
  const sections = searchable
    ? [
        { title: 'Canadian and your foods', data: hits },
        ...(showUs ? [{ title: '🇺🇸 US data (USDA)', data: usHits.hits }] : []),
      ]
    : [{ title: 'Recent', data: recent }];

  return (
    <ThemedView style={styles.fill}>
      <View style={styles.top}>
        <Field
          label={`${MEAL_LABELS[meal]} · ${date}`}
          value={query}
          onChangeText={setQuery}
          placeholder="Search foods (English or French)"
          autoFocus
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        <View style={styles.actions}>
          <TextButton label="Scan barcode" onPress={() => router.push({ pathname: '/scan', params: { date, meal } })} />
          <TextButton label="New food" onPress={() => router.push({ pathname: '/food-editor', params: { date, meal } })} />
          <TextButton label="New recipe" onPress={() => router.push('/recipe-editor')} />
        </View>
        {!offCa && (
          <ThemedText type="small" themeColor="textSecondary">
            Tip: download Canadian products in Diagnostics to search brands offline.
          </ThemedText>
        )}
        {error && <ThemedText type="small">Search failed: {error}</ThemedText>}
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(h, i) => `${h.origin}:${h.food.source}:${h.food.sourceId}:${i}`}
        renderItem={({ item }) => <FoodRow food={item.food} origin={item.origin} onPress={() => pick(item)} />}
        renderSectionHeader={({ section }) =>
          section.data.length > 0 ? (
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.section}>
              {section.title}
            </ThemedText>
          ) : null
        }
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled={false}
        ListFooterComponent={
          searchable ? (
            <View style={styles.footer}>
              {hits.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No Canadian matches.
                </ThemedText>
              )}
              {hasUsdaKey && !showUs && <TextButton label="Search US database (USDA)" onPress={searchUs} />}
              {showUs && usHits.hits.length === 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  No US matches either.
                </ThemedText>
              )}
              <TextButton
                label="Can’t find it? Enter it from the label"
                onPress={() => router.push({ pathname: '/food-editor', params: { date, meal, name: query } })}
              />
            </View>
          ) : recent.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
              Foods you log will appear here.
            </ThemedText>
          ) : null
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { padding: Spacing.three, gap: Spacing.two },
  actions: { flexDirection: 'row', gap: Spacing.four, flexWrap: 'wrap' },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six },
  section: { marginTop: Spacing.two, marginBottom: Spacing.two },
  sep: { height: Spacing.two },
  footer: { gap: Spacing.three, paddingTop: Spacing.three },
});
