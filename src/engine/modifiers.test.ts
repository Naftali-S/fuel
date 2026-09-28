import { addDays } from './dates';
import {
  baselineSetsPerMinute,
  dailyTrainingKcal,
  leadingAdjustment,
  stepsNetKcal,
  workoutNetKcal,
} from './modifiers';

const START = '2026-02-02'; // a Monday

describe('workoutNetKcal', () => {
  const session = { date: START, durationMin: 60, workingSets: 20 };

  it('uses 5 METs net of rest without a baseline', () => {
    // 60 min × (5 − 1) × 3.5 × 80 / 200
    expect(workoutNetKcal(session, 80)).toBeCloseTo(336, 6);
  });

  it('scales with set density relative to your own baseline, within MET bounds', () => {
    const base = 20 / 60;
    expect(workoutNetKcal({ ...session, workingSets: 40 }, 80, base)).toBeCloseTo(60 * 5 * 1.4, 6); // capped at 6 METs
    expect(workoutNetKcal({ ...session, workingSets: 10 }, 80, base)).toBeCloseTo(60 * 2.75 * 1.4, 6); // 3.75 METs
  });

  it('ignores empty sessions', () => {
    expect(workoutNetKcal({ ...session, durationMin: 0 }, 80)).toBe(0);
  });
});

describe('baselineSetsPerMinute', () => {
  it('is the median density of real sessions', () => {
    expect(
      baselineSetsPerMinute([
        { date: START, durationMin: 60, workingSets: 12 },
        { date: START, durationMin: 60, workingSets: 18 },
        { date: START, durationMin: 60, workingSets: 30 },
        { date: START, durationMin: 5, workingSets: 30 }, // too short, ignored
      ]),
    ).toBeCloseTo(0.3, 10);
    expect(baselineSetsPerMinute([])).toBeUndefined();
  });
});

describe('stepsNetKcal', () => {
  it('is about 0.0005 kcal per kg per step', () => {
    expect(stepsNetKcal(10_000, 80)).toBeCloseTo(400, 6);
  });
});

describe('leadingAdjustment', () => {
  const threeDaysAWeek = (weeks: number) =>
    Array.from({ length: weeks }, (_, w) => [0, 2, 4].map((d) => addDays(START, 7 * w + d))).flat();

  it('is zero for a steady routine', () => {
    const values = new Map(threeDaysAWeek(8).map((d) => [d, 336]));
    const today = addDays(START, 7 * 8 - 1);
    expect(leadingAdjustment(values, today, { historyStart: START, missingIsZero: true })).toBeCloseTo(0, 10);
  });

  it('passes half of an increase over baseline through', () => {
    const values = new Map(threeDaysAWeek(7).map((d) => [d, 336]));
    for (let d = 0; d < 6; d++) values.set(addDays(START, 49 + d), 336);
    const today = addDays(START, 55);
    // recent 6×336/7 = 288; baseline (9 + 6)×336/28 = 180
    expect(leadingAdjustment(values, today, { historyStart: START, missingIsZero: true })).toBeCloseTo(54, 6);
  });

  it('waits for two weeks of history', () => {
    const values = new Map([[START, 500]]);
    expect(leadingAdjustment(values, addDays(START, 9), { historyStart: START, missingIsZero: true })).toBe(0);
  });

  it('skips unknown days for steps instead of counting them as zero', () => {
    const values = new Map<string, number>();
    for (let i = 0; i < 21; i++) values.set(addDays(START, i), 320);
    for (let i = 21; i < 28; i++) if (i !== 23 && i !== 25) values.set(addDays(START, i), 480);
    const today = addDays(START, 27);
    const expected = 0.5 * (480 - (21 * 320 + 5 * 480) / 26);
    expect(leadingAdjustment(values, today, { historyStart: START, missingIsZero: false })).toBeCloseTo(expected, 6);
  });
});

describe('dailyTrainingKcal', () => {
  it('sums sessions on the same day', () => {
    const map = dailyTrainingKcal(
      [
        { date: START, durationMin: 30, workingSets: 10 },
        { date: START, durationMin: 30, workingSets: 10 },
      ],
      80,
    );
    expect(map.get(START)).toBeCloseTo(336, 6);
  });
});
