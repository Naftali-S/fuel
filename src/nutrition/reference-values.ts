/**
 * Health Canada reference values, copied from the official tables:
 *
 * - Daily Values: "Nutrition Labelling – Table of Daily Values" (2022),
 *   column "any other case" / "children four years of age or older and adults".
 *   https://www.canada.ca/en/health-canada/services/technical-documents-labelling-requirements/table-daily-values/nutrition-labelling.html
 * - Dietary Reference Intakes (RDA or AI, and UL/CDRR) for adults:
 *   https://www.canada.ca/en/health-canada/services/food-nutrition/healthy-eating/dietary-reference-intakes/tables.html
 *   (vitamins; elements incl. 2019 sodium/potassium; macronutrients for fibre and essential fatty acids)
 *
 * Units match src/db/nutrient-catalog.ts. These are reference values for
 * healthy adults; they don't cover pregnancy, lactation or medical conditions.
 */

/** % Daily Value basis used on Canadian Nutrition Facts tables (adults). */
export const DAILY_VALUES: Readonly<Record<string, number>> = {
  fat_g: 75,
  sat_fat_g: 20, // DV is for saturated + trans fat combined
  fibre_g: 28,
  sugars_g: 100,
  cholesterol_mg: 300,
  sodium_mg: 2300,
  potassium_mg: 3400,
  calcium_mg: 1300,
  iron_mg: 18,
  vitamin_a_mcg: 900,
  vitamin_c_mg: 90,
  vitamin_d_mcg: 20,
  vitamin_e_mg: 15,
  vitamin_k_mcg: 120,
  thiamin_mg: 1.2,
  riboflavin_mg: 1.3,
  niacin_mg: 16,
  vitamin_b6_mg: 1.7,
  folate_mcg: 400,
  vitamin_b12_mcg: 2.4,
  choline_mg: 550,
  biotin_mcg: 30,
  pantothenic_mg: 5,
  phosphorus_mg: 1250,
  iodide_mcg: 150,
  magnesium_mg: 420,
  zinc_mg: 11,
  selenium_mcg: 55,
  copper_mg: 0.9,
  manganese_mg: 2.3,
};

/** Adult life-stage bands used by the DRI tables. */
export type AgeBand = '19-30' | '31-50' | '51-70' | '71+';
export const AGE_BANDS: readonly AgeBand[] = ['19-30', '31-50', '51-70', '71+'];

/** One value for all bands, or one per band in AGE_BANDS order. */
type ByAge = number | readonly [number, number, number, number];

export type TargetKind = 'RDA' | 'AI';
export type UpperKind = 'UL' | 'CDRR';

export interface DriRow {
  kind: TargetKind;
  male: ByAge;
  female: ByAge;
  upper?: ByAge;
  upperKind?: UpperKind;
  /** The UL applies only to supplements/fortified or preformed sources, not ordinary food. */
  upperFromSupplementsOnly?: boolean;
}

export const DRI: Readonly<Record<string, DriRow>> = {
  vitamin_a_mcg: { kind: 'RDA', male: 900, female: 700, upper: 3000, upperFromSupplementsOnly: true }, // UL as preformed vitamin A
  vitamin_d_mcg: { kind: 'RDA', male: [15, 15, 15, 20], female: [15, 15, 15, 20], upper: 100 },
  vitamin_e_mg: { kind: 'RDA', male: 15, female: 15, upper: 1000, upperFromSupplementsOnly: true },
  vitamin_k_mcg: { kind: 'AI', male: 120, female: 90 },
  vitamin_c_mg: { kind: 'RDA', male: 90, female: 75, upper: 2000 },
  thiamin_mg: { kind: 'RDA', male: 1.2, female: 1.1 },
  riboflavin_mg: { kind: 'RDA', male: 1.3, female: 1.1 },
  niacin_mg: { kind: 'RDA', male: 16, female: 14, upper: 35, upperFromSupplementsOnly: true },
  vitamin_b6_mg: { kind: 'RDA', male: [1.3, 1.3, 1.7, 1.7], female: [1.3, 1.3, 1.5, 1.5], upper: 100 },
  folate_mcg: { kind: 'RDA', male: 400, female: 400, upper: 1000, upperFromSupplementsOnly: true },
  vitamin_b12_mcg: { kind: 'RDA', male: 2.4, female: 2.4 },
  pantothenic_mg: { kind: 'AI', male: 5, female: 5 },
  biotin_mcg: { kind: 'AI', male: 30, female: 30 },
  choline_mg: { kind: 'AI', male: 550, female: 425, upper: 3500 },
  calcium_mg: {
    kind: 'RDA',
    male: [1000, 1000, 1000, 1200],
    female: [1000, 1000, 1200, 1200],
    upper: [2500, 2500, 2000, 2000],
  },
  copper_mg: { kind: 'RDA', male: 0.9, female: 0.9, upper: 10 },
  iodide_mcg: { kind: 'RDA', male: 150, female: 150, upper: 1100 },
  iron_mg: { kind: 'RDA', male: 8, female: [18, 18, 8, 8], upper: 45 },
  magnesium_mg: {
    kind: 'RDA',
    male: [400, 420, 420, 420],
    female: [310, 320, 320, 320],
    upper: 350,
    upperFromSupplementsOnly: true,
  },
  manganese_mg: { kind: 'AI', male: 2.3, female: 1.8, upper: 11 },
  phosphorus_mg: { kind: 'RDA', male: 700, female: 700, upper: [4000, 4000, 4000, 3000] },
  selenium_mcg: { kind: 'RDA', male: 55, female: 55, upper: 400 },
  zinc_mg: { kind: 'RDA', male: 11, female: 8, upper: 40 },
  potassium_mg: { kind: 'AI', male: 3400, female: 2600 },
  sodium_mg: { kind: 'AI', male: 1500, female: 1500, upper: 2300, upperKind: 'CDRR' },
  fibre_g: { kind: 'AI', male: [38, 38, 30, 30], female: [25, 25, 21, 21] },
  omega3_g: { kind: 'AI', male: 1.6, female: 1.1 }, // as alpha-linolenic acid
  omega6_g: { kind: 'AI', male: [17, 17, 14, 14], female: [12, 12, 11, 11] }, // as linoleic acid
};
