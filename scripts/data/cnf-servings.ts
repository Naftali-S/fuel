/**
 * Sanity checks for Canadian Nutrient File measures. A few CNF conversion
 * factors are off by a power of ten (e.g. "5ml" of instant coffee = 91.8 g),
 * so volume measures with a physically implausible density, or (with three
 * or more volume measures) far from the food's median density, are dropped.
 */
import type { Serving } from '../../src/food/types';

const DENSITY_RANGE = [0.005, 2.5] as const; // g per mL (freeze-dried herbs are ~0.014)
const MAX_RATIO = 3;

/**
 * Millilitres when the whole measure is a volume ("250ml, sifted" → 250).
 * Mixed measures ("2 fruits + 30ml liquid") return null.
 */
export function labelMillilitres(label: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*ml\b/i.exec(label);
  return m ? Number(m[1]) : null;
}

export function plausibleServings(servings: readonly Serving[]): Serving[] {
  const densities = servings
    .map((s) => {
      const ml = labelMillilitres(s.label);
      return ml ? s.amount / ml : null;
    })
    .filter((d): d is number => d !== null && d >= DENSITY_RANGE[0] && d <= DENSITY_RANGE[1])
    .sort((a, b) => a - b);
  // With only two measures there's no way to tell which is wrong; rely on the absolute range.
  const median = densities.length >= 3 ? densities[densities.length >> 1] : null;

  return servings.filter((s) => {
    const ml = labelMillilitres(s.label);
    if (!ml) return true;
    const density = s.amount / ml;
    if (density < DENSITY_RANGE[0] || density > DENSITY_RANGE[1]) return false;
    if (median !== null) {
      const ratio = density > median ? density / median : median / density;
      if (ratio > MAX_RATIO) return false;
    }
    return true;
  });
}
