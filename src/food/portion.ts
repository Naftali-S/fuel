/**
 * Portions and nutrient scaling. Food nutrients are stored per 100 g
 * (or 100 mL); a portion is an amount in those same units.
 */
import type { FoodRecord } from './types';

export interface Portion {
  label: string;
  /** Size in basis units (g or mL). */
  amount: number;
}

/** The food's servings (duplicates removed), then the 100 g / 100 mL reference. */
export function portionsFor(food: Pick<FoodRecord, 'servings' | 'basis'>): Portion[] {
  const seen = new Set<string>();
  const out: Portion[] = [];
  for (const s of food.servings) {
    if (!(s.amount > 0) || seen.has(s.label)) continue;
    seen.add(s.label);
    out.push({ label: s.label, amount: s.amount });
  }
  out.push({ label: food.basis === 'ml' ? '100 mL' : '100 g', amount: 100 });
  return out;
}

/** Nutrient amounts for `amount` g (or mL) of a food. */
export function scaleNutrients(per100: Readonly<Record<string, number>>, amount: number): Record<string, number> {
  const factor = amount / 100;
  return Object.fromEntries(Object.entries(per100).map(([id, v]) => [id, v * factor]));
}

/** "1 cup (258 g)"; labels that already state the weight are left as they are. */
export function portionLabel(p: Portion, basis: 'g' | 'ml'): string {
  const size = `${Number(p.amount.toFixed(1))} ${basis === 'ml' ? 'mL' : 'g'}`;
  const squash = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  return squash(p.label).includes(squash(size)) ? p.label : `${p.label} (${size})`;
}
