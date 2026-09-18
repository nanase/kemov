/**
 * D1 refuses a statement bound to more than 100 parameters
 * (`SQLITE_ERROR: variable number must be between ?1 and ?100`), not with a
 * partial result but by failing the whole query. Every `IN (?1, ?2, ...)`
 * this admin API builds from a caller-supplied id list (a stream's own
 * performed tunes, a tune's own credited people, and so on) can grow past
 * that once real data is behind it - #144's own streaming.yml migration
 * carries 113 streams alone. `MAX_IN_CLAUSE_IDS` keeps a chunk comfortably
 * under the ceiling, and `queryInChunks` is the one place that slices,
 * queries and re-merges so no call site has to get this right on its own.
 */
export const MAX_IN_CLAUSE_IDS = 90;

/** `ids`, split into groups of `MAX_IN_CLAUSE_IDS` or fewer, `query`'d in parallel and flattened back into one array - the shape an `IN (?1, ...)` lookup needs once its own id list can pass a few hundred. */
export async function queryInChunks<Id, Row>(
  ids: readonly Id[],
  query: (chunk: readonly Id[]) => Promise<Row[]>,
): Promise<Row[]> {
  if (ids.length === 0) return [];

  const chunks: Id[][] = [];

  for (let index = 0; index < ids.length; index += MAX_IN_CLAUSE_IDS) {
    chunks.push(ids.slice(index, index + MAX_IN_CLAUSE_IDS) as Id[]);
  }

  const results = await Promise.all(chunks.map((chunk) => query(chunk)));

  return results.flat();
}
