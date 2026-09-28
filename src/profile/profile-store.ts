/**
 * The user's profile (used for DRI targets now and energy estimates later),
 * stored as JSON under the `profile` settings key.
 */
import type { SqlDriver } from '@/db/driver';
import { isIsoDate, localIsoDate, type IsoDate } from '@/engine/dates';
import { ACTIVITY_FACTORS, ageOn, type MetabolicSex, type Profile } from '@/engine/energy';

const KEY = 'profile';
const SEXES: readonly MetabolicSex[] = ['male', 'female', 'unspecified'];

/** Problems with a profile, as plain sentences (empty when valid). */
export function profileProblems(p: Partial<Profile>, today: IsoDate): string[] {
  const problems: string[] = [];
  if (!p.sex || !SEXES.includes(p.sex)) problems.push('Choose a sex for the nutrition equations.');
  if (!p.birthDate || !isIsoDate(p.birthDate)) {
    problems.push('Enter your birth date as YYYY-MM-DD.');
  } else {
    const age = ageOn(p.birthDate, today);
    if (age < 18 || age > 110) problems.push('Fuel’s targets are for adults 18 and over.');
  }
  if (!(p.heightCm !== undefined && p.heightCm >= 120 && p.heightCm <= 230)) problems.push('Height should be between 120 and 230 cm.');
  if (!p.activity || !(p.activity in ACTIVITY_FACTORS)) problems.push('Choose an activity level.');
  if (p.bodyFatPct !== undefined && !(p.bodyFatPct >= 3 && p.bodyFatPct <= 60)) {
    problems.push('Body fat should be between 3% and 60%, or left blank.');
  }
  return problems;
}

export async function loadProfile(db: SqlDriver, today: IsoDate = localIsoDate(new Date())): Promise<Profile | null> {
  const row = await db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [KEY]);
  if (!row) return null;
  try {
    const p = JSON.parse(row.value) as Profile;
    return profileProblems(p, today).length === 0 ? p : null;
  } catch {
    return null;
  }
}

export async function saveProfile(db: SqlDriver, p: Profile, today: IsoDate): Promise<void> {
  const problems = profileProblems(p, today);
  if (problems.length) throw new RangeError(problems.join(' '));
  const clean: Profile = {
    sex: p.sex,
    birthDate: p.birthDate,
    heightCm: p.heightCm,
    activity: p.activity,
    ...(p.bodyFatPct !== undefined && { bodyFatPct: p.bodyFatPct }),
  };
  await db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [KEY, JSON.stringify(clean)]);
}
