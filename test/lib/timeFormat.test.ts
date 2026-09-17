import { formatCalendarAge, formatDate, formatDateTime, formatRecentAge } from '@/lib/timeFormat';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** An instant given as JST wall-clock time. */
function jst(text: string): number {
  return Date.parse(`${text}+09:00`);
}

describe('formatDateTime', () => {
  test('writes the JST wall-clock time', () => {
    expect(formatDateTime(Date.parse('2025-05-29T21:57:45Z'))).toBe('2025-05-30 06:57:45');
  });

  test('pads every field to two digits', () => {
    expect(formatDateTime(jst('2026-01-02T03:04:05'))).toBe('2026-01-02 03:04:05');
  });
});

describe('formatDate', () => {
  test('uses the JST date, which is a day ahead of UTC after 15:00 UTC', () => {
    expect(formatDate(Date.parse('2025-05-29T15:00:00Z'))).toBe('2025-05-30');
    expect(formatDate(Date.parse('2025-05-29T14:59:59Z'))).toBe('2025-05-29');
  });
});

describe('formatRecentAge', () => {
  const now = jst('2026-09-17T12:00:00');

  test.each([
    [0, 'たった今'],
    [59 * SECOND, 'たった今'],
    [60 * SECOND, '1 分前'],
    [3 * MINUTE + 12 * SECOND, '3 分前'],
    [59 * MINUTE + 59 * SECOND, '59 分前'],
    [HOUR, '1 時間前'],
    [23 * HOUR + 59 * MINUTE, '23 時間前'],
    [DAY, '1 日前'],
    [400 * DAY, '400 日前'],
  ])('%i ms ago is %s', (ago, expected) => {
    expect(formatRecentAge(now - ago, now)).toBe(expected);
  });

  test('an instant after now is たった今', () => {
    expect(formatRecentAge(now + 5 * MINUTE, now)).toBe('たった今');
  });
});

describe('formatCalendarAge', () => {
  test.each([
    ['2026-09-17T12:00:00', '2026-09-17T12:00:00', '0 日前'],
    ['2026-09-01T00:00:00', '2026-09-30T23:59:59', '29 日前'],
    ['2026-01-01T00:00:00', '2026-01-31T00:00:00', '1 か月前'],
    ['2026-01-31T00:00:00', '2026-03-30T00:00:00', '1 か月前'],
    ['2026-01-31T00:00:00', '2026-03-31T00:00:00', '2 か月前'],
    ['2025-09-18T00:00:00', '2026-09-17T23:59:59', '11 か月前'],
    ['2025-09-17T00:00:00', '2026-09-17T00:00:00', '1 年前'],
    ['2025-05-30T06:57:45', '2026-09-17T12:00:00', '1 年 3 か月前'],
    ['2023-05-30T06:57:45', '2026-05-30T06:57:45', '3 年前'],
  ])('from %s to %s is %s', (then, now, expected) => {
    expect(formatCalendarAge(jst(then), jst(now))).toBe(expected);
  });

  test('counts months by the JST calendar, not the UTC one', () => {
    // 00:30 JST on 10-01 is still 09-30 in UTC.
    expect(formatCalendarAge(jst('2026-08-01T00:30:00'), jst('2026-10-01T00:30:00'))).toBe('2 か月前');
  });

  test('an instant after now is 0 日前', () => {
    expect(formatCalendarAge(jst('2026-09-18T00:00:00'), jst('2026-09-17T00:00:00'))).toBe('0 日前');
  });
});

describe('the runtime timezone', () => {
  /** getTimezoneOffset on 2026-01-01, to confirm the stub took effect. */
  const tzOffsetMinutes: Record<string, number> = {
    UTC: 0,
    'America/Los_Angeles': 480,
    'Pacific/Kiritimati': -840,
  };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test.each(['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati'])('does not change the text in %s', (tz) => {
    vi.stubEnv('TZ', tz);
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(tzOffsetMinutes[tz]);
    const then = Date.parse('2025-05-29T21:57:45Z');
    const now = Date.parse('2026-09-30T15:30:00Z');

    expect(formatDateTime(then)).toBe('2025-05-30 06:57:45');
    expect(formatDate(now)).toBe('2026-10-01');
    expect(formatCalendarAge(then, now)).toBe('1 年 4 か月前');
  });
});
