import { portionLabel, portionsFor, scaleNutrients } from './portion';

describe('portionsFor', () => {
  it('lists servings first, then the 100 g reference, without duplicates', () => {
    expect(
      portionsFor({
        basis: 'g',
        servings: [
          { label: '1 cup', amount: 258 },
          { label: '1 cup', amount: 250 },
          { label: 'broken', amount: 0 },
        ],
      }),
    ).toEqual([
      { label: '1 cup', amount: 258 },
      { label: '100 g', amount: 100 },
    ]);
    expect(portionsFor({ basis: 'ml', servings: [] })).toEqual([{ label: '100 mL', amount: 100 }]);
  });
});

describe('scaleNutrients', () => {
  it('scales per-100 values to the portion', () => {
    const n = scaleNutrients({ energy_kcal: 389, protein_g: 13 }, 40);
    expect(Object.keys(n)).toEqual(['energy_kcal', 'protein_g']);
    expect(n.energy_kcal).toBeCloseTo(155.6, 10);
    expect(n.protein_g).toBeCloseTo(5.2, 10);
  });
});

describe('portionLabel', () => {
  it('adds the weight unless the label already states it', () => {
    expect(portionLabel({ label: '1 cup', amount: 258 }, 'g')).toBe('1 cup (258 g)');
    expect(portionLabel({ label: '30 g (3/4 cup)', amount: 30 }, 'g')).toBe('30 g (3/4 cup)');
    expect(portionLabel({ label: '1 portion (250 mL)', amount: 250 }, 'ml')).toBe('1 portion (250 mL)');
    expect(portionLabel({ label: '100 g', amount: 100 }, 'g')).toBe('100 g');
    expect(portionLabel({ label: '1 slice', amount: 28.35 }, 'g')).toBe('1 slice (28.4 g)');
  });
});
