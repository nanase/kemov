import { formatTimestamp, isSchemaDate, toSchemaTimestamp } from '../src/lib/time';

describe('formatTimestamp', () => {
  test('drops sub-second precision and keeps the uppercase Z', () => {
    expect(formatTimestamp(new Date('2026-09-06T12:34:56.789Z'))).toEqual('2026-09-06T12:34:56Z');
  });

  test('pads a midnight timestamp the same as any other', () => {
    expect(formatTimestamp(new Date('2026-01-01T00:00:00.000Z'))).toEqual('2026-01-01T00:00:00Z');
  });
});

// The shapes below are the ones the YouTube API actually sends. Each is a real
// instant the schema's CHECK would refuse as written.
describe('toSchemaTimestamp', () => {
  test('keeps an instant already in the schema shape', () => {
    expect(toSchemaTimestamp('2026-09-06T22:00:00Z')).toEqual('2026-09-06T22:00:00Z');
  });

  test('converts a UTC offset to Z', () => {
    expect(toSchemaTimestamp('2026-09-06T14:13:29-07:00')).toEqual('2026-09-06T21:13:29Z');
  });

  test('drops a fractional second', () => {
    expect(toSchemaTimestamp('2026-09-06T22:00:00.123Z')).toEqual('2026-09-06T22:00:00Z');
  });

  test('converts an offset and a fraction at once', () => {
    expect(toSchemaTimestamp('2026-09-06T14:13:29.123-07:00')).toEqual('2026-09-06T21:13:29Z');
  });

  test('is null when there is no timestamp', () => {
    expect(toSchemaTimestamp(undefined)).toBeNull();
  });

  // One missing timestamp costs less than a row the CHECK refuses outright.
  test('is null rather than a guess for something that is not an instant', () => {
    expect(toSchemaTimestamp('yesterday')).toBeNull();
    expect(toSchemaTimestamp('')).toBeNull();
  });
});

describe('isSchemaDate', () => {
  test('accepts a real calendar date in the schema shape', () => {
    expect(isSchemaDate('2026-09-18')).toEqual(true);
  });

  test('refuses a shape that is not YYYY-MM-DD', () => {
    expect(isSchemaDate('2026-9-18')).toEqual(false);
    expect(isSchemaDate('2026/09/18')).toEqual(false);
    expect(isSchemaDate('')).toEqual(false);
  });

  // 2023-02-29 matches A_DATE but is not a real day; rolling it into March
  // instead of refusing it is what the round trip through Date exists to
  // catch.
  test('refuses a day that does not exist, in a month that does', () => {
    expect(isSchemaDate('2023-02-29')).toEqual(false);
  });

  // #158's review (2026-09-18): month 13 matches A_DATE too, and unlike an
  // out-of-range day, it used to make this function throw a RangeError
  // instead of returning false - new Date leaves an out-of-range ISO
  // component as an Invalid Date rather than rolling it over, and
  // toISOString on one throws.
  test('refuses an out-of-range month without throwing', () => {
    expect(() => isSchemaDate('2023-13-01')).not.toThrow();
    expect(isSchemaDate('2023-13-01')).toEqual(false);
  });

  test('accepts the last real day of February in a leap year', () => {
    expect(isSchemaDate('2024-02-29')).toEqual(true);
  });
});
