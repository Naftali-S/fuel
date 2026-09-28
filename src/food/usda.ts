/**
 * USDA FoodData Central: US data, used only as a fallback after Canadian
 * sources and always labelled as US data. Public domain (CC0 1.0).
 * U.S. Department of Agriculture, Agricultural Research Service. FoodData Central.
 * The user's own API key is sent as a header, never in the URL.
 */
import { normalizeBarcode } from '@/lib/barcode';

import { isPlausible, microCompleteness } from './nutrient-mapping';
import type { FetchLike } from './off-api';
import type { FoodRecord, Serving } from './types';

export const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1';

/** FDC nutrient number → Fuel id and expected FDC unit. */
const FDC_NUTRIENTS: Readonly<Record<string, readonly [id: string, unit: string]>> = {
  '208': ['energy_kcal', 'KCAL'],
  '957': ['energy_kcal', 'KCAL'], // Atwater general factors (Foundation foods)
  '204': ['fat_g', 'G'],
  '606': ['sat_fat_g', 'G'],
  '605': ['trans_fat_g', 'G'],
  '645': ['mono_fat_g', 'G'],
  '646': ['poly_fat_g', 'G'],
  '205': ['carbs_g', 'G'],
  '291': ['fibre_g', 'G'],
  '269': ['sugars_g', 'G'],
  '203': ['protein_g', 'G'],
  '601': ['cholesterol_mg', 'MG'],
  '307': ['sodium_mg', 'MG'],
  '306': ['potassium_mg', 'MG'],
  '301': ['calcium_mg', 'MG'],
  '303': ['iron_mg', 'MG'],
  '320': ['vitamin_a_mcg', 'UG'],
  '401': ['vitamin_c_mg', 'MG'],
  '328': ['vitamin_d_mcg', 'UG'],
  '323': ['vitamin_e_mg', 'MG'],
  '430': ['vitamin_k_mcg', 'UG'],
  '404': ['thiamin_mg', 'MG'],
  '405': ['riboflavin_mg', 'MG'],
  '406': ['niacin_mg', 'MG'],
  '415': ['vitamin_b6_mg', 'MG'],
  '435': ['folate_mcg', 'UG'], // dietary folate equivalents
  '418': ['vitamin_b12_mcg', 'UG'],
  '410': ['pantothenic_mg', 'MG'],
  '416': ['biotin_mcg', 'UG'],
  '421': ['choline_mg', 'MG'],
  '305': ['phosphorus_mg', 'MG'],
  '304': ['magnesium_mg', 'MG'],
  '309': ['zinc_mg', 'MG'],
  '317': ['selenium_mcg', 'UG'],
  '312': ['copper_mg', 'MG'],
  '315': ['manganese_mg', 'MG'],
  '314': ['iodide_mcg', 'UG'],
  '262': ['caffeine_mg', 'MG'],
  '221': ['alcohol_g', 'G'],
};

/** Used only when the preferred measure is missing. */
const FALLBACKS: Readonly<Record<string, readonly [id: string, unit: string, factor: number]>> = {
  '318': ['vitamin_a_mcg', 'IU', 0.3], // IU → µg (as retinol)
  '324': ['vitamin_d_mcg', 'IU', 0.025], // IU → µg
  '417': ['folate_mcg', 'UG', 1], // total folate
};

export interface FdcNutrient {
  nutrientNumber?: string;
  unitName?: string;
  value?: number;
}

export interface FdcFood {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: FdcNutrient[];
}

export function mapFdcNutrients(list: readonly FdcNutrient[]): Record<string, number> {
  const out: Record<string, number> = {};
  const fallback: Record<string, number> = {};
  for (const n of list) {
    const num = n.nutrientNumber;
    const v = n.value;
    if (!num || typeof v !== 'number' || !Number.isFinite(v) || v < 0) continue;
    const unit = (n.unitName ?? '').toUpperCase();
    const main = FDC_NUTRIENTS[num];
    if (main && main[1] === unit && out[main[0]] === undefined) out[main[0]] = v;
    const alt = FALLBACKS[num];
    if (alt && alt[1] === unit) fallback[alt[0]] = Number((v * alt[2]).toPrecision(6));
  }
  for (const [id, v] of Object.entries(fallback)) if (out[id] === undefined) out[id] = v;
  return out;
}

/** "CHEERIOS CEREAL" → "Cheerios Cereal"; mixed-case text is left alone. */
function tidy(text: string): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function fdcToFoodRecord(f: FdcFood): FoodRecord | null {
  if (!f.fdcId || !f.description) return null;
  const nutrients = mapFdcNutrients(f.foodNutrients ?? []);
  if (!isPlausible(nutrients)) return null;
  const unit = (f.servingSizeUnit ?? '').toLowerCase();
  const basis = unit === 'ml' || unit === 'mlt' ? 'ml' : 'g';
  const servings: Serving[] = [];
  if (f.servingSize && f.servingSize > 0 && f.servingSize < 2000 && (unit === 'g' || unit === 'grm' || basis === 'ml')) {
    const size = `${Number(f.servingSize.toFixed(1))} ${basis === 'ml' ? 'mL' : 'g'}`;
    const household = f.householdServingFullText?.trim();
    servings.push({ label: household ? `${household} (${size})` : size, amount: f.servingSize });
  }
  const code = f.gtinUpc ? normalizeBarcode(f.gtinUpc) : null;
  return {
    source: 'usda',
    sourceId: String(f.fdcId),
    name: tidy(f.description),
    brand: f.brandName || f.brandOwner ? tidy(f.brandName || f.brandOwner || '') : null,
    region: 'US',
    basis,
    nutrients,
    servings,
    barcodes: code?.ok ? [code.gtin] : [],
    microCompleteness: microCompleteness(nutrients),
  };
}

export interface UsdaClient {
  search(query: string, pageSize?: number): Promise<FoodRecord[]>;
  /** Finds a branded product by canonical GTIN. */
  byGtin(gtin: string): Promise<FoodRecord | null>;
}

export function createUsdaClient({
  apiKey,
  fetchImpl = fetch,
  timeoutMs = 8000,
}: {
  apiKey: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}): UsdaClient {
  const request = async (params: Record<string, string>): Promise<FdcFood[]> => {
    const qs = new URLSearchParams(params).toString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${USDA_BASE}/foods/search?${qs}`, {
        headers: { 'X-Api-Key': apiKey },
        signal: controller.signal,
      });
    } catch (e) {
      throw new Error(controller.signal.aborted ? 'USDA took too long to respond.' : 'No connection to USDA.', { cause: e });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new Error('The USDA API key was rejected.');
    if (res.status === 429) throw new Error('USDA rate limit reached. Try again later.');
    if (!res.ok) throw new Error(`USDA returned HTTP ${res.status}.`);
    const body = (await res.json()) as { foods?: FdcFood[] };
    return body.foods ?? [];
  };

  return {
    async search(query, pageSize = 15) {
      const foods = await request({
        query,
        dataType: 'Branded,Foundation,SR Legacy',
        pageSize: String(pageSize),
      });
      return foods.map(fdcToFoodRecord).filter((f): f is FoodRecord => f !== null);
    },
    async byGtin(gtin) {
      const upc = gtin.startsWith('0') ? gtin.slice(1) : gtin;
      const foods = await request({ query: upc, dataType: 'Branded', pageSize: '5' });
      for (const f of foods) {
        const code = f.gtinUpc ? normalizeBarcode(f.gtinUpc) : null;
        if (code?.ok && code.gtin === gtin) return fdcToFoodRecord(f);
      }
      return null;
    },
  };
}
