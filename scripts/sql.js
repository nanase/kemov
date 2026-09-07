/**
 * The two ways a value becomes a literal in the SQL these scripts generate.
 *
 * Both generators write INSERT statements by hand rather than through a driver
 * - the output is a file handed to `wrangler d1 execute`, not a query with
 * bindings - so the quoting is theirs to get right, and there is one copy of
 * it rather than one per generator.
 */

/** A string literal with its quotes doubled, or NULL. */
export function quote(value) {
  return value === null || value === undefined ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
}

/**
 * A number unquoted, anything else quoted.
 *
 * The tables are STRICT, so a count written as '12' is text offered to an
 * INTEGER column and 'NULL' is the four-letter word rather than the absence.
 */
export function literal(value) {
  return typeof value === 'number' ? String(value) : quote(value);
}
