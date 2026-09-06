/**
 * 'YYYY-MM-DDTHH:MM:SSZ', the one shape every timestamp column in the schema
 * accepts - see the format comment at the top of
 * migrations/0001_create_initial_schema.sql. Every collector that writes a
 * fetched_at, next_attempt_at or updated_at goes through this rather than
 * Date#toISOString directly, which keeps the millisecond fraction.
 */
export function formatTimestamp(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}
