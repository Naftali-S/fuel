import { dayTitle, entryAmount } from './format';

describe('dayTitle', () => {
  const today = '2026-10-19';
  it('names nearby days', () => {
    expect(dayTitle('2026-10-19', today)).toBe('Today');
    expect(dayTitle('2026-10-18', today)).toBe('Yesterday');
    expect(dayTitle('2026-10-20', today)).toBe('Tomorrow');
  });

  it('shows other days as a date', () => {
    expect(dayTitle('2026-10-10', today)).toMatch(/10/);
  });
});

describe('entryAmount', () => {
  const base = { amount: 80, unit: 'g' as const, quantity: 2, servingLabel: '½ cup' };
  it('shows portions as "quantity × serving"', () => {
    expect(entryAmount(base)).toBe('2 × ½ cup');
    expect(entryAmount({ ...base, quantity: 1.5 })).toBe('1.5 × ½ cup');
  });

  it('shows grams or millilitres for 100 g portions and entries without portions', () => {
    expect(entryAmount({ ...base, servingLabel: '100 g', quantity: 0.8 })).toBe('80 g');
    expect(entryAmount({ ...base, unit: 'ml', quantity: null, servingLabel: null, amount: 250 })).toBe('250 mL');
  });
});
