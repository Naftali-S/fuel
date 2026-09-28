import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChipRow, Field, TextButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDatabase } from '@/db/database-provider';
import { NUTRIENTS } from '@/db/nutrient-catalog';
import { getFood, newSourceId, saveFood } from '@/food/food-store';
import { LABEL_FIELDS, labelToFoodRecord, labelValues, parseDecimal } from '@/food/label';

const LABEL_SET = new Set<string>(LABEL_FIELDS);
const EXTRA_FIELDS = NUTRIENTS.filter((n) => !LABEL_SET.has(n.id)).map((n) => n.id);
const DEF = Object.fromEntries(NUTRIENTS.map((n) => [n.id, n]));

export default function FoodEditorScreen() {
  const params = useLocalSearchParams<{ foodId?: string; date?: string; meal?: string; name?: string; barcode?: string }>();
  const db = useDatabase();
  const editingId = params.foodId ? Number(params.foodId) : null;
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [name, setName] = useState(params.name ?? '');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [basis, setBasis] = useState<'g' | 'ml'>('g');
  const [servingLabel, setServingLabel] = useState('');
  const [servingText, setServingText] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    if (!editingId) return;
    getFood(db, editingId).then((f) => {
      if (!f) return;
      const serving = f.servings[0] ?? { label: '', amount: 100 };
      setSourceId(f.sourceId);
      setName(f.name);
      setBrand(f.brand ?? '');
      setBarcode(f.barcodes[0] ?? '');
      setBasis(f.basis);
      setServingLabel(serving.label);
      setServingText(String(serving.amount));
      setValues(Object.fromEntries(Object.entries(labelValues(f, serving.amount)).map(([k, v]) => [k, String(v)])));
      setShowMore(Object.keys(f.nutrients).some((k) => !LABEL_SET.has(k)));
    });
  }, [db, editingId]);

  const setValue = (id: string, text: string) => setValues((v) => ({ ...v, [id]: text }));
  const unit = basis === 'ml' ? 'mL' : 'g';

  const save = async () => {
    try {
      const parsed: Record<string, number | undefined> = {};
      for (const [id, text] of Object.entries(values)) {
        const v = parseDecimal(text);
        if (Number.isNaN(v)) throw new RangeError(`${DEF[id]?.name ?? id} isn’t a number.`);
        parsed[id] = v;
      }
      const servingAmount = parseDecimal(servingText) ?? NaN;
      const record = labelToFoodRecord(
        { name, brand, basis, servingLabel, servingAmount, values: parsed, barcode },
        sourceId ?? newSourceId('user'),
      );
      const foodId = await saveFood(db, record);
      if (!editingId && params.date && params.meal) {
        router.replace({ pathname: '/log-food', params: { foodId: String(foodId), date: params.date, meal: params.meal } });
      } else {
        router.back();
      }
    } catch (e) {
      Alert.alert('Check the label', e instanceof Error ? e.message : String(e));
    }
  };

  const nutrientField = (id: string) => {
    const d = DEF[id];
    return (
      <View key={id} style={styles.cell}>
        <Field
          label={`${d.name} (${d.unit})`}
          value={values[id] ?? ''}
          onChangeText={(t) => setValue(id, t)}
          keyboardType="decimal-pad"
          placeholder="–"
        />
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={80}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          Copy the Nutrition Facts table exactly as printed, per serving. Leave unknown values blank.
        </ThemedText>
        <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Greek yogurt, plain" />
        <Field label="Brand (optional)" value={brand} onChangeText={setBrand} />
        <Field label="Barcode (optional)" value={barcode} onChangeText={setBarcode} keyboardType="number-pad" />

        <View style={styles.gap}>
          <ThemedText type="small" themeColor="textSecondary">
            Measured in
          </ThemedText>
          <ChipRow
            options={[
              { value: 'g', label: 'grams' },
              { value: 'ml', label: 'millilitres' },
            ]}
            value={basis}
            onChange={setBasis}
            scroll={false}
          />
        </View>
        <View style={styles.pair}>
          <View style={styles.flex}>
            <Field label="Serving, as printed" value={servingLabel} onChangeText={setServingLabel} placeholder="3/4 cup (175 g)" />
          </View>
          <View style={styles.size}>
            <Field label={`Size (${unit})`} value={servingText} onChangeText={setServingText} keyboardType="decimal-pad" />
          </View>
        </View>

        <ThemedText type="smallBold">Per serving</ThemedText>
        <View style={styles.grid}>{LABEL_FIELDS.map(nutrientField)}</View>
        <TextButton label={showMore ? 'Hide vitamins and minerals' : 'More vitamins and minerals'} onPress={() => setShowMore((v) => !v)} />
        {showMore && <View style={styles.grid}>{EXTRA_FIELDS.map(nutrientField)}</View>}

        <Button label={editingId ? 'Save food' : params.date ? 'Save and log' : 'Save food'} onPress={save} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  gap: { gap: Spacing.one },
  pair: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
  size: { width: 110 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: Spacing.two },
  cell: { width: '48.5%' },
});
