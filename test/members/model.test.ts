import dayjs from '@nanase/alnilam/dayjs';

import {
  anchorOf,
  behaviorWindow,
  busiestCell,
  cumulativeOf,
  distributionOf,
  gaugeChange,
  gaugeSeries,
  gaugeValue,
  highlightParts,
  heatCounts,
  heatLevel,
  jstDay,
  memberStreams,
  monthlySeries,
  niceStep,
  readQuery,
  shapeOf,
  streaksOf,
  topsOf,
  weekStart,
  windowTotals,
  writeQuery,
  type PageState,
} from '@/members/model';
import type { VideoTableRow } from '@/lib/ranking';
import type { Channel, ChannelMonths } from '@/type/api';

/**
 * What the member page works out for itself.
 *
 * The rules #136 fixed are the ones worth testing here: a window anchored to
 * the member rather than to today, a tie that is reported as a tie, and a
 * heatmap that counts one stream once however finely it is cut.
 */

const row = (over: Partial<VideoTableRow> = {}): VideoTableRow => ({
  videoId: 'v1',
  channelId: 'UCa',
  title: 'タイトル',
  type: 'streaming',
  publishedAt: '2026-09-01T03:00:00Z',
  actualStartTime: '2026-09-01T03:00:00Z',
  actualEndTime: '2026-09-01T05:00:00Z',
  durationSeconds: 7200,
  viewCount: 1000,
  likeCount: 10,
  commentCount: 5,
  chatMessageCount: 300,
  chatUniqueUserCount: 30,
  ...over,
});

const channel = (over: Partial<Channel> = {}): Channel =>
  ({
    channelId: 'UCa',
    name: 'カラカル',
    activityStartDate: '2021-04-26',
    activityEndDate: null,
    latest: { subscriberCount: 12_200, viewCount: 3_000_000, videoCount: 780 },
    ...over,
  }) as Channel;

describe('anchorOf', () => {
  const now = Date.parse('2026-09-19T00:00:00Z');

  test('is today for a member who is still streaming', () => {
    expect(anchorOf(channel(), now)).toEqual(now);
  });

  // Anchoring to today would leave every window of the four who have finished
  // empty, which reads as "nothing to show" rather than "not in this window".
  test('is the day after the last for a member who has finished', () => {
    const at = anchorOf(channel({ activityEndDate: '2024-03-31' }), now);

    expect(jstDay(at)).toEqual('2024-04-01');
  });
});

describe('memberStreams', () => {
  test('places a stream in the week by its Japanese start', () => {
    // 2026-09-01T03:00:00Z is Tuesday 12:00 JST.
    const [stream] = memberStreams([row()]);

    expect(stream!.weekMinute).toEqual(2 * 1440 + 12 * 60);
    expect(stream!.minutes).toEqual(120);
    expect(stream!.day).toEqual('2026-09-01');
    expect(stream!.startMinuteOfDay).toEqual(12 * 60);
  });

  test('falls back to the recorded duration when no end was stored', () => {
    const [stream] = memberStreams([row({ actualEndTime: null, durationSeconds: 1800 })]);

    expect(stream!.minutes).toEqual(30);
  });

  // A stream with nothing but a start still happened.
  test('keeps a stream with neither an end nor a duration', () => {
    const [stream] = memberStreams([row({ actualEndTime: null, durationSeconds: null })]);

    expect(stream!.minutes).toEqual(1);
  });

  test('leaves out what is not a finished stream', () => {
    expect(memberStreams([row({ type: 'video' }), row({ actualStartTime: null })])).toEqual([]);
  });
});

describe('behaviorWindow', () => {
  const streams = memberStreams([
    row({ videoId: 'a', actualStartTime: '2023-05-01T03:00:00Z', actualEndTime: '2023-05-01T04:00:00Z' }),
    row({ videoId: 'b', actualStartTime: '2025-01-01T03:00:00Z', actualEndTime: '2025-01-01T04:00:00Z' }),
    row({ videoId: 'c', actualStartTime: '2025-06-01T03:00:00Z', actualEndTime: '2025-06-01T04:00:00Z' }),
  ]);

  test('lists the years streamed in, newest first', () => {
    expect(behaviorWindow(streams, 'all', null).years).toEqual([2025, 2023]);
  });

  // Counted back from the member's own last stream, not from today.
  test('takes the last year of streaming rather than the last year', () => {
    expect(behaviorWindow(streams, '1y', null).streams.map((s) => s.row.videoId)).toEqual(['b', 'c']);
  });

  test('takes one calendar year when one is chosen', () => {
    expect(behaviorWindow(streams, 'year', 2023).streams.map((s) => s.row.videoId)).toEqual(['a']);
  });
});

describe('cumulativeOf', () => {
  test('counts the days from the debut through today', () => {
    const now = Date.parse('2021-04-30T03:00:00Z');

    expect(cumulativeOf(channel(), [], now).activityDays).toEqual(5);
  });

  test('says how many rows carried each sum', () => {
    const totals = cumulativeOf(channel(), [row(), row({ likeCount: null, type: 'video' })], Date.now());

    expect(totals).toMatchObject({ likeCount: 10, likeRated: 1, commentCount: 10, commentRated: 2, videoCount: 2 });
    expect(totals.byKind).toEqual({ streaming: 1, video: 1, shorts: 0 });
  });
});

describe('windowTotals and the gauges', () => {
  const rows = [
    row({ publishedAt: '2026-09-01T03:00:00Z', durationSeconds: 3600, chatMessageCount: 100, chatUniqueUserCount: 10 }),
    row({ publishedAt: '2026-09-02T03:00:00Z', durationSeconds: 1800, chatMessageCount: 200, chatUniqueUserCount: 20 }),
  ];
  const window = windowTotals(rows, Date.parse('2026-09-01T00:00:00Z'), Date.parse('2026-09-03T00:00:00Z'));

  test('adds up what was published inside it', () => {
    expect(window).toMatchObject({ count: 2, durationSeconds: 5400, chatMessages: 300, chatUsers: 30 });
  });

  test('reads each measure off the window', () => {
    expect(gaugeValue('count', window)).toEqual(2);
    expect(gaugeValue('perVideo', window)).toEqual(2700);
    expect(gaugeValue('chatPerStream', window)).toEqual(150);
  });

  // The monthly line draws an empty stretch as zero, so the gauge above it
  // has to say zero as well.
  test('reads an empty window as zero streamed time, not as unknown', () => {
    const empty = windowTotals(rows, Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-02-01T00:00:00Z'));

    expect(gaugeValue('duration', empty)).toEqual(0);
    expect(gaugeValue('perVideo', empty)).toBeNull();
  });

  test('has no change to report without something to compare against', () => {
    expect(gaugeChange(10, null)).toBeNull();
    expect(gaugeChange(10, 0)).toBeNull();
    expect(gaugeChange(12, 10)).toEqual(20);
  });

  // The gauge is called 配信時間 and the line under it reads streamSeconds, so
  // counting a short's length here would make the two disagree.
  test('leaves videos and shorts out of the streamed time', () => {
    const mixed = [
      row({ publishedAt: '2026-09-01T03:00:00Z', type: 'streaming', durationSeconds: 3600 }),
      row({ publishedAt: '2026-09-01T05:00:00Z', type: 'video', durationSeconds: 600 }),
      row({ publishedAt: '2026-09-01T06:00:00Z', type: 'shorts', durationSeconds: 30 }),
    ];
    const totals = windowTotals(mixed, Date.parse('2026-09-01T00:00:00Z'), Date.parse('2026-09-02T00:00:00Z'));

    expect(totals).toMatchObject({ count: 3, streamCount: 1, durationSeconds: 3600 });
    expect(gaugeValue('duration', totals)).toEqual(3600);
  });

  // A month of videos and no streams is a month of no streaming, which the
  // line draws as a zero. "Unknown" would contradict it.
  test('reads a window with videos but no streams as zero streamed time', () => {
    const videos = [row({ publishedAt: '2026-09-01T05:00:00Z', type: 'video', durationSeconds: 600 })];
    const totals = windowTotals(videos, Date.parse('2026-09-01T00:00:00Z'), Date.parse('2026-09-02T00:00:00Z'));

    expect(gaugeValue('duration', totals)).toEqual(0);
    expect(gaugeValue('perVideo', totals)).toBeNull();
  });
});

describe('topsOf', () => {
  test('reports every entry that shares the lead', () => {
    expect(topsOf([3, 1, 3, 0])).toEqual({ list: [0, 2], max: 3 });
  });

  test('has no lead when nothing was counted', () => {
    expect(topsOf([0, 0])).toEqual({ list: [], max: 0 });
  });
});

describe('shapeOf', () => {
  const streams = memberStreams([
    row({ videoId: 'a', actualStartTime: '2026-09-01T12:00:00Z', actualEndTime: '2026-09-01T14:00:00Z' }),
    row({ videoId: 'b', actualStartTime: '2026-09-02T12:00:00Z', actualEndTime: '2026-09-02T15:30:00Z' }),
    row({ videoId: 'c', actualStartTime: '2026-09-08T12:00:00Z', actualEndTime: '2026-09-08T13:00:00Z' }),
  ]);
  const shape = shapeOf(streams)!;

  test('reads the hour streams begin in, in Japanese time', () => {
    // 12:00 UTC is 21:00 JST.
    expect(shape.startHour).toMatchObject({ list: [21], max: 3 });
  });

  // Only the 3.5-hour one from 21:00 JST ends on the following day.
  test('counts a stream that runs past midnight', () => {
    expect(shape.overnight).toEqual(1);
  });

  test('has the same rate by the day and by the week', () => {
    expect(shape.perWeek).toBeCloseTo(7 / shape.daysPerStream!);
  });

  test('counts the weeks crossed rather than dividing the days', () => {
    expect(shape.spanWeeks).toEqual(2);
    expect(shape.weeksStreamed).toEqual(2);
  });

  test('has nothing to say about a window with no streams', () => {
    expect(shapeOf([])).toBeNull();
  });
});

describe('weekStart and streaksOf', () => {
  test('starts a week on its Monday', () => {
    expect(weekStart('2026-09-19')).toEqual('2026-09-14');
  });

  test('reports runs of two days or more, longest first', () => {
    const runs = streaksOf(['2026-09-01', '2026-09-02', '2026-09-05', '2026-09-08', '2026-09-09', '2026-09-10']);

    expect(runs).toEqual([
      { from: '2026-09-08', to: '2026-09-10', days: 3 },
      { from: '2026-09-01', to: '2026-09-02', days: 2 },
    ]);
  });

  // A single day is not a run of one.
  test('leaves a lone day out', () => {
    expect(streaksOf(['2026-09-01', '2026-09-05'])).toEqual([]);
  });
});

describe('distributionOf', () => {
  test('rounds a class width to something readable', () => {
    expect(niceStep(4700)).toEqual(5000);
    expect(niceStep(0)).toEqual(1);
  });

  test('takes its width from the data, not from the widest value', () => {
    const values = [...Array.from({ length: 99 }, (_, i) => i + 1), 100_000];
    const dist = distributionOf(values)!;

    expect(dist.step).toBeLessThan(100);
    // The outlier lands in the open class at the end rather than stretching
    // every other class flat.
    expect(dist.bins[12]).toEqual(1);
  });

  test('marks the class the middle value falls in', () => {
    const dist = distributionOf([10, 20, 30], 10)!;

    expect(dist.medianBin).toEqual(2);
  });

  test('has nothing to draw for a window with no records', () => {
    expect(distributionOf([])).toBeNull();
  });
});

describe('heatCounts', () => {
  // Tuesday 12:00 JST for two hours.
  const streams = memberStreams([row()]);

  test('counts one stream once in every cell it covered', () => {
    const heat = heatCounts(streams, 60);

    expect(heat.columns).toEqual(24);
    expect(heat.cells[2 * 24 + 12]).toEqual(1);
    expect(heat.cells[2 * 24 + 13]).toEqual(1);
    expect(heat.max).toEqual(1);
  });

  // The resolution changes how finely the week is cut, never what a number
  // means: one stream still touched one weekday and one stretch of the day.
  test('counts a stream once per weekday however finely the week is cut', () => {
    [60, 30, 10, 1].forEach((step) => {
      expect(heatCounts(streams, step).byWeekday[2]).toEqual(1);
    });
  });

  test('finds the busiest cell', () => {
    const heat = heatCounts(memberStreams([row(), row({ videoId: 'v2' })]), 60);

    expect(busiestCell(heat)).toEqual({ weekday: 2, column: 12, value: 2 });
    expect(busiestCell(heatCounts([], 60))).toBeNull();
  });

  // Linear shading would lose one stream against a peak of forty.
  test('keeps the quietest cell visible', () => {
    expect(heatLevel(1, 40)).toBeGreaterThanOrEqual(1);
    expect(heatLevel(40, 40)).toEqual(4);
    expect(heatLevel(0, 40)).toEqual(0);
  });
});

describe('readQuery and writeQuery', () => {
  const state = (over: Partial<PageState> = {}): PageState => ({ ...readQuery(''), ...over });

  test('opens on the defaults when the query says nothing', () => {
    expect(readQuery('')).toMatchObject({ listPeriod: 'all', type: 'streaming', metric: 'viewCount', order: 'desc' });
  });

  test('carries only what the reader changed', () => {
    expect(writeQuery(state())).toEqual('');
    expect(writeQuery(state({ q: '歌枠', order: 'asc' }))).toEqual('?q=%E6%AD%8C%E6%9E%A0&order=asc');
  });

  test('comes back the same after a round trip', () => {
    const chosen = state({ listPeriod: '90d', behaviorPeriod: 'year', year: 2024, monthly: 'chat', type: 'shorts' });

    expect(readQuery(writeQuery(chosen))).toEqual(chosen);
  });

  // A hand-written query names things this page may not have.
  test('falls back to the default for a value it does not know', () => {
    expect(readQuery('?type=live&metric=nothing&year=0&order=sideways')).toMatchObject({
      type: 'streaming',
      metric: 'viewCount',
      year: null,
      order: 'desc',
    });
  });

  test('keeps the chosen year out of the URL while another period is showing', () => {
    expect(writeQuery(state({ behaviorPeriod: 'all', year: 2024 }))).toEqual('');
  });
});

describe('dayjs is not needed to place a day in Japan', () => {
  test('reads the Japanese day of an instant', () => {
    // 2026-09-18T15:30:00Z is already 2026-09-19 in Japan.
    expect(jstDay(Date.parse('2026-09-18T15:30:00Z'))).toEqual('2026-09-19');
    expect(jstDay(dayjs('2026-09-18T14:30:00Z').valueOf())).toEqual('2026-09-18');
  });
});

describe('highlightParts', () => {
  test('marks the search term inside the title', () => {
    const parts = highlightParts('記念配信のおしらせ', ['配信']);

    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual(['配信']);
  });

  // `indexOf` counts in UTF-16 units and an emoji is two of them, so walking
  // the title one character at a time drifts by one place after the first
  // emoji and highlights the wrong run.
  test('keeps the marks in place after an emoji', () => {
    const parts = highlightParts('🎉 記念配信', ['配信']);

    expect(parts.filter((part) => part.hit).map((part) => part.text)).toEqual(['配信']);
  });

  test('marks nothing when nothing was searched for', () => {
    expect(highlightParts('記念配信', [])).toEqual([{ text: '記念配信', hit: false }]);
  });
});

describe('a month with one of its three counts missing', () => {
  const months = (over: Partial<ChannelMonths> = {}): ChannelMonths =>
    ({
      channelId: 'UCa',
      streams: [4, 4, 4],
      videos: [1, null, 1],
      shorts: [2, 2, 2],
      streamSeconds: [3600, 3600, 3600],
      chatMessages: [10, 10, 10],
      chatUniqueUsers: [5, 5, 5],
      views: [100, 100, 100],
      subscribers: [null, null, null],
      ...over,
    }) as ChannelMonths;

  // Counting the hole as zero turns "we do not know" into "seven", which is
  // drawn as a quiet month rather than as a gap in the record.
  test('leaves the month out of the count rather than reading the hole as zero', () => {
    expect(monthlySeries(months(), 'streams')).toEqual([7, null, 7]);
    expect(gaugeSeries(months(), 'count')).toEqual([7, null, 7]);
  });

  test('counts a month where all three are known', () => {
    expect(monthlySeries(months({ videos: [1, 1, 1] }), 'streams')).toEqual([7, 7, 7]);
  });
});
