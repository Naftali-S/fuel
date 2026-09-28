import { calorieTarget, distributeCarbs, macroTargets, type CalorieTargetInput } from './targets';

const base: CalorieTargetInput = {
  expenditureKcal: 2500,
  trendKg: 80,
  goal: { kind: 'maintain', ratePctPerWeek: 0 },
  bmrKcal: 1750,
};

describe('calorieTarget', () => {
  it('equals expenditure at maintenance', () => {
    expect(calorieTarget(base)).toEqual({ kcal: 2500, ratePctPerWeek: 0, flags: [] });
  });

  it('adds the deficit for the planned rate, allowing for the thermic effect of food', () => {
    // 0.5%/wk of 80 kg = 0.4 kg/wk = 440 kcal/day; TEF drops with intake → (2500 − 250 − 440) / 0.9
    const t = calorieTarget({ ...base, goal: { kind: 'lose', ratePctPerWeek: 0.5 } });
    expect(t).toEqual({ kcal: 2010, ratePctPerWeek: -0.5, flags: [] });
  });

  it('needs no extra TEF allowance once intake already sits at the deficit', () => {
    const t = calorieTarget({ ...base, goal: { kind: 'lose', ratePctPerWeek: 0.5 }, recentIntakeKcal: 2060 });
    expect(t.kcal).toBe(2060);
  });

  it('forces the sign of the rate from the goal kind', () => {
    expect(calorieTarget({ ...base, goal: { kind: 'gain', ratePctPerWeek: -0.25 } }).ratePctPerWeek).toBe(0.25);
  });

  it('caps loss at 1%/week and gain at 0.5%/week', () => {
    expect(calorieTarget({ ...base, bmrKcal: 1400, goal: { kind: 'lose', ratePctPerWeek: 1.5 } })).toMatchObject({
      ratePctPerWeek: -1,
      flags: ['rate-capped'],
    });
    expect(calorieTarget({ ...base, goal: { kind: 'gain', ratePctPerWeek: 1 } }).ratePctPerWeek).toBe(0.5);
  });

  it('switches to maintenance once the goal weight is reached', () => {
    const t = calorieTarget({ ...base, trendKg: 74.9, goal: { kind: 'lose', ratePctPerWeek: 0.5, targetKg: 75 } });
    expect(t).toMatchObject({ ratePctPerWeek: 0, flags: ['goal-reached'] });
  });

  it('limits the change from the previous target unless overridden', () => {
    const input = { ...base, goal: { kind: 'lose' as const, ratePctPerWeek: 0.5 }, previousKcal: 2400 };
    expect(calorieTarget(input)).toMatchObject({ kcal: 2200, flags: ['change-capped'] });
    expect(calorieTarget({ ...input, allowLargeChange: true }).kcal).toBe(2010);
  });

  it('never goes below BMR (or 1200 kcal)', () => {
    const t = calorieTarget({
      expenditureKcal: 1500,
      trendKg: 60,
      goal: { kind: 'lose', ratePctPerWeek: 1 },
      bmrKcal: 1350,
    });
    expect(t).toMatchObject({ kcal: 1350, flags: ['floor'] });
    expect(calorieTarget({ ...base, expenditureKcal: 1100, bmrKcal: 1000 }).kcal).toBe(1200);
  });
});

describe('macroTargets', () => {
  it('sets protein by weight, fat at 25% of energy, and carbs as the rest', () => {
    // 160 g protein (640), fat 2500 × 0.25 / 9 = 69.4 g (625), carbs (2500 − 1265) / 4 = 308.75
    expect(macroTargets(2500, 80)).toEqual({ kcal: 2500, proteinG: 160, fatG: 69, carbsG: 309 });
  });

  it('keeps fat at or above 0.7 g/kg', () => {
    expect(macroTargets(1800, 100).fatG).toBeGreaterThanOrEqual(70);
  });

  it('trims fat, then protein, when the target is very low', () => {
    // 90 kg: fat floor 63 g (567 kcal); protein trimmed to fit: (1200 − 567) / 4 = 158.25 g
    expect(macroTargets(1200, 90)).toEqual({ kcal: 1200, proteinG: 158, fatG: 63, carbsG: 0 });
  });
});

describe('distributeCarbs', () => {
  const daily = { kcal: 2500, proteinG: 160, fatG: 69, carbsG: 300 };

  it('moves carbs to training days and keeps the weekly total', () => {
    const week = [true, false, true, false, true, false, false];
    const plan = distributeCarbs(daily, week);
    expect(plan.map((d) => d.carbsG)).toEqual([360, 255, 360, 255, 360, 255, 255]);
    expect(plan.reduce((s, d) => s + d.carbsG, 0)).toBe(7 * 300);
    expect(plan[0].kcal).toBe(2500 + 4 * 60);
  });

  it('leaves the plan flat without both training and rest days', () => {
    expect(distributeCarbs(daily, [false, false]).map((d) => d.carbsG)).toEqual([300, 300]);
  });
});
