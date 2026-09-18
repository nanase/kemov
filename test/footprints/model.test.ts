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
  streamPasses,
  thisWeekInPast,
  upcoming,
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

/** The debut the round numbers beside the timeline are counted from. */
const DEBUT = event({
  eventId: 10,
  kind: 'debut',
  startDate: '2021-04-28',
  title: 'フンボルトペンギン',
  channelIds: ['UCa'],
});

const items = (list: FootprintEvent[], now = NOW) => eventItems(list, new Map(), now);

describe('upcoming', () => {
  test('counts an anniversary from the debut that is on the timeline', () => {
    const list = upcoming(items([DEBUT]), [], [], filters(), NOW);
    const anniversary = list.find((entry) => entry.label === '周年');

    expect(anniversary?.title).toEqual('フンボルトペンギンのデビュー 6 周年');
    expect(jstDay(anniversary?.at ?? 0)).toEqual('2027-04-28');
    // Worked out rather than recorded, so it opens the day it counts from.
    expect(anniversary?.key).toEqual('e:10');
  });

  test('marks the round numbers of days, and only the ones still ahead', () => {
    const days = upcoming(items([DEBUT]), [], [], filters(), NOW).filter((entry) => entry.label === '日数');

    expect(days.map((entry) => entry.title)).toEqual(['フンボルトペンギンのデビューから 2,000 日']);
    expect(jstDay(days[0]?.at ?? 0)).toEqual('2026-10-19');
  });

  // The event's own title is a sentence; this row is a count, so it is named
  // after whoever it belongs to.
  test('names the count after the member rather than after the event', () => {
    const debut = event({
      eventId: 11,
      kind: 'debut',
      startDate: '2021-04-28',
      title: 'ケープとフンボルトが初配信',
      channelIds: ['UCa', 'UCb'],
    });
    const named = (id: string, name: string) => ({ channelId: id, name }) as Channel;
    const list = upcoming(
      items([debut]),
      [],
      [named('UCa', 'ケープペンギン'), named('UCb', 'フンボルトペンギン')],
      filters(),
      NOW,
    );

    expect(list[0]?.title).toContain('ケープペンギン・フンボルトペンギンのデビュー');
  });

  // A project is announced once. A later announcement is an event, not a
  // second beginning to count from.
  test('counts from the first beginning of each kind only', () => {
    const first = event({ eventId: 12, kind: 'project', startDate: '2021-04-25', title: 'けもV 発表' });
    const later = event({ eventId: 13, kind: 'project', startDate: '2023-04-25', title: '第 2 期の発表' });
    const list = upcoming(items([first, later]), [], [], filters(), NOW).filter((entry) => entry.label === '周年');

    expect(list.map((entry) => entry.title)).toEqual(['けもVの発表 6 周年']);
  });

  test('carries a recorded event that is still to come, as a plan', () => {
    const soon = event({ eventId: 2, startDate: '2026-10-01', kind: 'live-event', title: '会場イベント' });
    const list = upcoming(items([soon]), [], [], filters(), NOW);

    expect(list.map((entry) => [entry.title, entry.label, entry.planned])).toEqual([
      ['会場イベント', 'リアルイベント', true],
    ]);
  });

  test('leaves out an event known only to the month, which cannot be counted down to', () => {
    const vague = event({ eventId: 3, datePrecision: 'month', startDate: '2026-11', title: '月までのできごと' });

    expect(upcoming(items([vague]), [], [], filters(), NOW)).toEqual([]);
  });

  test('carries a scheduled stream, and never one an event already is', () => {
    const scheduled = row({ videoId: 'v9', publishedAt: '2026-09-25T11:00:00Z', actualStartTime: null });
    const claimed = row({ videoId: 'v8', publishedAt: '2026-09-26T11:00:00Z', actualStartTime: null });
    const list = upcoming(
      eventItems([event({ eventId: 4, startDate: '2026-09-26', videoId: 'v8' })], new Map([['v8', claimed]]), NOW),
      [scheduled, claimed],
      [],
      filters(),
      NOW,
    );

    expect(list.filter((entry) => entry.key === 'v:v9')).toHaveLength(1);
    expect(list.filter((entry) => entry.key === 'v:v8')).toHaveLength(0);
  });

  test('stops at a year ahead', () => {
    const far = event({ eventId: 5, startDate: '2028-01-01', title: 'ずっと先' });

    expect(upcoming(items([far]), [], [], filters(), NOW)).toEqual([]);
  });

  test('keeps only the members being read, and always keeps けもV itself', () => {
    const mine = event({ eventId: 6, startDate: '2026-10-02', channelIds: ['UCa'], title: '本人の予定' });
    const other = event({ eventId: 7, startDate: '2026-10-03', channelIds: ['UCb'], title: '別の方の予定' });
    const whole = event({ eventId: 8, startDate: '2026-10-04', channelIds: [], title: 'けもV 全体' });
    const list = upcoming(items([mine, other, whole]), [], [], filters({ members: new Set(['UCa']) }), NOW);

    expect(list.map((entry) => entry.title)).toEqual(['本人の予定', 'けもV 全体']);
  });

  test('puts the nearest day first, and an undated one before a timed one', () => {
    const timed = event({ eventId: 9, startDate: '2026-10-19', startsAt: '2026-10-19T02:00:00Z', title: '時刻あり' });
    const list = upcoming(items([DEBUT, timed]), [], [], filters(), NOW);
    const sameDay = list.filter((entry) => jstDay(entry.at) === '2026-10-19');

    expect(sameDay.map((entry) => entry.label)).toEqual(['日数', 'コラボ']);
  });
});

describe('thisWeekInPast', () => {
  const near = event({ eventId: 20, startDate: '2024-09-20', title: '2 年前の今週' });

  test('finds the same week in an earlier year, and says how long ago', () => {
    const list = thisWeekInPast(items([near]), [], filters(), NOW);

    expect(list.map((entry) => [entry.title, entry.yearsAgo])).toEqual([['2 年前の今週', 2]]);
  });

  test('leaves out a day more than three either side of today', () => {
    const far = event({ eventId: 21, startDate: '2024-09-25', title: '同じ月の別の週' });

    expect(thisWeekInPast(items([far]), [], filters(), NOW)).toEqual([]);
  });

  test('leaves out this year, which is not "years ago"', () => {
    const sameYear = event({ eventId: 22, startDate: '2026-09-20', title: '今年の今週' });

    expect(thisWeekInPast(items([sameYear]), [], filters(), NOW)).toEqual([]);
  });

  // Which four survive is decided by weight; the order they are read in is
  // the week's own, so a day drawn large does not jump out of its place.
  test('keeps a day drawn large when the week is fuller than the list', () => {
    const plain = [1, 2, 3, 4].map((n) =>
      event({ eventId: 40 + n, startDate: `202${n}-09-18`, title: `ふつうの日 ${n}` }),
    );
    const big = event({ eventId: 23, startDate: '2023-09-22', emphasized: true, title: '大きな日' });
    const list = thisWeekInPast(items([...plain, big]), [], filters(), NOW);

    expect(list.map((entry) => entry.title)).toEqual(['ふつうの日 4', 'ふつうの日 3', 'ふつうの日 2', '大きな日']);
  });

  test('fills a quiet week with the streams worth naming, and no others', () => {
    const marked = row({
      videoId: 'v2',
      publishedAt: '2023-09-19T03:00:00Z',
      actualStartTime: '2023-09-19T03:00:00Z',
      title: '1 周年記念配信',
    });
    const plain = row({
      videoId: 'v3',
      publishedAt: '2023-09-19T05:00:00Z',
      actualStartTime: '2023-09-19T05:00:00Z',
      title: 'いつもの雑談',
    });
    const list = thisWeekInPast([], [marked, plain], filters(), NOW);

    expect(list.map((entry) => entry.title)).toEqual(['1 周年記念配信']);
  });

  test('holds four rows at most', () => {
    const many = [1, 2, 3, 4, 5].map((n) => event({ eventId: 30 + n, startDate: `202${n}-09-19`, title: `${n} 件目` }));

    expect(thisWeekInPast(items(many), [], filters(), NOW)).toHaveLength(4);
  });
});
