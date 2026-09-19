import { formatDate, formatLength, formatSince, formatTime, hostOf } from '@/footprints/draw';
import { formatDuration } from '@/type/video';

/**
 * How the footprints page writes what its model worked out.
 *
 * Dates are this page's main material and every one of them is Japanese time
 * (#140), so what is worth holding here is the wording: the same length has
 * to read the same way as it does on the other pages, and a date has to say
 * which day it is in Japan rather than where the browser happens to be.
 */

describe('formatLength', () => {
  // The same stream is the same stream on /videos/ and /members/. Two ways of
  // writing its length would read as two different measurements.
  test('writes a length the way the rest of the site writes one', () => {
    for (const seconds of [0, 1, 59, 60, 599, 3599, 3600, 3723, 45_296]) {
      expect(formatLength(seconds)).toEqual(formatDuration(seconds));
    }
  });

  test('writes hours only once there are hours', () => {
    expect(formatLength(2700)).toEqual('45:00');
    expect(formatLength(3723)).toEqual('1:02:03');
  });

  // Where the member page writes a dash, this writes nothing: its caller puts
  // the length inside a sentence - "20:00 〜 21:02（1:02:03）" - and a dash
  // alone inside those brackets says less than empty brackets would.
  test('writes nothing at all for a length nobody recorded', () => {
    expect(formatLength(null)).toEqual('');
  });

  test('never writes a negative length', () => {
    expect(formatLength(-5)).toEqual('00:00');
  });
});

describe('the dates on this page are Japanese', () => {
  test('writes the day it is in Japan, with the weekday', () => {
    expect(formatDate(Date.parse('2026-09-18T15:30:00Z'))).toEqual('2026-09-19 (土)');
  });

  test('writes the time of day in Japan', () => {
    expect(formatTime(Date.parse('2026-09-18T15:30:00Z'))).toEqual('00:30');
  });
});

describe('formatSince', () => {
  const now = Date.parse('2026-09-19T00:00:00+09:00');

  test('says today rather than counting nothing', () => {
    expect(formatSince(Date.parse('2026-09-19T20:00:00+09:00'), now)).toEqual('今日');
  });

  test('writes what is still ahead as the wait', () => {
    expect(formatSince(Date.parse('2026-09-25T00:00:00+09:00'), now)).toEqual('あと 6 日');
  });

  // "3 年 2 か月前" is what somebody remembers. "1,158 日前" is not.
  test('counts whole months and years for anything older', () => {
    expect(formatSince(Date.parse('2026-09-10T00:00:00+09:00'), now)).toEqual('9 日前');
    expect(formatSince(Date.parse('2026-07-19T00:00:00+09:00'), now)).toEqual('2 か月前');
    expect(formatSince(Date.parse('2023-07-19T00:00:00+09:00'), now)).toEqual('3 年 2 か月前');
  });
});

describe('hostOf', () => {
  test('shows the host rather than the whole address', () => {
    expect(hostOf('https://www.example.com/a/b?c=d')).toEqual('example.com');
  });

  test('gives back whatever it was handed when that is not an address', () => {
    expect(hostOf('出典なし')).toEqual('出典なし');
  });
});
