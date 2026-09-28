import { addDays } from './dates';
import { computeTrend, trendAt } from './trend';

const START = '2026-01-01';

describe('computeTrend', () => {
  it('returns an empty series without weigh-ins', () => {
    expect(computeTrend([])).toEqual([]);
  });

  it('holds steady for a constant weight', () => {
    const weighIns = Array.from({ length: 30 }, (_, i) => ({ date: addDays(START, i), kg: 80 }));
    const trend = computeTrend(weighIns);
    expect(trend).toHaveLength(30);
    for (const p of trend) expect(p.trendKg).toBeCloseTo(80, 10);
  });

  it('fills every calendar day and carries the trend over gaps', () => {
    const trend = computeTrend([
      { date: START, kg: 80 },
      { date: addDays(START, 4), kg: 80 },
    ]);
    expect(trend.map((p) => p.date)).toEqual([0, 1, 2, 3, 4].map((i) => addDays(START, i)));
    expect(trend[2].weighedKg).toBeNull();
    expect(trend[2].trendKg).toBe(80);
  });

  it('averages several weigh-ins on the same day', () => {
    const trend = computeTrend([
      { date: START, kg: 79 },
      { date: START, kg: 81 },
    ]);
    expect(trend[0].weighedKg).toBe(80);
  });

  it('moves a larger step after a longer gap (time-aware smoothing)', () => {
    const base = Array.from({ length: 10 }, (_, i) => ({ date: addDays(START, i), kg: 80 }));
    const afterOneDay = computeTrend([...base, { date: addDays(START, 10), kg: 81 }]);
    const afterFiveDays = computeTrend([...base, { date: addDays(START, 14), kg: 81 }]);
    const step1 = afterOneDay[afterOneDay.length - 1].trendKg - 80;
    const step5 = afterFiveDays[afterFiveDays.length - 1].trendKg - 80;
    expect(step1).toBeCloseTo(1 - Math.exp(-1 / 10), 6);
    expect(step5).toBeCloseTo(1 - Math.exp(-5 / 10), 6);
  });

  it('tracks a steady loss with the expected lag', () => {
    // -0.1 kg/day; an exponential filter lags a ramp by about tau days.
    const weighIns = Array.from({ length: 120 }, (_, i) => ({ date: addDays(START, i), kg: 90 - 0.1 * i }));
    const last = computeTrend(weighIns).at(-1)!;
    const truth = 90 - 0.1 * 119;
    expect(last.trendKg - truth).toBeGreaterThan(0.8);
    expect(last.trendKg - truth).toBeLessThan(1.1);
  });

  it('limits the pull of an implausible entry (typo guard)', () => {
    const base = Array.from({ length: 10 }, (_, i) => ({ date: addDays(START, i), kg: 80 }));
    const trend = computeTrend([...base, { date: addDays(START, 10), kg: 180 }]);
    expect(trend.at(-1)!.trendKg).toBeLessThan(80.5);
  });

  it('extends the series through a later date', () => {
    const trend = computeTrend([{ date: START, kg: 80 }], { through: addDays(START, 3) });
    expect(trend).toHaveLength(4);
    expect(trendAt(trend, addDays(START, 3))).toBe(80);
    expect(trendAt(trend, addDays(START, 9))).toBeUndefined();
  });
});
