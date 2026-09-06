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

/**
 * An instant the YouTube API returned, in the schema's shape, or null when it
 * is absent or is not an instant at all.
 *
 * The API answers in spellings the schema's CHECK refuses: a UTC offset
 * instead of Z, and a fractional second. Both name a real moment, so they are
 * converted rather than dropped. Anything Date cannot read becomes null,
 * because one missing timestamp costs less than a row the CHECK refuses
 * outright.
 */
export function toSchemaTimestamp(value: string | undefined): string | null {
  if (value === undefined) return null;

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : formatTimestamp(date);
}
