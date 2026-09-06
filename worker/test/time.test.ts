import { formatTimestamp } from '../src/lib/time';

describe('formatTimestamp', () => {
  test('drops sub-second precision and keeps the uppercase Z', () => {
    expect(formatTimestamp(new Date('2026-09-06T12:34:56.789Z'))).toEqual('2026-09-06T12:34:56Z');
  });

  test('pads a midnight timestamp the same as any other', () => {
    expect(formatTimestamp(new Date('2026-01-01T00:00:00.000Z'))).toEqual('2026-01-01T00:00:00Z');
  });
});
