import { estimatedOneRepMax, strengthChange, strengthSignal, type LiftSet } from './strength';

describe('estimatedOneRepMax', () => {
  it('applies Epley', () => {
    expect(estimatedOneRepMax(100, 5)).toBeCloseTo(116.667, 3);
    expect(estimatedOneRepMax(100, 1)).toBe(100);
  });

  it('adds reps in reserve from RPE', () => {
    // RPE 8 → 2 in reserve → 7 effective reps
    expect(estimatedOneRepMax(100, 5, 8)).toBeCloseTo(123.333, 3);
    expect(estimatedOneRepMax(100, 1, 10)).toBe(100);
  });

  it('rejects unusable sets', () => {
    expect(estimatedOneRepMax(100, 15)).toBeNull();
    expect(estimatedOneRepMax(0, 5)).toBeNull();
    expect(estimatedOneRepMax(null, 5)).toBeNull();
    expect(estimatedOneRepMax(100, 0)).toBeNull();
  });
});

describe('strengthChange', () => {
  const END = '2026-03-31';
  const EARLIER = '2026-03-08'; // inside the window 21 days back
  const RECENT = '2026-03-29';
  const set = (date: string, exerciseId: string, weightKg: number, reps: number, extra: Partial<LiftSet> = {}): LiftSet => ({
    date,
    exerciseId,
    weightKg,
    reps,
    ...extra,
  });

  const sets: LiftSet[] = [
    set(EARLIER, 'bench', 100, 5),
    set(EARLIER, 'squat', 140, 5),
    set(EARLIER, 'row', 80, 8),
    set(RECENT, 'bench', 95, 5),
    set(RECENT, 'squat', 133, 5),
    set(RECENT, 'row', 80, 8),
    set(RECENT, 'bench', 200, 5, { setType: 'warmup' }), // ignored
    set(RECENT, 'curl', 20, 10), // not in both windows
  ];

  it('is the median change across exercises done in both windows', () => {
    const c = strengthChange(sets, END)!;
    expect(c.exercises).toBe(3);
    expect(c.changePct).toBeCloseTo(-5, 6);
  });

  it('needs at least two comparable exercises', () => {
    expect(strengthChange(sets.filter((s) => s.exerciseId === 'bench'), END)).toBeNull();
  });
});

describe('strengthSignal', () => {
  it('flags a strength drop while cutting', () => {
    expect(strengthSignal({ changePct: -4, exercises: 3 }, -0.75, -0.7)).toBe('strength-drop-cutting');
    expect(strengthSignal({ changePct: -2, exercises: 3 }, -0.75, -0.7)).toBeNull();
  });

  it('flags fast gain without strength progress', () => {
    expect(strengthSignal({ changePct: 0, exercises: 3 }, 0.25, 0.7)).toBe('bulk-without-strength');
    expect(strengthSignal({ changePct: 3, exercises: 3 }, 0.25, 0.7)).toBeNull();
  });

  it('stays quiet without data', () => {
    expect(strengthSignal(null, -0.5, -0.5)).toBeNull();
  });
});
