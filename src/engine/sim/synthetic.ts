/**
 * Synthetic person for simulation tests: a known true expenditure, a body
 * that obeys energy balance, a noisy scale and imperfect logging.
 * Deterministic for a given seed.
 */
import { addDays, type IsoDate } from '../dates';
import { KCAL_PER_KG } from '../energy';
import type { DayIntake } from '../expenditure';
import type { WeighIn } from '../trend';

/** mulberry32: small, fast, seedable PRNG returning [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export interface PersonSpec {
  seed: number;
  start: IsoDate;
  startKg: number;
  /** True expenditure at the starting weight, kcal/day. */
  trueKcal: number;
  /** True expenditure change per kg of mass change. */
  adaptationKcalPerKg?: number;
  /** Scale noise: uniform ±this many kg around true mass. */
  scaleNoiseKg?: number;
  /** Relative random error of each logged day (SD). */
  logNoiseCv?: number;
  /** Logged ÷ eaten (0.9 = logs 10% less than eaten). */
  logBias?: number;
  /** Probability a day goes unlogged. */
  missDayProb?: number;
  /** Probability a morning weigh-in is skipped. */
  missWeighProb?: number;
}

export interface SimDay {
  date: IsoDate;
  trueMassKg: number;
  trueKcal: number;
  eatenKcal: number;
}

/**
 * Steps a person forward one day at a time. The caller decides what they
 * plan to eat each day (so a coach can close the loop).
 */
export class SyntheticPerson {
  readonly weighIns: WeighIn[] = [];
  readonly days: DayIntake[] = [];
  readonly history: SimDay[] = [];
  private mass: number;
  private dayIndex = 0;
  private readonly rand: () => number;
  private readonly s: Required<PersonSpec>;

  constructor(spec: PersonSpec) {
    this.s = {
      adaptationKcalPerKg: 15,
      scaleNoiseKg: 1,
      logNoiseCv: 0.08,
      logBias: 1,
      missDayProb: 0,
      missWeighProb: 0,
      ...spec,
    };
    this.rand = seededRandom(spec.seed);
    this.mass = spec.startKg;
  }

  get today(): IsoDate {
    return addDays(this.s.start, this.dayIndex);
  }

  get trueKcal(): number {
    return this.s.trueKcal + this.s.adaptationKcalPerKg * (this.mass - this.s.startKg);
  }

  get trueMassKg(): number {
    return this.mass;
  }

  /**
   * Live one day: weigh in (maybe), aim to *log* `plannedKcal` (±noise),
   * log it (maybe). A biased logger eats plannedKcal / logBias to hit it.
   */
  live(plannedKcal: number): void {
    const date = this.today;
    if (this.dayIndex === 0 || this.rand() >= this.s.missWeighProb) {
      const noise = (this.rand() * 2 - 1) * this.s.scaleNoiseKg;
      this.weighIns.push({ date, kg: this.mass + noise });
    }
    const aimed = plannedKcal / this.s.logBias;
    const eaten = Math.max(0, aimed * (1 + this.s.logNoiseCv * gaussian(this.rand)));
    const trueKcal = this.trueKcal;
    this.history.push({ date, trueMassKg: this.mass, trueKcal, eatenKcal: eaten });
    if (this.rand() < this.s.missDayProb) {
      this.days.push({ date, kcal: null, status: 'unlogged' });
    } else {
      this.days.push({ date, kcal: eaten * this.s.logBias, status: 'complete' });
    }
    this.mass += (eaten - trueKcal) / KCAL_PER_KG;
    this.dayIndex++;
  }
}
