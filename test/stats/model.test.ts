import dayjs from '@nanase/alnilam/dayjs';

import {
  announcementsOf,
  busiestCell,
  deltaOf,
  freshnessOf,
  heatGrid,
  heatPeak,
  monthlyGain,
  subjectOf,
  totalOf,
  valueOf,
  WEEK_MINUTES,
  type SubjectSource,
} from '@/stats/model';
import type { Channel, LiveStream, MonthTotals } from '@/type/api';

/**
 * What the statistics page works out for itself.
 *
 * The rules #134 fixed are the ones worth testing here: an ended member still
 * counts, nulls are not zeros, and nothing is ever scaled against another
 * member.
 */

const delta = (value: number | null) =>
  value === null
    ? ({ value: null, reason: 'history too short' } as const)
    : ({
        value,
        over: { from: dayjs('2026-09-06T12:00:00Z'), to: dayjs('2026-09-07T12:00:00Z'), seconds: 86400 },
      } as const);

const channel = (id: string, over: Partial<Channel> = {}): Channel => ({
  channelId: id,
  name: id,
  fullname: id,
  globalname: null,
  twitter: null,
  color: { key: '#F38E0A', sub: '#F8C112', light: '#FFEBA4', back: '#FFEBA4' },
  activityStartDate: '2021-04-26',
  activityEndDate: null,
  customUrl: null,
  thumbnailUrl: null,
  fetchedAt: dayjs('2026-09-07T12:00:00Z'),
  latest: { subscriberCount: 1000, viewCount: 50_000, videoCount: 100 },
  perHour: { subscriberCount: delta(1), viewCount: delta(2), videoCount: delta(0) },
  perDay: { subscriberCount: delta(10), viewCount: delta(20), videoCount: delta(1) },
  per30Days: { subscriberCount: delta(100), viewCount: delta(200), videoCount: delta(5) },
  ...over,
});

const months = (id: string, over: Partial<Record<string, (number | null)[]>> = {}) => ({
  channelId: id,
  streams: [null, 2, 3],
  videos: [null, 1, 0],
  shorts: [null, 0, 0],
  streamSeconds: [null, 7200, 10_800],
  chatMessages: [null, 100, 200],
  chatUniqueUsers: [null, 10, 20],
  views: [null, 1000, 2000],
  subscribers: [null, 900, 1000],
  ...over,
});

const TOTAL: MonthTotals = {
  streams: [0, 4, 6],
  videos: [0, 2, 0],
  shorts: [0, 0, 0],
  streamSeconds: [0, 14_400, 21_600],
  chatMessages: [0, 200, 400],
  chatUniqueUsers: [0, 20, 40],
  views: [0, 2000, 4000],
  subscribers: [null, 1800, 2000],
};

const source = (over: Partial<SubjectSource> = {}): SubjectSource => ({
  channels: [channel('UCa'), channel('UCb')],
  months: [months('UCa'), months('UCb')],
  total: TOTAL,
  spans: new Map([['UCa', [1260, 120]]]),
  ...over,
});

describe('subjectOf', () => {
  test('counts a month with streams and videos as both', () => {
    const subject = subjectOf(channel('UCa'), source());

    expect(subject.months.streams).toEqual([null, 3, 3]);
  });

  test('keeps a month before the debut apart from a month with nothing in it', () => {
    const subject = subjectOf(channel('UCa'), source({ months: [months('UCa', { streams: [null, 0, 3] })] }));

    expect(subject.months.streams[0]).toBeNull();
    expect(subject.months.streams[1]).toEqual(1);
  });

  test('turns stream seconds into hours', () => {
    expect(subjectOf(channel('UCa'), source()).months.hours).toEqual([null, 2, 3]);
  });

  test('adds up the chat messages as the member total', () => {
    expect(subjectOf(channel('UCa'), source()).chatTotal).toEqual(300);
  });

  test('has no months of its own when /api/months does not know the member', () => {
    const subject = subjectOf(channel('UCz'), source());

    expect(subject.months.streams).toEqual([null, null, null]);
    expect(subject.chatTotal).toBeNull();
  });

  test('reads an ended member as ended', () => {
    expect(subjectOf(channel('UCa', { activityEndDate: '2024-03-31' }), source()).ended).toBe(true);
  });
});

describe('monthlyGain', () => {
  test('is the difference from the month before', () => {
    expect(monthlyGain([100, 120, 150])).toEqual([null, 20, 30]);
  });

  // A month nobody read is not a month nobody subscribed in.
  test('reports nothing for a month with no reading, and for the first one with', () => {
    expect(monthlyGain([null, null, 1000, null, 1100])).toEqual([null, null, null, null, 100]);
  });

  test('keeps a loss as a loss', () => {
    expect(monthlyGain([100, 90])).toEqual([null, -10]);
  });
});

describe('totalOf', () => {
  const subjects = () => source().channels.map((c) => subjectOf(c, source()));

  test('uses the API total while every member is on screen', () => {
    const total = totalOf(subjects(), source(), true);

    expect(total.months.streams).toEqual([0, 6, 6]);
    // The API carries an ended member's last count forward; this must not
    // recompute it from the members' own series, which deliberately do not.
    expect(total.months.subsLevel).toEqual([null, 1800, 2000]);
  });

  test('adds the members up when the list is narrowed, and then says nothing about subscribers', () => {
    const total = totalOf([subjects()[0]!], source(), false);

    expect(total.months.streams).toEqual([null, 3, 3]);
    expect(total.months.subsLevel).toEqual([null, null, null]);
  });

  test('adds up the counts and the changes', () => {
    const total = totalOf(subjects(), source(), true);

    expect(valueOf(total, 'subscriberCount')).toEqual(2000);
    expect(deltaOf(total, 'subscriberCount', 'per30Days')).toMatchObject({ value: 200 });
  });

  test('sums what it has when only some members report a change', () => {
    const one = channel('UCa');
    const other = channel('UCb', {
      perDay: { subscriberCount: delta(null), viewCount: delta(null), videoCount: delta(null) },
    });
    const src = source({ channels: [one, other] });
    const total = totalOf([subjectOf(one, src), subjectOf(other, src)], src, true);

    expect(deltaOf(total, 'subscriberCount', 'perDay')).toMatchObject({ value: 10 });
  });

  test('reports no change when no member has one', () => {
    const hidden = { subscriberCount: delta(null), viewCount: delta(null), videoCount: delta(null) };
    const one = channel('UCa', { perDay: hidden });
    const src = source({ channels: [one] });
    const total = totalOf([subjectOf(one, src)], src, true);

    expect(deltaOf(total, 'subscriberCount', 'perDay')).toMatchObject({ value: null });
  });

  test('keeps a hidden count out of the sum rather than counting it as zero', () => {
    const hidden = channel('UCb', { latest: { subscriberCount: null, viewCount: 1, videoCount: 1 } });
    const src = source({ channels: [channel('UCa'), hidden] });
    const total = totalOf(
      src.channels.map((c) => subjectOf(c, src)),
      src,
      true,
    );

    expect(valueOf(total, 'subscriberCount')).toEqual(1000);
  });

  test('chat has a total but never a change', () => {
    const total = totalOf(subjects(), source(), true);

    expect(valueOf(total, 'chatCount')).toEqual(600);
    expect(deltaOf(total, 'chatCount', 'perDay')).toBeNull();
  });
});

describe('freshnessOf', () => {
  test.each([
    [0, 'ok'],
    [600, 'ok'],
    [601, 'warn'],
    [1800, 'warn'],
    [1801, 'bad'],
    [7200, 'bad'],
  ])('%i seconds old is %s', (seconds, expected) => {
    expect(freshnessOf(seconds)).toEqual(expected);
  });
});

describe('announcementsOf', () => {
  const now = Date.parse('2026-09-18T03:00:00Z'); // 12:00 JST
  const stream = (over: Partial<LiveStream>): LiveStream => ({
    videoId: 'v1',
    channelId: 'UCa',
    title: '配信',
    state: 'upcoming',
    scheduledStartTime: dayjs('2026-09-18T10:00:00Z'),
    actualStartTime: null,
    fetchedAt: dayjs('2026-09-18T03:00:00Z'),
    ...over,
  });

  test('puts what is on air first', () => {
    const rows = announcementsOf(
      [
        stream({ videoId: 'soon', scheduledStartTime: dayjs('2026-09-18T03:30:00Z') }),
        stream({ videoId: 'live', state: 'live' }),
      ],
      now,
    );

    expect(rows.map((r) => r.videoId)).toEqual(['live', 'soon']);
  });

  test('calls the next hour soon and the rest of today today', () => {
    const rows = announcementsOf(
      [
        stream({ videoId: 'in59', scheduledStartTime: dayjs('2026-09-18T03:59:00Z') }),
        stream({ videoId: 'in61', scheduledStartTime: dayjs('2026-09-18T04:01:00Z') }),
      ],
      now,
    );

    expect(rows.map((r) => [r.videoId, r.kind])).toEqual([
      ['in59', 'soon'],
      ['in61', 'today'],
    ]);
  });

  test('writes the start in Japan time', () => {
    const rows = announcementsOf([stream({ scheduledStartTime: dayjs('2026-09-18T10:00:00Z') })], now);

    expect(rows[0]!.time).toEqual('19:00');
  });

  // The day is the Japanese one, so 21:00 JST is today even though it is
  // 12:00 UTC and tomorrow is already 00:30 JST.
  test('goes by the Japanese day', () => {
    const late = announcementsOf([stream({ scheduledStartTime: dayjs('2026-09-18T12:00:00Z') })], now);
    const tomorrow = announcementsOf([stream({ scheduledStartTime: dayjs('2026-09-18T15:30:00Z') })], now);

    expect(late).toHaveLength(1);
    expect(tomorrow).toHaveLength(0);
  });

  test('leaves out an upcoming stream with no time on it', () => {
    expect(announcementsOf([stream({ scheduledStartTime: null })], now)).toHaveLength(0);
  });
});

describe('heatGrid', () => {
  // Sunday 21:00 JST for two hours: the week minute is 21 * 60.
  const sundayEvening = [21 * 60, 120];

  test('spreads a stream over every slot it covers', () => {
    const grid = heatGrid(sundayEvening, 60);

    expect(grid[0]![21]).toEqual(60);
    expect(grid[0]![22]).toEqual(60);
    expect(grid[0]![23]).toEqual(0);
  });

  test('cuts the day into as many slots as the step asks for', () => {
    expect(heatGrid(sundayEvening, 60)[0]).toHaveLength(24);
    expect(heatGrid(sundayEvening, 30)[0]).toHaveLength(48);
    expect(heatGrid(sundayEvening, 10)[0]).toHaveLength(144);
    expect(heatGrid(sundayEvening, 1)[0]).toHaveLength(1440);
  });

  test('wraps a stream that runs past the end of the week into its start', () => {
    const grid = heatGrid([WEEK_MINUTES - 30, 60], 60);

    expect(grid[6]![23]).toEqual(30);
    expect(grid[0]![0]).toEqual(30);
  });

  test('counts two streams in the same hour twice', () => {
    expect(heatGrid([60, 60, 60, 60], 60)[0]![1]).toEqual(120);
  });

  test('is empty for a member with no streams', () => {
    const grid = heatGrid([], 60);

    expect(heatPeak(grid)).toEqual(1);
    expect(busiestCell(grid)).toEqual({ day: 0, slot: 0, minutes: 0 });
  });

  test('finds the busiest cell', () => {
    // Two streams over the same Wednesday hour, against one Sunday evening.
    const wednesdayNoon = 3 * 1440 + 13 * 60;
    const grid = heatGrid([...sundayEvening, wednesdayNoon, 60, wednesdayNoon, 60], 60);

    expect(busiestCell(grid)).toEqual({ day: 3, slot: 13, minutes: 120 });
    expect(heatPeak(grid)).toEqual(120);
  });
});
