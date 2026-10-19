/**
 * Runs async tasks one at a time, in the order they were queued. A failing
 * task rejects its own promise without blocking the tasks after it.
 *
 * Used to serialise database transactions: expo-sqlite's withTransactionAsync
 * would otherwise absorb unrelated concurrent queries into an open
 * transaction, or throw if a second one starts. Don't queue a task from
 * inside a queued task: it would wait for itself.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}
