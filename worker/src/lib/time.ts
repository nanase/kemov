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

const A_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether `value` is a real calendar date in the schema's `YYYY-MM-DD` shape.
 *
 * The pattern alone admits 2023-02-29; round-tripping through Date is what
 * refuses a day that does not exist rather than rolling it into the next
 * month. The same check as scripts/channels.js's isRealDate, repeated rather
 * than shared: that one is plain JavaScript so bare node can run it with no
 * build step, this one is TypeScript for workerd, and neither can import the
 * other. What they share is the rule, which is not either file's to change
 * alone - channels.yml's activity_start_date and the admin site's PUT to
 * `channel` (members.ts) both end up in the same column, so the two checks
 * must keep agreeing on what a real date is even though the code does not.
 */
export function isSchemaDate(value: string): boolean {
  return A_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}
