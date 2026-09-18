import {
  buildTimeline,
  daysBetween,
  dayStart,
  eventAt,
  eventItems,
  eventPasses,
  isKeyStream,
  jstDay,
  jstMonth,
  rowAt,
  streamPasses,
  yearFaces,
  DEFAULT_FILTERS,
  type Filters,
} from '@/footprints/model';
import type { VideoTableRow } from '@/lib/ranking';
import type { Channel, FootprintEvent } from '@/type/api';

/**
 * The road the footprints page draws.
 *
 * What is worth testing here is where a row lands and where a run of streams
 * is cut: the page reads as one column in date order, and a row in the wrong
 * month or a run that swallows the day something happened would say the wrong
 * thing about when it happened.
 */

const event = (over: Partial<FootprintEvent> = {}): FootprintEvent => ({
  eventId: 1,
  datePrecision: 'day',
  startDate: '2026-09-01',
  startsAt: null,
  endDate: null,
  kind: 'collab',
  emphasized: false,
  title: 'できごと',
  place: null,
  supplement: null,
  videoId: null,
  sourcePending: false,
  channelIds: [],
  sources: [],
  ...over,
});

const row = (over: Partial<VideoTableRow> = {}): VideoTableRow => ({
  videoId: 'v1',
  channelId: 'UCa',
  title: '配信',
  type: 'streaming',
  publishedAt: '2026-09-01T03:00:00Z',
  actualStartTime: '2026-09-01T03:00:00Z',
  actualEndTime: '2026-09-01T05:00:00Z',
  durationSeconds: 7200,
  viewCount: 1,
  likeCount: 1,
  commentCount: 1,
  chatMessageCount: 1,
  chatUniqueUserCount: 1,
  ...over,
});

const NOW = Date.parse('2026-09-19T00:00:00Z');
const filters = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });

describe('reading a date in Japan', () => {
  test('takes the Japanese day of an instant', () => {
    expect(jstDay(Date.parse('2026-09-18T15:30:00Z'))).toEqual('2026-09-19');
    expect(jstMonth(Date.parse('2026-08-31T15:30:00Z'))).toEqual('2026-09');
  });

  test('counts days by the calendar, not by the hours between', () => {
    expect(daysBetween(dayStart('2026-09-01'), dayStart('2026-09-03') + 60_000)).toEqual(2);
  });
});

describe('eventAt', () => {
  test('uses the recorded time of day where there is one', () => {
    expect(eventAt(event({ startsAt: '2026-09-01T11:00:00Z' }), null)).toEqual(Date.parse('2026-09-01T11:00:00Z'));
  });

  // A date known only to the month sits at the start of it, which is where a
  // reader looking for that month arrives.
  test('puts a month without a day at the start of the month', () => {
    expect(eventAt(event({ datePrecision: 'month', startDate: '2026-04' }), null)).toEqual(dayStart('2026-04-01'));
  });

  // Otherwise "the 3D reveal" and the stream it happened in are two rows a
  // minute apart.
  test('takes the time of the stream it is, when that is the same day', () => {
    const stream = row({ actualStartTime: '2026-09-01T11:00:00Z' });

    expect(eventAt(event({ videoId: 'v1' }), stream)).toEqual(Date.parse('2026-09-01T11:00:00Z'));
  });

  test('ignores a stream recorded on another day', () => {
    const stream = row({ actualStartTime: '2026-09-05T11:00:00Z' });

    expect(eventAt(event({ videoId: 'v1' }), stream)).toEqual(dayStart('2026-09-01'));
  });
});

describe('eventItems', () => {
  test('counts the days something ran, both ends included', () => {
    const [item] = eventItems([event({ startDate: '2026-09-01', endDate: '2026-09-03' })], new Map(), NOW);

    expect(item!.days).toEqual(3);
  });

  test('marks what has not happened yet', () => {
    const items = eventItems([event({ startDate: '2026-12-24' }), event({ eventId: 2 })], new Map(), NOW);

    expect(items.map((item) => item.future)).toEqual([false, true]);
  });
});

describe('the filters', () => {
  test('an event with nobody named belongs to everybody', () => {
    const [item] = eventItems([event()], new Map(), NOW);

    expect(eventPasses(item!, filters({ members: new Set(['UCz']) }))).toBe(true);
  });

  test('an event with members named is narrowed to them', () => {
    const [item] = eventItems([event({ channelIds: ['UCa'] })], new Map(), NOW);

    expect(eventPasses(item!, filters({ members: new Set(['UCz']) }))).toBe(false);
    expect(eventPasses(item!, filters({ members: new Set(['UCa']) }))).toBe(true);
  });

  test.each([
    ['all', true],
    ['emphasized', false],
    ['none', false],
    ['collab', true],
    ['goods', false],
  ] as const)('the kind %s shows a collab: %s', (kind, expected) => {
    const [item] = eventItems([event()], new Map(), NOW);

    expect(eventPasses(item!, filters({ kind }))).toBe(expected);
  });

  // A stream an event already stands for is not shown twice.
  test('leaves out a stream an event claimed', () => {
    expect(streamPasses(row(), filters(), new Set(['v1']))).toBe(false);
  });

  test('picks out the occasions rather than ranking them', () => {
    expect(isKeyStream('【3D お披露目】ついに立体になりました')).toBe(true);
    expect(isKeyStream('雑談配信')).toBe(false);
    expect(streamPasses(row({ title: '雑談配信' }), filters({ streams: 'key' }), new Set())).toBe(false);
  });
});

describe('buildTimeline', () => {
  const streams = [
    row({ videoId: 'a', actualStartTime: '2026-08-30T03:00:00Z', publishedAt: '2026-08-30T03:00:00Z' }),
    row({ videoId: 'b', actualStartTime: '2026-09-01T03:00:00Z', publishedAt: '2026-09-01T03:00:00Z' }),
    row({ videoId: 'c', actualStartTime: '2026-09-02T03:00:00Z', publishedAt: '2026-09-02T03:00:00Z' }),
    row({ videoId: 'd', actualStartTime: '2026-09-04T03:00:00Z', publishedAt: '2026-09-04T03:00:00Z' }),
  ];

  test('cuts a run of streams where the month turns', () => {
    const timeline = buildTimeline([], streams, filters(), NOW);
    const months = timeline.years.flatMap((year) => year.months);

    expect(months.map((month) => month.month)).toEqual(['2026-08', '2026-09']);
    expect(months[1]!.items.filter((item) => item.kind === 'bundle')).toHaveLength(1);
  });

  test('cuts a run where something happened', () => {
    const items = eventItems([event({ startDate: '2026-09-03' })], new Map(), NOW);
    const timeline = buildTimeline(items, streams, filters(), NOW);
    const september = timeline.years[0]!.months.find((month) => month.month === '2026-09')!;

    // Today is in the same month here, and closes the last run.
    expect(september.items.map((item) => item.kind)).toEqual(['bundle', 'event', 'bundle', 'now']);
  });

  test('cuts a run at today, and puts today in it once', () => {
    const now = Date.parse('2026-09-01T12:00:00Z');
    const timeline = buildTimeline([], streams, filters(), now);

    expect(timeline.order.filter((item) => item.kind === 'now')).toHaveLength(1);
    expect(timeline.years[0]!.months[1]!.items.map((item) => item.kind)).toEqual(['bundle', 'now', 'bundle']);
  });

  test('counts what each year and month holds', () => {
    const items = eventItems([event({ startDate: '2026-09-03' })], new Map(), NOW);
    const timeline = buildTimeline(items, streams, filters(), NOW);

    expect(timeline.events).toEqual(1);
    expect(timeline.streams).toEqual(4);
    expect(timeline.years[0]!.streams).toEqual(4);
  });

  test('keeps one row per run however many streams it holds', () => {
    const timeline = buildTimeline([], streams, filters(), NOW);

    expect(timeline.order.filter((item) => item.kind === 'bundle')).toHaveLength(2);
  });

  test('draws the streams alone when nothing has been recorded', () => {
    const timeline = buildTimeline([], streams, filters(), NOW);

    expect(timeline.events).toEqual(0);
    expect(timeline.streams).toEqual(4);
  });
});

describe('yearFaces', () => {
  const channel = (id: string, start: string, end: string | null = null): Channel =>
    ({ channelId: id, name: id, activityStartDate: start, activityEndDate: end }) as Channel;

  // A member who finished during the year was part of that year.
  test('keeps a member who finished inside the year', () => {
    const faces = yearFaces([channel('UCa', '2021-04-26', '2022-05-21')], 2022, NOW);

    expect(faces.map((c) => c.channelId)).toEqual(['UCa']);
  });

  test('leaves out a member who had not started yet', () => {
    expect(yearFaces([channel('UCa', '2023-01-01')], 2022, NOW)).toEqual([]);
  });

  test('leaves out a member whose debut is still to come', () => {
    expect(yearFaces([channel('UCa', '2027-01-01')], 2027, NOW)).toEqual([]);
  });
});
