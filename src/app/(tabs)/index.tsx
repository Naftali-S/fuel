import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { TextButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useDatabase } from '@/db/database-provider';
import { NUTRIENTS } from '@/db/nutrient-catalog';
import { addDays, localIsoDate, type IsoDate } from '@/engine/dates';
import type { DayStatus } from '@/engine/expenditure';
import { useTheme } from '@/hooks/use-theme';
import { dayTitle, entryAmount } from '@/log/format';
import {
  dayStatus,
  deleteEntry,
  entriesForDate,
  MEAL_LABELS,
  MEALS,
  setDayStatus,
  sumNutrients,
  type LogEntry,
} from '@/log/log-store';

interface Target {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

const STATUS_LABEL: Record<DayStatus, string> = {
  complete: 'Complete',
  partial: 'Partly logged',
  unlogged: 'Not logged',
  fasting: 'Fasting day',
};

const fmt = (x: number | undefined, digits = 0) =>
  x === undefined ? '0' : x.toLocaleString(undefined, { maximumFractionDigits: digits });

/** Today's date, kept current when the screen regains focus or the app returns to the foreground. */
function useToday(onNewDay: (previous: IsoDate, now: IsoDate) => void): IsoDate {
  const [today, setToday] = useState(() => localIsoDate(new Date()));
  const refresh = useCallback(() => {
    const now = localIsoDate(new Date());
    if (now === today) return;
    onNewDay(today, now);
    setToday(now);
  }, [today, onNewDay]);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);
  return today;
}

export default function TodayScreen() {
  const db = useDatabase();
  const theme = useTheme();
  const [date, setDate] = useState<IsoDate>(() => localIsoDate(new Date()));
  // If you were looking at "today" when the date changed, follow it to the new day.
  const followNewDay = useCallback((previous: IsoDate, now: IsoDate) => setDate((d) => (d === previous ? now : d)), []);
  const today = useToday(followNewDay);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<{ status: DayStatus; explicit: boolean } | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [showNutrients, setShowNutrients] = useState(false);

  const load = useCallback(async () => {
    const [e, s, t] = await Promise.all([
      entriesForDate(db, date),
      dayStatus(db, date, localIsoDate(new Date())),
      db.get<Target>('SELECT kcal, protein_g, fat_g, carbs_g FROM targets WHERE date <= ? ORDER BY date DESC LIMIT 1', [date]),
    ]);
    setEntries(e);
    setStatus(s);
    setTarget(t);
  }, [db, date]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => Alert.alert('Couldn’t load the day', e instanceof Error ? e.message : String(e)));
    }, [load]),
  );

  const totals = sumNutrients(entries);
  const addFood = (meal: string) => router.push({ pathname: '/add-food', params: { date, meal } });

  const chooseStatus = () => {
    const options: { label: string; value: DayStatus | null }[] = [
      { label: 'Complete: everything is logged', value: 'complete' },
      { label: 'Partly logged: skip this day in estimates', value: 'partial' },
      { label: 'Fasting day: ate nothing', value: 'fasting' },
      { label: 'Automatic', value: null },
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: 'How complete is this day’s log?', options: [...options.map((o) => o.label), 'Cancel'], cancelButtonIndex: options.length },
      async (i) => {
        if (i >= options.length) return;
        await setDayStatus(db, date, options[i].value);
        await load();
      },
    );
  };

  const confirmDelete = (e: LogEntry) =>
    Alert.alert('Delete this entry?', e.foodName, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntry(db, e.id);
          await load();
        },
      },
    ]);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <View style={styles.dateRow}>
        <TextButton label="‹ Prev" onPress={() => setDate((d) => addDays(d, -1))} />
        <Pressable onPress={() => setDate(today)} accessibilityRole="button" accessibilityHint="Jumps to today">
          <ThemedText type="subtitle">{dayTitle(date, today)}</ThemedText>
        </Pressable>
        <TextButton label="Next ›" onPress={() => setDate((d) => addDays(d, 1))} />
      </View>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="title" style={styles.kcal}>
          {fmt(totals.energy_kcal)}
          <ThemedText type="small" themeColor="textSecondary">
            {target ? ` / ${fmt(target.kcal)} kcal` : ' kcal'}
          </ThemedText>
        </ThemedText>
        <View style={styles.macros}>
          {(
            [
              ['Protein', 'protein_g', target?.protein_g],
              ['Fat', 'fat_g', target?.fat_g],
              ['Carbs', 'carbs_g', target?.carbs_g],
            ] as const
          ).map(([label, id, goal]) => (
            <View key={id}>
              <ThemedText type="smallBold">
                {fmt(totals[id])}
                {goal ? ` / ${fmt(goal)}` : ''} g
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {label}
              </ThemedText>
            </View>
          ))}
        </View>
        {!target && (
          <ThemedText type="small" themeColor="textSecondary">
            Targets appear once coaching is set up.
          </ThemedText>
        )}
        {status && (
          <Pressable onPress={chooseStatus} accessibilityRole="button">
            <ThemedText type="small" style={styles.status}>
              Day: {STATUS_LABEL[status.status]}
              {status.explicit ? '' : ' (automatic)'} ▾
            </ThemedText>
          </Pressable>
        )}
      </ThemedView>

      {MEALS.map((meal) => {
        const list = entries.filter((e) => e.meal === meal);
        const kcal = sumNutrients(list).energy_kcal;
        return (
          <ThemedView key={meal} type="backgroundElement" style={styles.card}>
            <View style={styles.mealHeader}>
              <ThemedText type="smallBold">
                {MEAL_LABELS[meal]}
                {list.length ? ` · ${fmt(kcal)} kcal` : ''}
              </ThemedText>
              <TextButton label="+ Add" onPress={() => addFood(meal)} />
            </View>
            {list.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: '/log-food', params: { entryId: String(e.id) } })}
                onLongPress={() => confirmDelete(e)}
                accessibilityRole="button"
                accessibilityHint="Edit. Long press to delete."
                style={({ pressed }) => [styles.entry, pressed && { backgroundColor: theme.backgroundSelected }]}>
                <View style={styles.entryText}>
                  <ThemedText type="small" numberOfLines={1}>
                    {e.foodName}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {entryAmount(e)}
                  </ThemedText>
                </View>
                <ThemedText type="small">{fmt(e.nutrients.energy_kcal)}</ThemedText>
              </Pressable>
            ))}
          </ThemedView>
        );
      })}

      {entries.length > 0 && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <TextButton label={showNutrients ? 'Hide nutrients' : 'All nutrients for the day'} onPress={() => setShowNutrients((v) => !v)} />
          {showNutrients &&
            NUTRIENTS.filter((d) => totals[d.id] !== undefined).map((d) => (
              <View key={d.id} style={styles.row}>
                <ThemedText type="small">{d.name}</ThemedText>
                <ThemedText type="small">
                  {fmt(totals[d.id], d.unit === 'g' || d.unit === 'kcal' ? 1 : 2)} {d.unit}
                </ThemedText>
              </View>
            ))}
          {showNutrients && (
            <ThemedText type="small" themeColor="textSecondary">
              Totals include only nutrients each food reports. Targets and % daily value arrive with micronutrient tracking.
            </ThemedText>
          )}
        </ThemedView>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  kcal: { fontSize: 40, lineHeight: 46 },
  macros: { flexDirection: 'row', justifyContent: 'space-between' },
  status: { color: Accent.primary },
  mealHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one, borderRadius: Spacing.two },
  entryText: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
});
