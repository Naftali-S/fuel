import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FoodCard } from '@/components/food-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { localIsoDate } from '@/engine/dates';
import { ensureSaved, lookupBarcode, type BarcodeLookup, type FoodHit } from '@/food/catalog';
import { useCatalog } from '@/food/catalog-provider';
import { isMeal, MEAL_LABELS, mealForTime } from '@/log/log-store';

type ScanState = { raw: string; lookup: BarcodeLookup | null };

const INVALID_TEXT: Record<Extract<BarcodeLookup, { status: 'invalid' }>['reason'], string> = {
  empty: 'The scan was empty.',
  'non-numeric': 'That code isn’t a product barcode.',
  'bad-length': 'That code isn’t a product barcode.',
  'bad-check-digit': 'The barcode didn’t read cleanly. Try again.',
  'bad-upce': 'The barcode didn’t read cleanly. Try again.',
};

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const { catalog } = useCatalog();
  const params = useLocalSearchParams<{ date?: string; meal?: string }>();
  const date = params.date ?? localIsoDate(new Date());
  const meal = isMeal(params.meal) ? params.meal : mealForTime(new Date());
  const [scan, setScan] = useState<ScanState | null>(null);
  // The camera fires many callbacks per second; only the first one per scan counts.
  const locked = useRef(false);

  const onScanned = async ({ data, type }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    setScan({ raw: data, lookup: null });
    const lookup = await lookupBarcode(catalog, data, type);
    setScan({ raw: data, lookup });
  };

  const scanAgain = () => {
    setScan(null);
    locked.current = false;
  };

  const logIt = async (hit: FoodHit) => {
    try {
      const foodId = await ensureSaved(catalog, hit);
      router.replace({ pathname: '/log-food', params: { foodId: String(foodId), date, meal } });
    } catch (e) {
      Alert.alert('Couldn’t open that food', e instanceof Error ? e.message : String(e));
    }
  };

  const enterLabel = (gtin: string) => router.replace({ pathname: '/food-editor', params: { barcode: gtin, date, meal } });

  if (!permission) return <ThemedView style={styles.fill} />;

  if (!permission.granted) {
    return (
      <ThemedView style={[styles.fill, styles.centered]}>
        <ThemedText style={styles.centerText}>Fuel needs camera access to scan barcodes.</ThemedText>
        <Button label="Allow camera" onPress={requestPermission} />
      </ThemedView>
    );
  }

  const lookup = scan?.lookup;
  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={scan ? undefined : onScanned}
      />
      <View pointerEvents="none" style={styles.reticleWrap}>
        <View style={styles.reticle} />
      </View>
      {scan && (
        <ThemedView style={styles.sheet}>
          {!lookup && <ThemedText type="small">Looking up {scan.raw}…</ThemedText>}
          {lookup?.status === 'found' && (
            <>
              <FoodCard food={lookup.hit.food} origin={lookup.hit.origin} />
              <Button label={`Log this (${MEAL_LABELS[meal]})`} onPress={() => logIt(lookup.hit)} />
            </>
          )}
          {lookup?.status === 'not-found' && (
            <>
              <ThemedText type="small">No match for {lookup.gtin}. You can enter it from the label once, and it’s saved for next time.</ThemedText>
              <Button label="Enter it from the label" onPress={() => enterLabel(lookup.gtin)} />
            </>
          )}
          {lookup?.status === 'error' && (
            <>
              <ThemedText type="small">
                Couldn’t look up {lookup.gtin}: {lookup.message}
              </ThemedText>
              <Button label="Enter it from the label" onPress={() => enterLabel(lookup.gtin)} />
            </>
          )}
          {lookup?.status === 'invalid' && <ThemedText type="small">{INVALID_TEXT[lookup.reason]}</ThemedText>}
          <Button label="Scan again" onPress={scanAgain} />
        </ThemedView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.four },
  centerText: { textAlign: 'center' },
  reticleWrap: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  reticle: {
    width: '78%',
    height: 150,
    borderRadius: Spacing.three,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  sheet: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.five,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
});
