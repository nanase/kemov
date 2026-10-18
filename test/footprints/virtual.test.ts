import { dayStart, type BundleItem, type EventItem, type MonthGroup, type NowItem } from '@/footprints/model';
import {
  compensation,
  estimateItemHeight,
  estimateMonthHeight,
  monthBounds,
  monthEdges,
  monthSignature,
  profileOf,
  NARROW_WIDTH,
  type Resize,
} from '@/footprints/virtual';
import type { VideoTableRow } from '@/lib/ranking';
import type { FootprintEvent } from '@/type/api';

/**
 * What the timeline needs to draw only the months near the screen.
 *
 * The estimates are fitted to the published page, so the numbers themselves
 * are not what is checked: what matters is that more to show is never
 * estimated shorter, and that the page is moved only when what moved was
 * above what the reader is looking at.
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

const eventItem = (over: Partial<FootprintEvent> = {}, endAt: number | null = null): EventItem => ({
  kind: 'event',
  key: `e:${over.eventId ?? 1}`,
  event: event(over),
  at: dayStart('2026-09-01'),
  endAt,
  days: 0,
  future: false,
  timed: false,
  row: null,
});

const row = (videoId: string, day: string, title = '雑談'): VideoTableRow => ({
  videoId,
  channelId: 'UCa',
  title,
  type: 'streaming',
  publishedAt: `${day}T12:00:00+09:00`,
  actualStartTime: `${day}T12:00:00+09:00`,
  actualEndTime: `${day}T14:00:00+09:00`,
  durationSeconds: 7200,
  viewCount: 1,
  likeCount: 1,
  commentCount: 1,
  chatMessageCount: 1,
  chatUniqueUserCount: 1,
});

const bundle = (rows: VideoTableRow[]): BundleItem => ({
  kind: 'bundle',
  key: `b:${rows[0]!.videoId}`,
  rows,
  at: dayStart('2026-09-01'),
  endAt: dayStart('2026-09-02'),
});

const now: NowItem = { kind: 'now', key: 'now', at: dayStart('2026-09-15') };

const month = (items: MonthGroup['items'], key = '2026-09'): MonthGroup => ({
  month: key,
  year: 2026,
  monthOfYear: 9,
  items,
  events: 0,
  streams: 0,
});

/** A run long enough to be folded: five streams over five days. */
const longRun = (titles: string[] = []) =>
  bundle(Array.from({ length: 5 }, (_, i) => row(`v${i}`, `2026-09-0${i + 1}`, titles[i] ?? '雑談')));

describe('profileOf', () => {
  test('lays out narrow up to the boundary, and wide past it', () => {
    expect(profileOf(NARROW_WIDTH)).toEqual('narrow');
    expect(profileOf(NARROW_WIDTH + 1)).toEqual('wide');
  });
});

describe('estimateItemHeight', () => {
  test('expects every kind of row to take room in both layouts', () => {
    for (const profile of ['wide', 'narrow'] as const) {
      expect(estimateItemHeight(now, false, profile)).toBeGreaterThan(0);
      expect(estimateItemHeight(eventItem(), false, profile)).toBeGreaterThan(0);
      expect(estimateItemHeight(longRun(), false, profile)).toBeGreaterThan(0);
    }
  });

  test('expects more to show to take more room', () => {
    const plain = estimateItemHeight(eventItem(), false, 'narrow');

    expect(estimateItemHeight(eventItem({ emphasized: true }), false, 'narrow')).toBeGreaterThan(plain);
    expect(estimateItemHeight(eventItem({ videoId: 'abc' }), false, 'narrow')).toBeGreaterThan(plain);
    expect(estimateItemHeight(eventItem({}, dayStart('2026-09-03')), false, 'narrow')).toBeGreaterThan(plain);
    expect(estimateItemHeight(eventItem({ supplement: '補足の文' }), false, 'narrow')).toBeGreaterThan(plain);
  });

  // A folded run names its occasions instead of listing everything.
  test('expects a folded run that names occasions to be taller than one that names none', () => {
    const quiet = estimateItemHeight(longRun(), false, 'wide');
    const occasion = estimateItemHeight(longRun(['1周年記念配信']), false, 'wide');

    expect(occasion).toBeGreaterThan(quiet);
  });

  test('expects a run to grow when it is opened', () => {
    expect(estimateItemHeight(longRun(), true, 'wide')).toBeGreaterThan(estimateItemHeight(longRun(), false, 'wide'));
  });

  // A run short enough is shown open from the start, whether or not the
  // reader has opened it.
  test('treats a short run as open whether or not it has been opened', () => {
    const short = bundle([row('v1', '2026-09-01'), row('v2', '2026-09-01')]);

    expect(estimateItemHeight(short, false, 'wide')).toEqual(estimateItemHeight(short, true, 'wide'));
  });
});

describe('estimateMonthHeight', () => {
  test('adds each row to the room the month takes on its own', () => {
    const empty = estimateMonthHeight(month([]), new Set(), 'wide');
    const one = estimateMonthHeight(month([eventItem()]), new Set(), 'wide');

    expect(one - empty).toEqual(Math.round(estimateItemHeight(eventItem(), false, 'wide')));
  });

  test('reads which runs the reader has opened', () => {
    const run = longRun();

    expect(estimateMonthHeight(month([run]), new Set([run.key]), 'wide')).toBeGreaterThan(
      estimateMonthHeight(month([run]), new Set(), 'wide'),
    );
  });
});

describe('monthSignature', () => {
  const run = longRun();

  test('stays the same for the same rows with the same runs open', () => {
    expect(monthSignature(month([run]), new Set())).toEqual(monthSignature(month([run]), new Set()));
  });

  // A height measured with other rows in it, or with a run opened since, is
  // not the height of this month any more.
  test('changes when the rows in it or the runs open in it change', () => {
    const before = monthSignature(month([run]), new Set());

    expect(monthSignature(month([run, eventItem()]), new Set())).not.toEqual(before);
    expect(monthSignature(month([run]), new Set([run.key]))).not.toEqual(before);
  });

  test('ignores a run opened in another month', () => {
    expect(monthSignature(month([run]), new Set(['b:elsewhere']))).toEqual(monthSignature(month([run]), new Set()));
  });
});

describe('monthBounds', () => {
  test('runs from midnight on the first, Japanese time, to the moment before the next month', () => {
    expect(monthBounds('2026-09')).toEqual({ from: dayStart('2026-09-01'), to: dayStart('2026-10-01') - 1 });
  });

  test('carries December into the next year', () => {
    expect(monthBounds('2026-12').to).toEqual(dayStart('2027-01-01') - 1);
  });
});

describe('monthEdges', () => {
  const { from, to } = monthBounds('2026-09');

  test('puts the start of the month at the top when the oldest comes first', () => {
    expect(monthEdges('2026-09', 100, 400, 'asc')).toEqual([
      { at: from, y: 100 },
      { at: to, y: 400 },
    ]);
  });

  test('puts the end of the month at the top when the newest comes first', () => {
    expect(monthEdges('2026-09', 100, 400, 'desc')).toEqual([
      { at: to, y: 100 },
      { at: from, y: 400 },
    ]);
  });
});

describe('compensation', () => {
  const change = (over: Partial<Resize>): Resize => ({ top: 0, before: 500, after: 800, standIn: false, ...over });

  test('moves the page by what a frame entirely above the screen grew or shrank', () => {
    expect(compensation([change({ top: -900 })], 0)).toEqual(300);
    expect(compensation([change({ top: -900, after: 200 })], 0)).toEqual(-300);
  });

  test('leaves the page alone for a frame below the top of the screen', () => {
    expect(compensation([change({ top: 200 })], 0)).toEqual(0);
  });

  // A run opened in front of the reader grows downwards from where they
  // pressed, and moving the page would take the run away from under them.
  test('leaves the page alone for a drawn month that reaches into the screen', () => {
    expect(compensation([change({ top: -200 })], 0)).toEqual(0);
  });

  // What a stand-in held was not on screen, so the rows under it are the only
  // thing to keep still.
  test('moves the page for a stand-in that reaches into the screen', () => {
    expect(compensation([change({ top: -200, standIn: true })], 0)).toEqual(300);
  });

  test('leaves the page alone for a stand-in that starts at the top of the screen', () => {
    expect(compensation([change({ top: 0, standIn: true })], 0)).toEqual(0);
  });

  // The second frame's top already includes what the first one grew by, so
  // where it was before the round is further up than where it is now.
  test('reads each frame where it was before the frames above it moved', () => {
    const first = change({ top: -1500, before: 500, after: 800 });
    // From -700 to -200 before the round: entirely above. At -400 now, it
    // would look as if it reached into the screen.
    const second = change({ top: -700 + 300, before: 500, after: 600 });

    expect(compensation([second, first], 0)).toEqual(400);
  });

  test('ignores a change too small to be anything but rounding', () => {
    expect(compensation([change({ top: -900, after: 500.4 })], 0)).toEqual(0);
  });
});
