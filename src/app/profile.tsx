import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ChipRow, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useDatabase } from '@/db/database-provider';
import { localIsoDate } from '@/engine/dates';
import type { ActivityLevel, MetabolicSex } from '@/engine/energy';
import { parseDecimal } from '@/food/label';
import { loadProfile, saveProfile } from '@/profile/profile-store';

const SEX_OPTIONS: { value: MetabolicSex; label: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'unspecified', label: 'Prefer not to say' },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting', hint: 'Desk job, little walking' },
  { value: 'light', label: 'Light', hint: 'On your feet some of the day, or 1–3 workouts a week' },
  { value: 'moderate', label: 'Moderate', hint: '3–5 workouts a week or an active job' },
  { value: 'high', label: 'High', hint: '6–7 hard workouts a week' },
  { value: 'very_high', label: 'Very high', hint: 'Physical job plus hard training' },
];

export default function ProfileScreen() {
  const db = useDatabase();
  const [sex, setSex] = useState<MetabolicSex | null>(null);
  const [birthDate, setBirthDate] = useState('');
  const [heightText, setHeightText] = useState('');
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [bodyFatText, setBodyFatText] = useState('');

  useEffect(() => {
    loadProfile(db).then((p) => {
      if (!p) return;
      setSex(p.sex);
      setBirthDate(p.birthDate);
      setHeightText(String(p.heightCm));
      setActivity(p.activity);
      setBodyFatText(p.bodyFatPct !== undefined ? String(p.bodyFatPct) : '');
    });
  }, [db]);

  const save = async () => {
    try {
      const bodyFat = parseDecimal(bodyFatText);
      await saveProfile(
        db,
        {
          sex: sex ?? ('' as MetabolicSex),
          birthDate: birthDate.trim(),
          heightCm: parseDecimal(heightText) ?? NaN,
          activity: activity ?? ('' as ActivityLevel),
          ...(bodyFat !== undefined && { bodyFatPct: bodyFat }),
        },
        localIsoDate(new Date()),
      );
      router.back();
    } catch (e) {
      Alert.alert('Check your profile', e instanceof Error ? e.message : String(e));
    }
  };

  const activityHint = ACTIVITY_OPTIONS.find((a) => a.value === activity)?.hint;

  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding" keyboardVerticalOffset={80}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          Used to set your nutrient targets from Health Canada’s Dietary Reference Intakes, and later to estimate your
          energy needs. Stays on this iPhone.
        </ThemedText>

        <View style={styles.gap}>
          <ThemedText type="small" themeColor="textSecondary">
            Sex (for nutrition equations)
          </ThemedText>
          <ChipRow options={SEX_OPTIONS} value={sex} onChange={setSex} scroll={false} />
          {sex === 'unspecified' && (
            <ThemedText type="small" themeColor="textSecondary">
              Fuel will use the higher of the two recommendations and the midpoint of the energy equations.
            </ThemedText>
          )}
        </View>

        <Field
          label="Birth date (YYYY-MM-DD)"
          value={birthDate}
          onChangeText={setBirthDate}
          placeholder="1995-06-30"
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
        />
        <Field label="Height (cm)" value={heightText} onChangeText={setHeightText} keyboardType="decimal-pad" />

        <View style={styles.gap}>
          <ThemedText type="small" themeColor="textSecondary">
            Activity outside logged workouts
          </ThemedText>
          <ChipRow options={ACTIVITY_OPTIONS} value={activity} onChange={setActivity} scroll={false} />
          {activityHint && (
            <ThemedText type="small" themeColor="textSecondary">
              {activityHint}
            </ThemedText>
          )}
        </View>

        <Field
          label="Body fat % (optional)"
          value={bodyFatText}
          onChangeText={setBodyFatText}
          keyboardType="decimal-pad"
          hint="Only if you know it reasonably well (e.g. from a DEXA scan)."
        />

        <Button label="Save profile" onPress={save} />
        <ThemedText type="small" themeColor="textSecondary">
          Targets are for healthy adults. They don’t cover pregnancy, breastfeeding or medical conditions. Ask a
          registered dietitian or your doctor about those. Fuel isn’t medical advice.
        </ThemedText>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  gap: { gap: Spacing.one },
});
