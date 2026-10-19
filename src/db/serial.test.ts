import { createSerialQueue } from './serial';

const tick = () => new Promise((r) => setTimeout(r, 1));

describe('createSerialQueue', () => {
  it('runs tasks one at a time, in order', async () => {
    const run = createSerialQueue();
    const log: string[] = [];
    const task = (name: string) => async () => {
      log.push(`${name} start`);
      await tick();
      log.push(`${name} end`);
      return name;
    };
    const results = await Promise.all([run(task('a')), run(task('b')), run(task('c'))]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(log).toEqual(['a start', 'a end', 'b start', 'b end', 'c start', 'c end']);
  });

  it('rejects only the failing task and keeps going', async () => {
    const run = createSerialQueue();
    const failing = run(async () => {
      throw new Error('boom');
    });
    const next = run(async () => 'ok');
    await expect(failing).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});
