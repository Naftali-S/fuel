/**
 * Source-independent food record. Nutrient amounts are per 100 g (or per
 * 100 mL when `basis` is 'ml'), keyed by the ids in src/db/nutrient-catalog.ts.
 */
export type FoodSource = 'cnf' | 'off' | 'usda' | 'user' | 'recipe';

/** Where the label data comes from: Canadian, US, or unknown/other. */
export type FoodRegion = 'CA' | 'US' | null;

export interface Serving {
  label: string;
  /** Size in basis units (g or mL). */
  amount: number;
}

export interface FoodRecord {
  source: FoodSource;
  sourceId: string;
  name: string;
  nameFr?: string | null;
  brand?: string | null;
  category?: string | null;
  region: FoodRegion;
  basis: 'g' | 'ml';
  nutrients: Record<string, number>;
  servings: Serving[];
  /** Canonical GTINs (see src/lib/barcode.ts). */
  barcodes: string[];
  /** 0–1 share of the core micronutrients that have values. */
  microCompleteness: number;
  /** Nutrient ids whose values are estimates filled in from a similar food. */
  estimated?: string[];
}
