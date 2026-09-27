import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { normalizeBarcode, type NormalizedBarcode } from '@/lib/barcode';

type ScanResult = { raw: string; type: string; normalized: NormalizedBarcode };

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [result, setResult] = useState<ScanResult | null>(null);
  // The camera fires many callbacks per second; only the first one per scan counts.
  const locked = useRef(false);

  const onScanned = ({ data, type }: BarcodeScanningResult) => {
    if (locked.current) return;
    locked.current = true;
    setResult({ raw: data, type, normalized: normalizeBarcode(data, type) });
  };

  const scanAgain = () => {
    setResult(null);
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

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
        onBarcodeScanned={result ? undefined : onScanned}
      />
      <View pointerEvents="none" style={styles.reticleWrap}>
        <View style={styles.reticle} />
      </View>
      {result && (
        <ThemedView type="backgroundElement" style={styles.sheet}>
          <ThemedText type="smallBold">Scanned {result.type}</ThemedText>
          <ThemedText type="code">raw: {result.raw}</ThemedText>
          {result.normalized.ok ? (
            <ThemedText type="code">
              GTIN: {result.normalized.gtin} · lookup keys: {result.normalized.candidates.join(', ')}
            </ThemedText>
          ) : (
            <ThemedText type="code">rejected: {result.normalized.reason}</ThemedText>
          )}
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
