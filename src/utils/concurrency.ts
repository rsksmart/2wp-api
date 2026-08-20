import {throwIfCancelled} from './request-cancellation';

export async function withConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const size = Math.max(1, limit);
  const chunks: T[][] = [];

  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }

  return chunks.reduce(
    (chain, chunk) =>
      chain.then(async acc => {
        // Never dispatch another batch for a request nobody is waiting on.
        throwIfCancelled();
        const chunkResults = await Promise.all(chunk.map(fn));
        return acc.concat(chunkResults);
      }),
    Promise.resolve([] as R[]),
  );
}

/**
 * Runs `fn` over `items` with bounded concurrency, folding each batch of
 * results into an accumulator as soon as that batch settles.
 *
 * Unlike {@link withConcurrency}, nothing is retained beyond what `accumulate`
 * chooses to keep, and `accumulate` may throw to abort the traversal — no
 * further work is dispatched once it does. That is what lets a caller enforce a
 * global budget *while* results arrive instead of after every result has been
 * fetched, mapped and flattened.
 *
 * Peak retained memory is therefore bounded by
 * `accumulator + (limit x per-item result)`.
 *
 * @param items - Items to process, in order.
 * @param limit - Maximum items in flight at once. Values below 1 are treated as 1.
 * @param fn - Async mapper applied to each item.
 * @param accumulate - Folds one result into the accumulator. Throw from here to abort the remaining items.
 * @param initial - Initial accumulator value.
 * @returns The final accumulator.
 * @throws Whatever `fn` or `accumulate` throws.
 */
export async function reduceWithConcurrency<T, R, A>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  accumulate: (acc: A, result: R, item: T) => A,
  initial: A,
): Promise<A> {
  const size = Math.max(1, limit);
  let acc = initial;

  for (let i = 0; i < items.length; i += size) {
    // Never dispatch another batch for a request nobody is waiting on. This
    // reuses the same abort-by-throw path the row budget already uses.
    throwIfCancelled();
    const chunk = items.slice(i, i + size);
    const results = await Promise.all(chunk.map(fn));
    // Fold immediately so an over-budget accumulator throws before the next
    // batch of provider requests is issued.
    for (let j = 0; j < results.length; j += 1) {
      acc = accumulate(acc, results[j], chunk[j]);
    }
  }

  return acc;
}
