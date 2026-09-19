import { buildTrailMap, monthIndex, monthPoint, trailLayout, trailX, trailY } from '@/footprints/map';
import { eventItems, DEFAULT_FILTERS, type Filters } from '@/footprints/model';
import type { VideoTableRow } from '@/lib/ranking';
import type { Channel, FootprintEvent } from '@/type/api';

/**
 * The trajectory beside the timeline.
 *
 * Worth testing here is where a mark lands and how the panel packs itself:
 * the chart has one lane per member and must not grow sideways as members are
 * added, and a line that ended must still be a line rather than a fainter one
 * (#140).
 */

const event = (over: Partial<FootprintEvent> = {}): FootprintEvent => ({
  eventId: 1,
  datePrecision: 'day',
  startDate: '2021-04-25',
  startsAt: null,
  endDate: null,
  kind: 'project',
  emphasized: false,
  title: 'けもV 発表',
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
  publishedAt: '2021-06-01T03:00:00Z',
  actualStartTime: '2021-06-01T03:00:00Z',
  actualEndTime: '2021-06-01T05:00:00Z',
  durationSeconds: 7200,
  viewCount: 1,
  likeCount: 1,
  commentCount: 1,
  chatMessageCount: 1,
  chatUniqueUserCount: 1,
  ...over,
});

const channel = (id: string, start: string, end: string | null = null): Channel =>
  ({ channelId: id, name: id, activityStartDate: start, activityEndDate: end, color: { key: '#EB5B5B' } }) as Channel;

const NOW = Date.parse('2026-09-19T00:00:00Z');
const filters = (over: Partial<Filters> = {}): Filters => ({ ...DEFAULT_FILTERS, ...over });
const items = (list: FootprintEvent[]) => eventItems(list, new Map(), NOW);

describe('reading a date onto the time axis', () => {
  test('counts months from year zero so that two dates can be subtracted', () => {
    expect(monthIndex(2021, 4) - monthIndex(2020, 12)).toEqual(4);
  });

  test('places a day inside its month as a fraction of it', () => {
    const april = monthIndex(2021, 4);

    expect(monthPoint(Date.parse('2021-04-01T00:00:00+09:00'), april)).toBeCloseTo(0, 3);
    expect(monthPoint(Date.parse('2021-04-16T00:00:00+09:00'), april)).toBeCloseTo(0.5, 2);
    expect(monthPoint(Date.parse('2021-05-01T00:00:00+09:00'), april)).toBeCloseTo(1, 3);
  });
});

describe('buildTrailMap', () => {
  const channels = [channel('UCa', '2021-04-28'), channel('UCb', '2021-06-11', '2022-05-21')];

  test('gives けもV the first lane and the members the rest, in the order sent', () => {
    const map = buildTrailMap(items([event()]), [], channels, filters(), NOW, false);

    expect(map.lanes.map((lane) => lane.channel?.channelId ?? 'all')).toEqual(['all', 'UCa', 'UCb']);
  });

  // The line stops where the activity stopped and is marked with a bar. It is
  // never drawn fainter or dotted, which is what #140 rules out.
  test('ends a line that ended with a bar, and keeps it a line', () => {
    const map = buildTrailMap(items([event()]), [], channels, filters(), NOW, false);
    const ended = map.spans.find((span) => span.lane === 2);

    expect(ended?.ended).toBe(true);
    expect(map.spans.find((span) => span.lane === 1)?.ended).toBe(false);
    expect(ended?.color).toEqual(map.lanes[2]?.color);
  });

  test('leaves out a member whose activity has not started', () => {
    const map = buildTrailMap(items([event()]), [], [channel('UCz', '2027-01-01')], filters(), NOW, false);

    expect(map.spans.filter((span) => span.lane === 1)).toEqual([]);
  });

  test('puts an event with nobody named on けもV own lane', () => {
    const map = buildTrailMap(
      items([event({ eventId: 2, startDate: '2022-01-01', kind: 'goods' })]),
      [],
      channels,
      filters(),
      NOW,
      false,
    );

    expect(map.dots.filter((dot) => dot.lane === 0)).toHaveLength(1);
  });

  test('joins the lanes of everybody one event involved', () => {
    const together = event({ eventId: 3, startDate: '2022-01-01', kind: 'collab', channelIds: ['UCa', 'UCb'] });
    const map = buildTrailMap(items([together]), [], channels, filters(), NOW, false);

    expect(map.ties).toHaveLength(1);
    expect(map.ties[0]).toMatchObject({ from: 1, to: 2 });
    expect(map.dots.filter((dot) => dot.at === map.ties[0]!.at)).toHaveLength(2);
  });

  test('measures each month against the busiest one', () => {
    const rows = [
      row({ videoId: 'a', actualStartTime: '2021-06-01T03:00:00Z', publishedAt: '2021-06-01T03:00:00Z' }),
      row({ videoId: 'b', actualStartTime: '2021-06-02T03:00:00Z', publishedAt: '2021-06-02T03:00:00Z' }),
      row({ videoId: 'c', actualStartTime: '2021-07-01T03:00:00Z', publishedAt: '2021-07-01T03:00:00Z' }),
    ];
    const map = buildTrailMap(items([event()]), rows, channels, filters(), NOW, false);

    expect(map.bars.map((bar) => bar.amount)).toEqual([1, 0.5]);
  });

  test('draws no volume when the streams are not being shown', () => {
    const map = buildTrailMap(items([event()]), [row()], channels, filters({ streams: 'none' }), NOW, false);

    expect(map.bars).toEqual([]);
  });

  test('marks every year, and rules all but the first', () => {
    const map = buildTrailMap(items([event()]), [], channels, filters(), NOW, false);

    expect(map.years.map((year) => year.year)).toEqual([2021, 2022, 2023, 2024, 2025, 2026]);
    expect(map.years.map((year) => year.rule)).toEqual([false, true, true, true, true, true]);
  });
});

describe('trailLayout', () => {
  // Adding members must not widen the panel: the lanes are packed closer, and
  // once a lane is narrower than a face the faces go over two rows.
  test('packs the lanes closer rather than growing sideways', () => {
    const few = trailLayout(268, 600, 4, 60, false);
    const many = trailLayout(268, 600, 12, 60, false);

    expect(many.width).toEqual(few.width);
    expect(many.laneWidth).toBeLessThan(few.laneWidth);
  });

  test('staggers the faces once a lane is narrower than one', () => {
    expect(trailLayout(268, 600, 4, 60, false).staggered).toBe(false);
    expect(trailLayout(268, 600, 24, 60, false).staggered).toBe(true);
  });

  // A month is never thinner than 4px, so a very long record runs past the
  // room rather than collapsing into an unreadable stripe. The panel scrolls
  // with the page, which is where the extra length goes.
  test('fits the room it was given until a month would be thinner than 4px', () => {
    const fits = trailLayout(268, 600, 12, 65, false);
    const long = trailLayout(268, 600, 12, 400, false);

    expect(fits.height).toBeLessThanOrEqual(600);
    expect(long.tLen / 400).toEqual(4);
  });

  test('never draws a month thicker than 8px, however short the record', () => {
    const layout = trailLayout(268, 600, 12, 6, false);

    expect(layout.tLen / 6).toEqual(8);
  });

  test('reads down the panel, and the other way when the order is reversed', () => {
    const down = trailLayout(268, 600, 12, 60, false);
    const up = trailLayout(268, 600, 12, 60, true);

    expect(trailY(down, 0, 60)).toBeLessThan(trailY(down, 60, 60));
    expect(trailY(up, 0, 60)).toBeGreaterThan(trailY(up, 60, 60));
  });

  test('puts each lane beside the last, left to right', () => {
    const layout = trailLayout(268, 600, 12, 60, false);

    expect(trailX(layout, 1) - trailX(layout, 0)).toBeCloseTo(layout.laneWidth, 5);
  });
});
