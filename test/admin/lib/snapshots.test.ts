import { defaultDayRange, jstClock, snapshotsQuery, todayJst } from '@/admin/lib/snapshots';

describe('todayJst', () => {
  test('reads the Japan-time date off the given clock', () => {
    expect(todayJst(new Date('2026-09-14T02:00:00Z'))).toEqual('2026-09-14');
  });

  test('rolls forward once +9 hours crosses midnight', () => {
    expect(todayJst(new Date('2026-09-14T15:30:00Z'))).toEqual('2026-09-15');
  });
});

describe('defaultDayRange', () => {
  test('spans 13 days ending on today, in Japan time', () => {
    expect(defaultDayRange('2026-09-19')).toEqual({ from: '2026-09-07', to: '2026-09-19' });
  });

  test('crosses a month boundary correctly', () => {
    expect(defaultDayRange('2026-10-03')).toEqual({ from: '2026-09-21', to: '2026-10-03' });
  });
});

describe('snapshotsQuery', () => {
  test('always carries from/to', () => {
    expect(snapshotsQuery(null, '2026-09-01', '2026-09-13')).toEqual('?from=2026-09-01&to=2026-09-13');
  });

  test('adds channelId when given', () => {
    expect(snapshotsQuery('UCaaa', '2026-09-01', '2026-09-13')).toEqual(
      '?from=2026-09-01&to=2026-09-13&channelId=UCaaa',
    );
  });
});

describe('jstClock', () => {
  test('formats a UTC instant as its Japan-time clock reading', () => {
    expect(jstClock('2026-09-14T02:00:00Z')).toEqual('2026-09-14 11:00');
  });

  // 2026-09-14T15:30:00Z + 9h crosses into the next Japan-time date.
  test('rolls the date forward when +9 hours crosses midnight', () => {
    expect(jstClock('2026-09-14T15:30:00Z')).toEqual('2026-09-15 00:30');
  });
});
