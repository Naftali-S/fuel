import { addDays } from './dates';
import { estimateExpenditure, type DayIntake } from './expenditure';
import { SyntheticPerson } from './sim/synthetic';

const START = '2026-01-05';

function run(spec: ConstructorParameters<typeof SyntheticPerson>[0], days: number, intake: number) {
  const p = new SyntheticPerson(spec);
  for (let i = 0; i < days; i++) p.live(intake);
  return p;
}

const relErr = (est: number, truth: number) => Math.abs(est - truth) / truth;

describe('estimateExpenditure', () => {
  it('returns nothing without weigh-ins', () => {
    expect(estimateExpenditure([], [], { priorKcal: 2500 })).toEqual([]);
  });

  it('starts at the prior on the first weigh-in day', () => {
    const out = estimateExpenditure([{ date: START, kg: 80 }], [], { priorKcal: 2400 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ date: START, kcal: 2400, paused: false });
  });

  it('converges on noise-free data and never moves faster than the cap', () => {
    const p = run(
      { seed: 1, start: START, startKg: 85, trueKcal: 2700, scaleNoiseKg: 0, logNoiseCv: 0 },
      42,
      2200,
    );
    const out = estimateExpenditure(p.weighIns, p.days, { priorKcal: 2300, maxDailyChangeKcal: 60 });
    const truth = p.history[p.history.length - 1].trueKcal;
    expect(relErr(out[out.length - 1].kcal, truth)).toBeLessThan(0.01);
    for (let i = 1; i < out.length; i++) {
      expect(Math.abs(out[i].kcal - out[i - 1].kcal)).toBeLessThanOrEqual(60 + 1e-9);
    }
  });

  it('holds a steady maintenance intake as expenditure', () => {
    const p = run({ seed: 2, start: START, startKg: 70, trueKcal: 2300, scaleNoiseKg: 0.5 }, 56, 2300);
    const out = estimateExpenditure(p.weighIns, p.days, { priorKcal: 2000 });
    expect(relErr(out[out.length - 1].kcal, 2300)).toBeLessThan(0.05);
  });

  it('counts a fasting day as a known zero intake', () => {
    const weighIns = [0, 1, 2].map((i) => ({ date: addDays(START, i), kg: 80 }));
    const fasting: DayIntake[] = [{ date: START, kcal: null, status: 'fasting' }];
    const unlogged: DayIntake[] = [{ date: START, kcal: null, status: 'unlogged' }];
    const a = estimateExpenditure(weighIns, fasting, { priorKcal: 2500 });
    const b = estimateExpenditure(weighIns, unlogged, { priorKcal: 2500 });
    // Weight didn't drop after a 0 kcal day → expenditure must be lower than assumed.
    expect(a[2].rawKcal).toBeLessThan(b[2].rawKcal);
  });

  it('holds the published value when more than 3 of the last 7 days are unlogged', () => {
    const p = run({ seed: 3, start: START, startKg: 80, trueKcal: 2600 }, 21, 2600);
    const days = p.days.map((d, i) => (i >= 14 ? { ...d, kcal: null, status: 'unlogged' as const } : d));
    const out = estimateExpenditure(p.weighIns, days, { priorKcal: 2200 });
    expect(out[16].paused).toBe(false); // 3 missing
    expect(out[17].paused).toBe(true); // 4 missing
    expect(out[20].kcal).toBe(out[16].kcal);
  });

  it('adds the leading modifier to the published estimate', () => {
    const weighIns = [{ date: START, kg: 80 }];
    const out = estimateExpenditure(weighIns, [], { priorKcal: 2400, leadingKcal: () => 120 });
    expect(out[0].kcal).toBe(2520);
  });

  describe('with a noisy scale (±1 kg) and imperfect logs, across 30 people', () => {
    const seeds = Array.from({ length: 30 }, (_, i) => 100 + i);
    const errorsAt = (dayIndex: number, extra: Partial<ConstructorParameters<typeof SyntheticPerson>[0]> = {}) =>
      seeds.map((seed) => {
        const p = run({ seed, start: START, startKg: 90, trueKcal: 2800, ...extra }, dayIndex + 1, 2200);
        // Prior deliberately 12% low, as when the activity level is underestimated.
        const out = estimateExpenditure(p.weighIns, p.days, { priorKcal: 2460 });
        return relErr(out[dayIndex].kcal, p.history[dayIndex].trueKcal);
      });
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

    it('is within 5% on average by week 3', () => {
      expect(mean(errorsAt(20))).toBeLessThan(0.05);
    });

    it('has every person within 10% by week 4 and within 5% by week 8', () => {
      expect(Math.max(...errorsAt(27))).toBeLessThan(0.1);
      expect(Math.max(...errorsAt(55))).toBeLessThan(0.05);
    });

    it('stays within 5% on average by week 6 with 20% of days unlogged', () => {
      expect(mean(errorsAt(41, { missDayProb: 0.2, missWeighProb: 0.2 }))).toBeLessThan(0.05);
    });

    it('reports expenditure in logged calories when logging is biased', () => {
      // Logs 10% less than eaten: the estimate should land near 90% of truth,
      // which is what keeps logged targets achievable.
      const errs = seeds.slice(0, 10).map((seed) => {
        const p = run({ seed, start: START, startKg: 90, trueKcal: 2800, logBias: 0.9 }, 70, 2200);
        const out = estimateExpenditure(p.weighIns, p.days, { priorKcal: 2800 });
        return relErr(out[69].kcal, 0.9 * p.history[69].trueKcal);
      });
      expect(mean(errs)).toBeLessThan(0.05);
    });
  });
});
