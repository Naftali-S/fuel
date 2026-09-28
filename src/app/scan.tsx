import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { FoodCard } from '@/components/food-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { lookupBarcode, type BarcodeLookup } from '@/food/catalog';
import { useCatalog } from '@/food/catalog-provider';

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
          {lookup?.status === 'found' && <FoodCard food={lookup.hit.food} origin={lookup.hit.origin} />}
          {lookup?.status === 'not-found' && (
            <ThemedText type="small">
              No match for {lookup.gtin} in Canadian data or Open Food Facts. Adding your own foods comes next.
            </ThemedText>
          )}
          {lookup?.status === 'error' && (
            <ThemedText type="small">
              Couldn’t look up {lookup.gtin}: {lookup.message}
            </ThemedText>
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
