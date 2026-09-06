import { formatTimestamp, toSchemaTimestamp } from '../src/lib/time';

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
