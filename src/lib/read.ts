/**
 * Reading values out of a body this code did not build.
 *
 * `axios.get<T>()` is a type annotation and nothing more. It tells the
 * compiler what to assume and asks the response nothing, so a body of the
 * wrong shape is carried into the components as though it were right and
 * fails somewhere further in, where the message names a component rather than
 * the field that was missing. #58 lists that among the defects to remove.
 *
 * These functions are the alternative, and they are deliberately small. There
 * is no schema library here because the worker does not use one either: it
 * gates what it accepts with narrow readers - `toCount`, `parseDurationSeconds`
 * - and lets D1's STRICT tables and CHECK constraints refuse the rest. This is
 * the same idea on the other side of the wire.
 *
 * Every reader takes the path it is reading, so that a failure names the field
 * rather than the request.
 */

/** Thrown when a body is not the shape the caller reads it as. */
export class ShapeError extends Error {
  constructor(
    readonly path: string,
    expected: string,
    value: unknown,
  ) {
    super(`${path} should be ${expected}, got ${describe(value)}`);
    this.name = 'ShapeError';
  }
}

/**
 * What a value was, short enough to read in a message.
 *
 * The value itself is not included beyond its type and, for a string, its
 * length. A body that failed to parse is not necessarily safe to quote into a
 * log or an error box.
 */
function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `an array of ${value.length}`;
  if (typeof value === 'string') return `a string of ${value.length}`;
  if (typeof value === 'number') return Number.isFinite(value) ? 'a number' : `the number ${value}`;

  return `a ${typeof value}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An object, and the one place that decides what counts as one. */
export function readObject(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ShapeError(path, 'an object', value);

  return value;
}

/**
 * One field of an object.
 *
 * A missing field reads as `undefined` rather than throwing, because whether
 * absence is allowed is the reader's business, not this function's.
 */
export function field(value: unknown, name: string, path: string): unknown {
  return readObject(value, path)[name];
}

export function readString(value: unknown, path: string): string {
  if (typeof value !== 'string') throw new ShapeError(path, 'a string', value);

  return value;
}

/**
 * A number, and never NaN or an infinity.
 *
 * JSON cannot carry either, but a division upstream can, and a NaN that
 * reaches a component is displayed rather than caught.
 */
export function readNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new ShapeError(path, 'a finite number', value);

  return value;
}

/**
 * A value the API sends as null when it has none.
 *
 * Null is a real answer everywhere in this API - a channel that hides its
 * subscriber count, a video whose type has not been worked out yet - so it is
 * read as null rather than smoothed into zero or into a default. Undefined is
 * accepted alongside it: an older deployment that has not grown a field yet is
 * saying the same thing.
 */
export function readOrNull<T>(value: unknown, path: string, read: (value: unknown, path: string) => T): T | null {
  return value === null || value === undefined ? null : read(value, path);
}

export function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new ShapeError(path, 'an array', value);

  return value;
}

/** Every element of an array, read by the same reader and numbered in the path. */
export function readEach<T>(value: unknown, path: string, read: (value: unknown, path: string) => T): T[] {
  return readArray(value, path).map((element, index) => read(element, `${path}[${index}]`));
}

/**
 * A string that has to be one of a known set.
 *
 * Used for the fields this site switches on - a video's type, a stream's
 * state, a missing reason. An unknown value there would fall through every
 * branch and render as nothing, which is the failure mode that is hardest to
 * notice, so it is refused where it arrives instead.
 */
export function readOneOf<T extends string>(value: unknown, path: string, allowed: readonly T[]): T {
  const text = readString(value, path);

  if (!(allowed as readonly string[]).includes(text)) {
    throw new ShapeError(path, `one of ${allowed.join(', ')}`, value);
  }

  return text as T;
}

const AN_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const A_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether `text` names the instant it parsed to, or a different one.
 *
 * `new Date` is not a validator. It refuses a thirteenth month but rolls a
 * thirtieth of February forward into March, so a shape check alone would let
 * one date in and hand back another. Formatting what was parsed and comparing
 * it with what arrived is the check: a date that had to be moved does not come
 * back the same.
 *
 * This is the schema's own test in another language. Every timestamp column
 * carries `strftime(...) IS <column>` for exactly this, and the API validates
 * its query strings the same way.
 */
function isRoundTrip(text: string, parsed: Date): boolean {
  if (Number.isNaN(parsed.getTime())) return false;

  // toISOString always carries milliseconds and neither shape here does, so
  // the comparison is against the leading part - which for a date is the whole
  // of what it named, and for an instant is everything but the '.000'.
  return parsed
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .startsWith(text);
}

/**
 * An instant in the shape every timestamp in this API has.
 *
 * Checked here rather than handed to `dayjs`, which accepts nearly anything
 * and answers an invalid date for the rest - a value that spreads through the
 * page rather than stopping. The API refuses to store or serve any other
 * shape, so anything else arriving here means something other than that API
 * answered.
 */
export function readInstant(value: unknown, path: string): string {
  const text = readString(value, path);

  if (!AN_INSTANT.test(text) || !isRoundTrip(text, new Date(text))) {
    throw new ShapeError(path, 'an instant like 2026-09-07T12:00:00Z', value);
  }

  return text;
}

/** A date with no time, which is the shape the activity dates have. */
export function readDate(value: unknown, path: string): string {
  const text = readString(value, path);

  if (!A_DATE.test(text) || !isRoundTrip(text, new Date(`${text}T00:00:00Z`))) {
    throw new ShapeError(path, 'a date like 2026-09-07', value);
  }

  return text;
}
