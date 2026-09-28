import { useEffect, useRef, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { FoodCard } from '@/components/food-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { searchFoods, type FoodHit } from '@/food/catalog';
import { useCatalog } from '@/food/catalog-provider';
import { useTheme } from '@/hooks/use-theme';

const DEBOUNCE_MS = 200;

export default function FoodSearchScreen() {
  const { catalog, offCa } = useCatalog();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<FoodHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const searchable = query.trim().length >= 2;

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

  return (
    <ThemedView style={styles.fill}>
      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search foods (English or French)"
          placeholderTextColor={theme.textSecondary}
          autoFocus
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
          style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
          accessibilityLabel="Search foods"
        />
        {!offCa && (
          <ThemedText type="small" themeColor="textSecondary">
            Searching generic foods only. Download Canadian products in Diagnostics for brands.
          </ThemedText>
        )}
        {error && <ThemedText type="small">Search failed: {error}</ThemedText>}
      </View>
      <FlatList
        data={searchable ? hits : []}
        keyExtractor={(h) => `${h.origin}:${h.food.source}:${h.food.sourceId}`}
        renderItem={({ item }) => <FoodCard food={item.food} origin={item.origin} />}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          searchable ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              No matches.
            </ThemedText>
          ) : null
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  searchWrap: { padding: Spacing.three, gap: Spacing.two },
  input: { fontSize: 17, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two + 2, borderRadius: Spacing.three },
  list: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.six, gap: Spacing.two },
  empty: { textAlign: 'center', marginTop: Spacing.four },
});
