/**
 * Custom foods entered from a Canadian Nutrition Facts table: values per
 * serving as printed, converted to Fuel's per-100 g (or per-100 mL) basis.
 */
import { normalizeBarcode } from '@/lib/barcode';

import { microCompleteness } from './nutrient-mapping';
import type { FoodRecord } from './types';

/** Nutrients in the order they appear on the Canadian Nutrition Facts table. */
export const LABEL_FIELDS = [
  'energy_kcal',
  'fat_g',
  'sat_fat_g',
  'trans_fat_g',
  'carbs_g',
  'fibre_g',
  'sugars_g',
  'protein_g',
  'cholesterol_mg',
  'sodium_mg',
  'potassium_mg',
  'calcium_mg',
  'iron_mg',
] as const;

export interface LabelInput {
  name: string;
  brand?: string | null;
  basis: 'g' | 'ml';
  /** As printed, e.g. "3/4 cup (30 g)". */
  servingLabel: string;
  /** Serving size in g (or mL). */
  servingAmount: number;
  /** Amounts per serving, keyed by nutrient id. */
  values: Readonly<Record<string, number | undefined>>;
  barcode?: string | null;
}

/** Parses "1.5", "1,5" (French) or "" (→ undefined). Anything else is NaN. */
export function parseDecimal(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(t)) return NaN;
  return Number(t);
}

const sig = (x: number) => (x === 0 ? 0 : Number(x.toPrecision(6)));

export function labelToFoodRecord(input: LabelInput, sourceId: string): FoodRecord {
  const name = input.name.replace(/\s+/g, ' ').trim();
  if (!name) throw new RangeError('Give the food a name.');
  if (!(input.servingAmount > 0) || !Number.isFinite(input.servingAmount)) {
    throw new RangeError('Serving size must be greater than zero.');
  }
  const energy = input.values.energy_kcal;
  if (energy === undefined || !Number.isFinite(energy)) throw new RangeError('Calories are required.');

  const nutrients: Record<string, number> = {};
  for (const [id, v] of Object.entries(input.values)) {
    if (v === undefined) continue;
    if (!Number.isFinite(v) || v < 0) throw new RangeError('Nutrient amounts must be numbers of zero or more.');
    nutrients[id] = sig((v * 100) / input.servingAmount);
  }

  const barcodes: string[] = [];
  if (input.barcode && input.barcode.trim()) {
    const code = normalizeBarcode(input.barcode);
    if (!code.ok) throw new RangeError('That barcode isn’t valid.');
    barcodes.push(code.gtin);
  }

  const unit = input.basis === 'ml' ? 'mL' : 'g';
  return {
    source: 'user',
    sourceId,
    name,
    brand: input.brand?.trim() || null,
    region: 'CA',
    basis: input.basis,
    nutrients,
    servings: [{ label: input.servingLabel.trim() || `${input.servingAmount} ${unit}`, amount: input.servingAmount }],
    barcodes,
    microCompleteness: microCompleteness(nutrients),
  };
}

/** Per-serving values for editing an existing food. */
export function labelValues(food: Pick<FoodRecord, 'nutrients'>, servingAmount: number): Record<string, number> {
  return Object.fromEntries(Object.entries(food.nutrients).map(([id, v]) => [id, sig((v * servingAmount) / 100)]));
}
