import { ShapeError } from '@/lib/read';
import { readMonthsSeries, readStreamList } from '@/type/api';

/**
 * Reading `GET /api/months` and `GET /api/streams`.
 *
 * The bodies are written out here rather than imported from worker/src, for
 * the reason test/type/api.test.ts gives: a shared type would describe what
 * the worker meant to send, and what these check is what arrives.
 */

const MONTHS = {
  fetchedAt: '2026-09-07T12:00:00Z',
  months: ['2026-07', '2026-08', '2026-09'],
  channels: [
    {
      channelId: 'UCaaa',
      streams: [null, 4, 2],
      videos: [null, 1, 0],
      shorts: [null, 0, 0],
      streamSeconds: [null, 7200, 3600],
      chatMessages: [null, 500, 120],
      chatUniqueUsers: [null, 90, 40],
      views: [null, 12000, 3000],
      subscribers: [null, null, 1000],
    },
  ],
  total: {
    streams: [0, 4, 2],
    videos: [0, 1, 0],
    shorts: [0, 0, 0],
    streamSeconds: [0, 7200, 3600],
    chatMessages: [0, 500, 120],
    chatUniqueUsers: [0, 90, 40],
    views: [0, 12000, 3000],
    subscribers: [null, 980, 1000],
  },
};

describe('readMonthsSeries', () => {
  test('reads the months, one member and the total', () => {
    const series = readMonthsSeries(MONTHS);

    expect(series.fetchedAt?.toISOString()).toEqual('2026-09-07T12:00:00.000Z');
    expect(series.months).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(series.channels[0]!.channelId).toEqual('UCaaa');
    expect(series.channels[0]!.streams).toEqual([null, 4, 2]);
    expect(series.total.views).toEqual([0, 12000, 3000]);
  });

  // A month before the debut and a month with nothing published mean
  // different things, and only the first of them is null.
  test('keeps a null apart from a zero', () => {
    const series = readMonthsSeries(MONTHS);

    expect(series.channels[0]!.videos).toEqual([null, 1, 0]);
  });

  // The total carries an ended member's last count forward, so it can hold a
  // number in a month where that member's own series holds null.
  test('reads a total subscriber count the member does not have of their own', () => {
    const series = readMonthsSeries(MONTHS);

    expect(series.channels[0]!.subscribers[1]).toBeNull();
    expect(series.total.subscribers[1]).toEqual(980);
  });

  test('refuses a total series with a hole in it', () => {
    const body = { ...MONTHS, total: { ...MONTHS.total, streams: [0, null, 2] } };

    expect(() => readMonthsSeries(body)).toThrow(ShapeError);
  });

  test('refuses a body missing a series', () => {
    const { views, ...rest } = MONTHS.channels[0]!;

    expect(() => readMonthsSeries({ ...MONTHS, channels: [rest] })).toThrow(ShapeError);
    expect(views).toBeDefined();
  });

  test('reads an empty answer', () => {
    const empty = {
      fetchedAt: null,
      months: [],
      channels: [],
      total: {
        streams: [],
        videos: [],
        shorts: [],
        streamSeconds: [],
        chatMessages: [],
        chatUniqueUsers: [],
        views: [],
        subscribers: [],
      },
    };

    expect(readMonthsSeries(empty).fetchedAt).toBeNull();
  });
});

const STREAMS = {
  fetchedAt: '2026-09-07T12:00:00Z',
  channels: [
    {
      channelId: 'UCaaa',
      spans: [1260, 120, 2700, 95],
      recent: [
        {
          videoId: 'vid1',
          title: '歌枠',
          actualStartTime: '2026-09-06T12:00:00Z',
          actualEndTime: '2026-09-06T14:00:00Z',
          durationSeconds: 7200,
          viewCount: 1234,
          chatMessageCount: 567,
        },
      ],
    },
    { channelId: 'UCbbb', spans: [], recent: [] },
  ],
};

describe('readStreamList', () => {
  test('reads the spans as flat pairs and the recent streams whole', () => {
    const list = readStreamList(STREAMS);

    expect(list.channels[0]!.spans).toEqual([1260, 120, 2700, 95]);
    expect(list.channels[0]!.recent[0]!.title).toEqual('歌枠');
    expect(list.channels[0]!.recent[0]!.actualStartTime.toISOString()).toEqual('2026-09-06T12:00:00.000Z');
    expect(list.channels[0]!.recent[0]!.viewCount).toEqual(1234);
  });

  test('reads a member with no streams at all', () => {
    const list = readStreamList(STREAMS);

    expect(list.channels[1]!.spans).toEqual([]);
    expect(list.channels[1]!.recent).toEqual([]);
  });

  // The counts a stream can be missing stay null rather than becoming zero,
  // the same way a channel's hidden count does.
  test('keeps a missing count null', () => {
    const recent = { ...STREAMS.channels[0]!.recent[0]!, viewCount: null, chatMessageCount: null };
    const list = readStreamList({ ...STREAMS, channels: [{ ...STREAMS.channels[0]!, recent: [recent] }] });

    expect(list.channels[0]!.recent[0]!.viewCount).toBeNull();
  });

  test('refuses a stream without an end', () => {
    const recent = { ...STREAMS.channels[0]!.recent[0]!, actualEndTime: null };

    expect(() => readStreamList({ ...STREAMS, channels: [{ ...STREAMS.channels[0]!, recent: [recent] }] })).toThrow(
      ShapeError,
    );
  });
});
