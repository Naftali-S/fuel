/**
 * Closed-loop simulation: a coach runs a check-in every 7 days, the synthetic
 * person eats the target (with noise), and we measure the rate their *true*
 * body mass actually changed. This is the end-to-end acceptance test for the
 * engine: the numbers it gives must get people where they asked to go.
 */
import { runCheckin } from '../checkin';
import type { Profile } from '../energy';
import type { Goal } from '../targets';
import { SyntheticPerson, type PersonSpec } from './synthetic';

const START = '2026-01-05';

// Mifflin × 1.375 ≈ 2590 kcal for this profile at 90 kg: ~8% below the
// person's true 2800, as when activity is underestimated.
const PROFILE: Profile = { sex: 'male', birthDate: '1996-01-01', heightCm: 180, activity: 'light' };

interface Result {
  person: SyntheticPerson;
  targets: number[];
}

function simulate(spec: Omit<PersonSpec, 'start'>, goalForWeek: (week: number) => Goal, weeks: number): Result {
  const person = new SyntheticPerson({ ...spec, start: START });
  const targets: number[] = [];
  let target = 0;
  for (let day = 0; day < weeks * 7; day++) {
    if (day % 7 === 0) {
      const today = person.today;
      // The check-in sees data through yesterday; day 0 uses the starting weight.
      const result = runCheckin({
        today,
        profile: PROFILE,
        goal: goalForWeek(day / 7),
        weighIns: day === 0 ? [{ date: today, kg: spec.startKg }] : person.weighIns,
        days: person.days,
        previousTargetKcal: targets.length ? targets[targets.length - 1] : undefined,
      })!;
      target = result.target.kcal;
      targets.push(target);
    }
    person.live(target);
  }
  return { person, targets };
}

/** True rate of change between two weeks, % of body weight per week. */
function trueRate({ person }: Result, fromWeek: number, toWeek: number): number {
  const a = person.history[fromWeek * 7].trueMassKg;
  const b = person.history[toWeek * 7 - 1].trueMassKg;
  return ((b - a) / a / (toWeek - fromWeek)) * 100;
}

const seeds = [11, 22, 33, 44, 55, 66, 77, 88];
const person = { startKg: 90, trueKcal: 2800 };

describe('closed-loop coaching', () => {
  it('delivers the planned 0.5%/week loss once settled, for every person', () => {
    for (const seed of seeds) {
      const r = simulate({ ...person, seed }, () => ({ kind: 'lose', ratePctPerWeek: 0.5 }), 16);
      expect(trueRate(r, 4, 16)).toBeGreaterThan(-0.65);
      expect(trueRate(r, 4, 16)).toBeLessThan(-0.35);
    }
  });

  it('never changes the target by more than 200 kcal between check-ins', () => {
    for (const seed of seeds) {
      const { targets } = simulate({ ...person, seed }, () => ({ kind: 'lose', ratePctPerWeek: 0.75 }), 12);
      for (let i = 1; i < targets.length; i++) {
        expect(Math.abs(targets[i] - targets[i - 1])).toBeLessThanOrEqual(200);
      }
    }
  });

  it('settles at maintenance after the goal switches from losing to maintaining', () => {
    for (const seed of seeds) {
      const r = simulate(
        { ...person, seed },
        (week) => (week < 8 ? { kind: 'lose', ratePctPerWeek: 0.75 } : { kind: 'maintain', ratePctPerWeek: 0 }),
        20,
      );
      expect(Math.abs(trueRate(r, 12, 20))).toBeLessThan(0.15);
    }
  });

  it('delivers a lean bulk despite missed days and 10% under-logging', () => {
    for (const seed of seeds) {
      const r = simulate(
        { ...person, seed, missDayProb: 0.15, missWeighProb: 0.15, logBias: 0.9 },
        () => ({ kind: 'gain', ratePctPerWeek: 0.25 }),
        20,
      );
      expect(trueRate(r, 6, 20)).toBeGreaterThan(0.1);
      expect(trueRate(r, 6, 20)).toBeLessThan(0.4);
    }
  });
});
