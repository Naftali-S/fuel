/**
 * Nutrients Fuel can store. Food data is nutrient-agnostic: any food may
 * carry any subset of these, per 100 g (or 100 mL). Amounts use the units
 * below. Order follows the Canadian Nutrition Facts table, then other
 * vitamins and minerals.
 *
 * Daily values are filled in from Health Canada's Table of Daily Values in
 * a later migration (Phase 4), after checking the official source.
 */
export type NutrientCategory = 'energy' | 'macro' | 'fat_detail' | 'carb_detail' | 'vitamin' | 'mineral' | 'other';

export interface NutrientDef {
  id: string;
  name: string;
  unit: 'kcal' | 'g' | 'mg' | 'mcg';
  category: NutrientCategory;
}

export const NUTRIENTS: readonly NutrientDef[] = [
  { id: 'energy_kcal', name: 'Calories', unit: 'kcal', category: 'energy' },
  { id: 'fat_g', name: 'Fat', unit: 'g', category: 'macro' },
  { id: 'sat_fat_g', name: 'Saturated fat', unit: 'g', category: 'fat_detail' },
  { id: 'trans_fat_g', name: 'Trans fat', unit: 'g', category: 'fat_detail' },
  { id: 'mono_fat_g', name: 'Monounsaturated fat', unit: 'g', category: 'fat_detail' },
  { id: 'poly_fat_g', name: 'Polyunsaturated fat', unit: 'g', category: 'fat_detail' },
  { id: 'omega3_g', name: 'Omega-3', unit: 'g', category: 'fat_detail' },
  { id: 'omega6_g', name: 'Omega-6', unit: 'g', category: 'fat_detail' },
  { id: 'carbs_g', name: 'Carbohydrate', unit: 'g', category: 'macro' },
  { id: 'fibre_g', name: 'Fibre', unit: 'g', category: 'carb_detail' },
  { id: 'sugars_g', name: 'Sugars', unit: 'g', category: 'carb_detail' },
  { id: 'protein_g', name: 'Protein', unit: 'g', category: 'macro' },
  { id: 'cholesterol_mg', name: 'Cholesterol', unit: 'mg', category: 'other' },
  { id: 'sodium_mg', name: 'Sodium', unit: 'mg', category: 'mineral' },
  { id: 'potassium_mg', name: 'Potassium', unit: 'mg', category: 'mineral' },
  { id: 'calcium_mg', name: 'Calcium', unit: 'mg', category: 'mineral' },
  { id: 'iron_mg', name: 'Iron', unit: 'mg', category: 'mineral' },
  { id: 'vitamin_a_mcg', name: 'Vitamin A (RAE)', unit: 'mcg', category: 'vitamin' },
  { id: 'vitamin_c_mg', name: 'Vitamin C', unit: 'mg', category: 'vitamin' },
  { id: 'vitamin_d_mcg', name: 'Vitamin D', unit: 'mcg', category: 'vitamin' },
  { id: 'vitamin_e_mg', name: 'Vitamin E', unit: 'mg', category: 'vitamin' },
  { id: 'vitamin_k_mcg', name: 'Vitamin K', unit: 'mcg', category: 'vitamin' },
  { id: 'thiamin_mg', name: 'Thiamin', unit: 'mg', category: 'vitamin' },
  { id: 'riboflavin_mg', name: 'Riboflavin', unit: 'mg', category: 'vitamin' },
  { id: 'niacin_mg', name: 'Niacin', unit: 'mg', category: 'vitamin' },
  { id: 'vitamin_b6_mg', name: 'Vitamin B6', unit: 'mg', category: 'vitamin' },
  { id: 'folate_mcg', name: 'Folate (DFE)', unit: 'mcg', category: 'vitamin' },
  { id: 'vitamin_b12_mcg', name: 'Vitamin B12', unit: 'mcg', category: 'vitamin' },
  { id: 'pantothenic_mg', name: 'Pantothenate', unit: 'mg', category: 'vitamin' },
  { id: 'biotin_mcg', name: 'Biotin', unit: 'mcg', category: 'vitamin' },
  { id: 'choline_mg', name: 'Choline', unit: 'mg', category: 'vitamin' },
  { id: 'phosphorus_mg', name: 'Phosphorus', unit: 'mg', category: 'mineral' },
  { id: 'magnesium_mg', name: 'Magnesium', unit: 'mg', category: 'mineral' },
  { id: 'zinc_mg', name: 'Zinc', unit: 'mg', category: 'mineral' },
  { id: 'selenium_mcg', name: 'Selenium', unit: 'mcg', category: 'mineral' },
  { id: 'copper_mg', name: 'Copper', unit: 'mg', category: 'mineral' },
  { id: 'manganese_mg', name: 'Manganese', unit: 'mg', category: 'mineral' },
  { id: 'iodide_mcg', name: 'Iodide', unit: 'mcg', category: 'mineral' },
  { id: 'caffeine_mg', name: 'Caffeine', unit: 'mg', category: 'other' },
  { id: 'alcohol_g', name: 'Alcohol', unit: 'g', category: 'other' },
];
