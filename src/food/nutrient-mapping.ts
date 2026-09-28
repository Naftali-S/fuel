/**
 * Maps source nutrient identifiers onto Fuel's nutrient ids and units
 * (see src/db/nutrient-catalog.ts).
 */

/** Canadian Nutrient File NutrientID → Fuel id. CNF units already match. */
export const CNF_NUTRIENTS: Readonly<Record<number, string>> = {
  208: 'energy_kcal',
  204: 'fat_g',
  606: 'sat_fat_g',
  605: 'trans_fat_g',
  645: 'mono_fat_g',
  646: 'poly_fat_g',
  868: 'omega3_g',
  869: 'omega6_g',
  205: 'carbs_g',
  291: 'fibre_g',
  269: 'sugars_g',
  203: 'protein_g',
  601: 'cholesterol_mg',
  307: 'sodium_mg',
  306: 'potassium_mg',
  301: 'calcium_mg',
  303: 'iron_mg',
  814: 'vitamin_a_mcg', // retinol activity equivalents
  401: 'vitamin_c_mg',
  339: 'vitamin_d_mcg', // D2 + D3
  323: 'vitamin_e_mg', // alpha-tocopherol
  430: 'vitamin_k_mcg',
  404: 'thiamin_mg',
  405: 'riboflavin_mg',
  409: 'niacin_mg', // niacin equivalents
  415: 'vitamin_b6_mg',
  815: 'folate_mcg', // dietary folate equivalents
  418: 'vitamin_b12_mcg',
  410: 'pantothenic_mg',
  416: 'biotin_mcg',
  862: 'choline_mg',
  305: 'phosphorus_mg',
  304: 'magnesium_mg',
  309: 'zinc_mg',
  317: 'selenium_mcg',
  312: 'copper_mg',
  315: 'manganese_mg',
  262: 'caffeine_mg',
  221: 'alcohol_g',
};

/**
 * Open Food Facts `<name>_100g` fields → Fuel id and multiplier.
 * OFF stores every nutrient except energy in grams.
 */
export const OFF_NUTRIENTS: Readonly<Record<string, readonly [id: string, factor: number]>> = {
  fat: ['fat_g', 1],
  'saturated-fat': ['sat_fat_g', 1],
  'trans-fat': ['trans_fat_g', 1],
  'monounsaturated-fat': ['mono_fat_g', 1],
  'polyunsaturated-fat': ['poly_fat_g', 1],
  'omega-3-fat': ['omega3_g', 1],
  'omega-6-fat': ['omega6_g', 1],
  carbohydrates: ['carbs_g', 1],
  fiber: ['fibre_g', 1],
  sugars: ['sugars_g', 1],
  proteins: ['protein_g', 1],
  cholesterol: ['cholesterol_mg', 1e3],
  sodium: ['sodium_mg', 1e3],
  potassium: ['potassium_mg', 1e3],
  calcium: ['calcium_mg', 1e3],
  iron: ['iron_mg', 1e3],
  'vitamin-a': ['vitamin_a_mcg', 1e6],
  'vitamin-c': ['vitamin_c_mg', 1e3],
  'vitamin-d': ['vitamin_d_mcg', 1e6],
  'vitamin-e': ['vitamin_e_mg', 1e3],
  'vitamin-k': ['vitamin_k_mcg', 1e6],
  'vitamin-b1': ['thiamin_mg', 1e3],
  'vitamin-b2': ['riboflavin_mg', 1e3],
  'vitamin-pp': ['niacin_mg', 1e3],
  'vitamin-b6': ['vitamin_b6_mg', 1e3],
  'vitamin-b9': ['folate_mcg', 1e6],
  'vitamin-b12': ['vitamin_b12_mcg', 1e6],
  'pantothenic-acid': ['pantothenic_mg', 1e3],
  biotin: ['biotin_mcg', 1e6],
  choline: ['choline_mg', 1e3],
  phosphorus: ['phosphorus_mg', 1e3],
  magnesium: ['magnesium_mg', 1e3],
  zinc: ['zinc_mg', 1e3],
  selenium: ['selenium_mcg', 1e6],
  copper: ['copper_mg', 1e3],
  manganese: ['manganese_mg', 1e3],
  iodine: ['iodide_mcg', 1e6],
  caffeine: ['caffeine_mg', 1e3],
  alcohol: ['alcohol_g', 1],
};

const KJ_PER_KCAL = 4.184;
/** Sodium = salt ÷ 2.5 (EU/Codex convention used by Open Food Facts). */
const SALT_TO_SODIUM = 1 / 2.5;

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Converts OFF per-100 values (from the API `nutriments` object or the CSV
 * `_100g` columns, both keyed "<name>_100g") into Fuel nutrients.
 */
export function mapOffNutrients(values: Readonly<Record<string, unknown>>): Record<string, number> {
  const out: Record<string, number> = {};
  const kcal = toNumber(values['energy-kcal_100g']);
  const kj = toNumber(values['energy-kj_100g']) ?? toNumber(values['energy_100g']);
  if (kcal !== undefined) out.energy_kcal = kcal;
  else if (kj !== undefined) out.energy_kcal = kj / KJ_PER_KCAL;

  for (const [name, [id, factor]] of Object.entries(OFF_NUTRIENTS)) {
    const v = toNumber(values[`${name}_100g`]);
    if (v !== undefined) out[id] = round(v * factor);
  }
  if (out.sodium_mg === undefined) {
    const salt = toNumber(values['salt_100g']);
    if (salt !== undefined) out.sodium_mg = round(salt * SALT_TO_SODIUM * 1e3);
  }
  if (out.folate_mcg === undefined) {
    const folates = toNumber(values['folates_100g']);
    if (folates !== undefined) out.folate_mcg = round(folates * 1e6);
  }
  if (out.energy_kcal !== undefined) out.energy_kcal = round(out.energy_kcal);
  return out;
}

/** Rounds away floating-point noise from unit conversion (6 significant digits). */
function round(x: number): number {
  return x === 0 ? 0 : Number(x.toPrecision(6));
}

/** Micronutrients used to judge how complete a food's data is. */
export const CORE_MICROS = [
  'sodium_mg',
  'potassium_mg',
  'calcium_mg',
  'iron_mg',
  'magnesium_mg',
  'zinc_mg',
  'vitamin_a_mcg',
  'vitamin_c_mg',
  'vitamin_d_mcg',
  'vitamin_b12_mcg',
  'folate_mcg',
  'fibre_g',
] as const;

export function microCompleteness(nutrients: Readonly<Record<string, number>>): number {
  const present = CORE_MICROS.filter((id) => nutrients[id] !== undefined).length;
  return Math.round((present / CORE_MICROS.length) * 100) / 100;
}

/**
 * Rejects obviously broken per-100 data (typos, per-serving values entered
 * as per-100, energy far from what the macros imply).
 */
export function isPlausible(nutrients: Readonly<Record<string, number>>): boolean {
  const kcal = nutrients.energy_kcal;
  if (kcal === undefined || kcal > 950) return false;
  const fat = nutrients.fat_g ?? 0;
  const carbs = nutrients.carbs_g ?? 0;
  const protein = nutrients.protein_g ?? 0;
  const alcohol = nutrients.alcohol_g ?? 0;
  if (fat > 100 || carbs > 100 || protein > 100 || fat + carbs + protein > 105) return false;
  if ((nutrients.sugars_g ?? 0) > carbs + 0.5 || (nutrients.sat_fat_g ?? 0) > fat + 0.5) return false;
  // Energy should roughly match Atwater factors when macros are present.
  const implied = 9 * fat + 4 * carbs + 4 * protein + 7 * alcohol;
  if (implied > 40 && Math.abs(kcal - implied) > Math.max(60, 0.35 * implied)) return false;
  return true;
}
