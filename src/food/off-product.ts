/**
 * Open Food Facts product → FoodRecord. Shared by the live API client and
 * the Canada export builder, so both apply the same rules.
 * Data © Open Food Facts contributors, ODbL (see DATA_LICENSES.md).
 */
import { normalizeBarcode } from '@/lib/barcode';

import { isPlausible, mapOffNutrients, microCompleteness } from './nutrient-mapping';
import type { FoodRecord, FoodRegion, Serving } from './types';

export interface OffProduct {
  code: string;
  product_name?: string | null;
  product_name_en?: string | null;
  product_name_fr?: string | null;
  brands?: string | null;
  /** Array from the API, comma-separated string from the CSV export. */
  countries_tags?: readonly string[] | string | null;
  serving_size?: string | null;
  serving_quantity?: number | string | null;
  serving_quantity_unit?: string | null;
  /** "<name>_100g" values (API `nutriments`, or the CSV row itself). */
  nutriments?: Readonly<Record<string, unknown>> | null;
}

/** Fields to request from the product API (keeps responses small). */
export const OFF_API_FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'product_name_fr',
  'brands',
  'countries_tags',
  'serving_size',
  'serving_quantity',
  'serving_quantity_unit',
  'nutriments',
] as const;

function tags(value: OffProduct['countries_tags']): string[] {
  if (!value) return [];
  return typeof value === 'string' ? value.split(',').map((t) => t.trim()) : [...value];
}

export function regionFromCountries(value: OffProduct['countries_tags']): FoodRegion {
  const t = tags(value);
  if (t.includes('en:canada')) return 'CA';
  if (t.includes('en:united-states')) return 'US';
  return null;
}

function clean(text: string | null | undefined, max = 200): string | null {
  const s = (text ?? '').replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

function basisOf(p: OffProduct): 'g' | 'ml' {
  if (p.serving_quantity_unit) return p.serving_quantity_unit.toLowerCase() === 'ml' ? 'ml' : 'g';
  const size = p.serving_size ?? '';
  return /\d\s*ml\b/i.test(size) && !/\d\s*g\b/i.test(size) ? 'ml' : 'g';
}

export function offToFoodRecord(p: OffProduct): FoodRecord | null {
  const name = clean(p.product_name_en) ?? clean(p.product_name) ?? clean(p.product_name_fr);
  if (!name || !p.code) return null;
  const nutrients = mapOffNutrients(p.nutriments ?? {});
  if (!isPlausible(nutrients)) return null;

  const basis = basisOf(p);
  const servings: Serving[] = [];
  const qty = Number(p.serving_quantity);
  if (Number.isFinite(qty) && qty > 0 && qty < 2000) {
    servings.push({ label: clean(p.serving_size, 60) ?? `${qty} ${basis === 'ml' ? 'mL' : 'g'}`, amount: qty });
  }
  const barcode = normalizeBarcode(p.code);

  return {
    source: 'off',
    sourceId: p.code,
    name,
    nameFr: clean(p.product_name_fr),
    brand: clean(p.brands?.split(',')[0], 80),
    category: null,
    region: regionFromCountries(p.countries_tags),
    basis,
    nutrients,
    servings,
    barcodes: barcode.ok ? [barcode.gtin] : [],
    microCompleteness: microCompleteness(nutrients),
  };
}
