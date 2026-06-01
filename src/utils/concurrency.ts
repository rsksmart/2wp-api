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
        const chunkResults = await Promise.all(chunk.map(fn));
        return acc.concat(chunkResults);
      }),
    Promise.resolve([] as R[]),
  );
}
