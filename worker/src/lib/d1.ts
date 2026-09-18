/**
 * D1 refuses a statement bound to more than 100 parameters
 * (developers.cloudflare.com/d1/platform/limits/), not with a partial result
 * but by failing the whole query. Every `IN (?1, ?2, ...)` built from a
 * caller-supplied id list (a stream's own performed tunes, an event's own
 * source ids, and so on) can grow past that once real data is behind it -
 * #144's own streaming.yml migration carries 113 streams alone.
 *
 * `ID_CHUNK_SIZE` matches #160's own constant: 50 leaves headroom for a
 * query that binds something alongside the id list, so every `IN (...)`
 * query in the admin API fails the same request the same way rather than
 * each picking its own number. `queryInChunks` is the one place that
 * slices, queries and re-merges so no call site has to get this right on
 * its own.
 */
export const ID_CHUNK_SIZE = 50;

/**
 * `ids`, split into groups of `ID_CHUNK_SIZE` or fewer, `query`'d and
 * flattened back into one array - the shape an `IN (?1, ...)` lookup needs
 * once its own id list can pass a few hundred.
 *
 * Chunks run concurrently (`Promise.all`), not one after another: every
 * call site already ran its own several reads this way before it had
 * chunks at all (see genet-streams.ts's `readStreams`, three queries
 * against the same id list in one `Promise.all`), and chunking would
 * otherwise turn that existing concurrency into a serial wait with no
 * correctness reason to - these are independent, read-only selects with no
 * ordering between them. This is about keeping that existing shape, not an
 * unmeasured claim that concurrent is faster.
 */
export async function queryInChunks<Id, Row>(
  ids: readonly Id[],
  query: (chunk: readonly Id[]) => Promise<Row[]>,
): Promise<Row[]> {
  if (ids.length === 0) return [];

  const chunks: Id[][] = [];

  for (let index = 0; index < ids.length; index += ID_CHUNK_SIZE) {
    chunks.push(ids.slice(index, index + ID_CHUNK_SIZE) as Id[]);
  }

  const results = await Promise.all(chunks.map((chunk) => query(chunk)));

  return results.flat();
}
