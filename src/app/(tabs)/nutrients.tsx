import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ChipRow, TextButton } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Accent, Spacing } from '@/constants/theme';
import { useDatabase } from '@/db/database-provider';
import { addDays, localIsoDate } from '@/engine/dates';
import { useCatalog } from '@/food/catalog-provider';
import { parseDecimal } from '@/food/label';
import { useTheme } from '@/hooks/use-theme';
import { entriesForDate, intakeDays } from '@/log/log-store';
import { bestSources, entriesByDate, personalTargets, setOverride, type FoodSource } from '@/nutrition/nutrition-store';
import { averageReport, consistentlyLow, dayReport, type NutrientLine } from '@/nutrition/report';
import { loadProfile } from '@/profile/profile-store';

type Mode = 'today' | 'week';

const GROUPS: { title: string; ids: readonly string[] }[] = [
  {
    title: 'Vitamins',
    ids: [
      'vitamin_a_mcg',
      'vitamin_c_mg',
      'vitamin_d_mcg',
      'vitamin_e_mg',
      'vitamin_k_mcg',
      'thiamin_mg',
      'riboflavin_mg',
      'niacin_mg',
      'vitamin_b6_mg',
      'folate_mcg',
      'vitamin_b12_mcg',
      'pantothenic_mg',
      'biotin_mcg',
      'choline_mg',
    ],
  },
  {
    title: 'Minerals',
    ids: ['calcium_mg', 'iron_mg', 'magnesium_mg', 'phosphorus_mg', 'potassium_mg', 'zinc_mg', 'selenium_mcg', 'copper_mg', 'manganese_mg', 'iodide_mcg'],
  },
  { title: 'Fibre and essential fats', ids: ['fibre_g', 'omega3_g', 'omega6_g'] },
  { title: 'Limit', ids: ['sodium_mg', 'sat_fat_g', 'trans_fat_g', 'sugars_g', 'cholesterol_mg', 'caffeine_mg', 'alcohol_g'] },
];

const FLAG_COLOR = { low: '#F5A524', high: '#F2555A', ok: Accent.primary, unknown: 'rgba(128,128,128,0.5)', none: Accent.primary };

const fmt = (x: number, unit: string) =>
  `${x.toLocaleString(undefined, { maximumFractionDigits: x < 10 ? 1 : 0 })} ${unit === 'mcg' ? 'µg' : unit}`;

function NutrientRow({ line, onPress }: { line: NutrientLine; onPress: () => void }) {
  const theme = useTheme();
  const { nutrient: n, target: t } = line;
  const fraction = line.ofTarget ?? (t.upper ? line.amount / t.upper : line.ofDailyValue);
  const notes: string[] = [];
  if (line.ofDailyValue !== null) notes.push(`${Math.round(line.ofDailyValue * 100)}% DV`);
  if (line.coverage < 0.95 && line.amount > 0) notes.push(`data for ${Math.round(line.coverage * 100)}% of calories`);
  if (line.flag === 'unknown') notes.push('not enough data');
  if (line.flag === 'high') notes.push(t.upperKind === 'CDRR' ? 'above the chronic-disease risk level' : 'above the upper limit');
  if (t.source === 'user') notes.push('your target');

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityHint="Set your own target" style={styles.row}>
      <View style={styles.rowTop}>
        <ThemedText type="small" style={styles.rowName}>
          {n.name}
        </ThemedText>
        <ThemedText type="small">
          {fmt(line.amount, n.unit)}
          {t.target ? ` / ${fmt(t.target, n.unit)}` : t.upper ? ` / max ${fmt(t.upper, n.unit)}` : ''}
        </ThemedText>
      </View>
      {fraction !== null && fraction !== undefined && (
        <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
          <View style={[styles.fill, { width: `${Math.min(100, fraction * 100)}%`, backgroundColor: FLAG_COLOR[line.flag] }]} />
        </View>
      )}
      {notes.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          {notes.join(' · ')}
        </ThemedText>
      )}
    </Pressable>
  );
}

export default function NutrientsScreen() {
  const db = useDatabase();
  const { catalog } = useCatalog();
  const [mode, setMode] = useState<Mode>('today');
  const [lines, setLines] = useState<{ today: NutrientLine[]; week: NutrientLine[] } | null>(null);
  const [weekDays, setWeekDays] = useState(0);
  const [hasProfile, setHasProfile] = useState(true);
  const [sources, setSources] = useState<{ id: string; list: FoodSource[] } | null>(null);

  const load = useCallback(async () => {
    const today = localIsoDate(new Date());
    const from = addDays(today, -7);
    const to = addDays(today, -1);
    const profile = await loadProfile(db, today);
    const targets = await personalTargets(db, profile, today);
    const [todayEntries, days, byDate] = await Promise.all([
      entriesForDate(db, today),
      intakeDays(db, from, to, today),
      entriesByDate(db, from, to),
    ]);
    const complete = days.filter((d) => d.status === 'complete').map((d) => byDate.get(d.date) ?? []);
    setHasProfile(profile !== null);
    setWeekDays(complete.length);
    setLines({ today: dayReport(todayEntries, targets), week: averageReport(complete, targets) });
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load().catch((e) => Alert.alert('Couldn’t load nutrients', e instanceof Error ? e.message : String(e)));
    }, [load]),
  );

  const editTarget = (line: NutrientLine) => {
    const unit = line.nutrient.unit === 'mcg' ? 'µg' : line.nutrient.unit;
    Alert.prompt(
      line.nutrient.name,
      `Your own daily target in ${unit}. Leave empty to use Health Canada’s${line.target.target && line.target.source !== 'user' ? ` (${line.target.target} ${unit})` : ''}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: async (text?: string) => {
            try {
              const v = parseDecimal(text ?? '');
              if (Number.isNaN(v)) throw new RangeError('Enter a number.');
              await setOverride(db, line.nutrient.id, v ?? null);
              await load();
            } catch (e) {
              Alert.alert('Couldn’t save', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
      'plain-text',
      line.target.source === 'user' && line.target.target ? String(line.target.target) : '',
      'decimal-pad',
    );
  };

  const showSources = async (id: string) => {
    if (sources?.id === id) {
      setSources(null);
      return;
    }
    if (!catalog.cnf) return;
    setSources({ id, list: await bestSources(catalog.cnf, id) });
  };

  const shown = lines ? (mode === 'today' ? lines.today : lines.week) : [];
  const byId = new Map(shown.map((l) => [l.nutrient.id, l]));
  const low = lines && weekDays >= 3 ? consistentlyLow(lines.week).slice(0, 4) : [];

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <ThemedText type="subtitle">Nutrients</ThemedText>
      <ChipRow
        options={[
          { value: 'today', label: 'Today' },
          { value: 'week', label: `7-day average${weekDays ? ` (${weekDays} days)` : ''}` },
        ]}
        value={mode}
        onChange={setMode}
        scroll={false}
      />

      {!hasProfile && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="small">Add your age and sex to get personal targets. Until then, general adult values are used.</ThemedText>
          <TextButton label="Set up profile" onPress={() => router.push('/profile')} />
        </ThemedView>
      )}

      {low.length > 0 && (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Low most days this week</ThemedText>
          {low.map((l) => (
            <View key={l.nutrient.id} style={styles.gap}>
              <View style={styles.rowTop}>
                <ThemedText type="small">
                  {l.nutrient.name}: {Math.round((l.ofTarget ?? 0) * 100)}% of target
                </ThemedText>
                <TextButton
                  label={sources?.id === l.nutrient.id ? 'Hide' : 'Good sources'}
                  onPress={() => showSources(l.nutrient.id)}
                />
              </View>
              {sources?.id === l.nutrient.id &&
                sources.list.map((s) => (
                  <ThemedText key={s.name} type="small" themeColor="textSecondary">
                    • {s.name}: {s.portion.label} has {fmt(s.amount, l.nutrient.unit)} ({Math.round(s.kcal)} kcal)
                  </ThemedText>
                ))}
            </View>
          ))}
          <ThemedText type="small" themeColor="textSecondary">
            Sources from the Canadian Nutrient File. Not medical advice; supplements are a question for your doctor or
            pharmacist.
          </ThemedText>
        </ThemedView>
      )}

      {mode === 'week' && weekDays === 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          No complete days in the past week yet.
        </ThemedText>
      )}

      {GROUPS.map((g) => {
        const rows = g.ids.map((id) => byId.get(id)).filter((l): l is NutrientLine => !!l);
        if (!rows.length) return null;
        return (
          <ThemedView key={g.title} type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{g.title}</ThemedText>
            {rows.map((l) => (
              <NutrientRow key={l.nutrient.id} line={l} onPress={() => editTarget(l)} />
            ))}
          </ThemedView>
        );
      })}

      <ThemedText type="small" themeColor="textSecondary">
        Targets: Health Canada Dietary Reference Intakes (RDA or AI) for your age and sex. % DV: Health Canada Table of
        Daily Values. Upper limits that apply only to supplements aren’t used to judge food. For healthy adults; not for
        pregnancy, breastfeeding or medical conditions.
      </ThemedText>
      <TextButton label="Edit profile" onPress={() => router.push('/profile')} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  gap: { gap: Spacing.one },
  row: { gap: Spacing.one, paddingVertical: Spacing.one },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  rowName: { flex: 1 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
