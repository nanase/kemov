import { ShapeError } from '@/lib/read';
import { readChannelList, readLiveList, readVideoPage, readVideoRanking, readVideoTable } from '@/type/api';

/**
 * Reading the API's answers.
 *
 * The bodies below are the ones the worker builds - worker/src/api - written
 * out here rather than imported, because a shared type would describe what the
 * worker meant to send. What these tests are for is what arrives.
 */

const CHANNEL = {
  channelId: 'UCaaa',
  name: 'カラカル',
  fullname: 'カラカル / Caracal',
  globalname: 'Caracal',
  twitter: 'Caracal_KEMOV',
  color: { key: '#F38E0A', sub: '#F8C112', light: '#FFEBA4', back: '#FFEBA4' },
  activityStartDate: '2021-04-26',
  activityEndDate: null,
  customUrl: '@caracal',
  thumbnailUrl: 'https://yt3.example/photo.jpg',
  fetchedAt: '2026-09-07T12:00:00Z',
  latest: { subscriberCount: 1000, viewCount: 50000, videoCount: 100 },
  perHour: {
    subscriberCount: { value: 5, over: { from: '2026-09-07T11:00:00Z', to: '2026-09-07T12:00:00Z', seconds: 3600 } },
    viewCount: { value: null, reason: 'history too short' },
    videoCount: { value: null, reason: 'gap too wide' },
  },
  perDay: {
    subscriberCount: { value: null, reason: 'nothing collected' },
    viewCount: { value: null, reason: 'count not collected' },
    videoCount: { value: 0, over: { from: '2026-09-06T12:00:00Z', to: '2026-09-07T12:00:00Z', seconds: 86400 } },
  },
  per30Days: {
    subscriberCount: {
      value: 120,
      over: { from: '2026-08-08T12:00:00Z', to: '2026-09-07T12:00:00Z', seconds: 2592000 },
    },
    viewCount: { value: null, reason: 'history too short' },
    videoCount: { value: 8, over: { from: '2026-08-08T12:00:00Z', to: '2026-09-07T12:00:00Z', seconds: 2592000 } },
  },
};

const list = (channel: Record<string, unknown> = CHANNEL) => ({
  fetchedAt: '2026-09-07T12:00:00Z',
  channels: [channel],
});

describe('readChannelList', () => {
  test('reads a channel whole', () => {
    const { channels, fetchedAt } = readChannelList(list());

    expect(fetchedAt?.toISOString()).toEqual('2026-09-07T12:00:00.000Z');
    expect(channels[0].channelId).toEqual('UCaaa');
    expect(channels[0].name).toEqual('カラカル');
    expect(channels[0].color.key).toEqual('#F38E0A');
    expect(channels[0].customUrl).toEqual('@caracal');
    expect(channels[0].latest.subscriberCount).toEqual(1000);
  });

  test('keeps each missing reason rather than flattening them to one absence', () => {
    const { channels } = readChannelList(list());

    expect(channels[0].perHour.viewCount).toEqual({ value: null, reason: 'history too short' });
    expect(channels[0].perHour.videoCount).toEqual({ value: null, reason: 'gap too wide' });
    expect(channels[0].perDay.subscriberCount).toEqual({ value: null, reason: 'nothing collected' });
    expect(channels[0].perDay.viewCount).toEqual({ value: null, reason: 'count not collected' });
  });

  // Zero is a real change and null is the absence of one. Reading a change of
  // zero as missing would draw a quiet day as a fault.
  test('a change of zero is a change', () => {
    const { channels } = readChannelList(list());

    expect(channels[0].perDay.videoCount).toMatchObject({ value: 0 });
  });

  // The counts a channel hides. YouTube reports zero for those, which cannot
  // be told apart from a channel that truly has none, so the schema stores
  // null and this keeps it null.
  test('a hidden count stays null and does not become zero', () => {
    const { channels } = readChannelList(list({ ...CHANNEL, latest: { ...CHANNEL.latest, subscriberCount: null } }));

    expect(channels[0].latest.subscriberCount).toBeNull();
  });

  // The page draws the icon from the image relay (#144), by channel id - not
  // from the address the collector stored, which is YouTube's and is what the
  // relay itself reads. A URL that named YouTube here would put the browser
  // back in front of its 429.
  test('an icon the collector has is read as the relay address for that channel, not the stored one', () => {
    const { channels } = readChannelList(list());

    expect(channels[0].thumbnailUrl).toEqual('/api/image/channel/UCaaa?size=88');
    expect(channels[0].thumbnailUrl).not.toContain('yt3.example');
  });

  test('the channel id is escaped into the relay address', () => {
    const { channels } = readChannelList(list({ ...CHANNEL, channelId: 'UC a/b' }));

    expect(channels[0].thumbnailUrl).toEqual('/api/image/channel/UC%20a%2Fb?size=88');
  });

  test('a channel the collector has never read has no avatar and no reading', () => {
    const { channels } = readChannelList(
      list({ ...CHANNEL, customUrl: null, thumbnailUrl: null, globalname: null, fetchedAt: null }),
    );

    expect(channels[0].customUrl).toBeNull();
    // No icon is no address, rather than an address the relay would answer 404 for.
    expect(channels[0].thumbnailUrl).toBeNull();
    expect(channels[0].fetchedAt).toBeNull();
  });

  test('refuses a missing reason it does not know', () => {
    const perHour = { ...CHANNEL.perHour, viewCount: { value: null, reason: 'no idea' } };

    expect(() => readChannelList(list({ ...CHANNEL, perHour }))).toThrow(ShapeError);
  });

  test('names the field that was wrong', () => {
    expect(() => readChannelList(list({ ...CHANNEL, name: 42 }))).toThrow('body.channels[0].name');
    expect(() => readChannelList(list({ ...CHANNEL, color: { key: '#000' } }))).toThrow('body.channels[0].color.sub');
  });

  // The failure this whole layer is for. Anything can answer a request - a
  // proxy, a captive portal, an error page - and `axios.get<T>()` would hand
  // whatever came back to the components as a channel list.
  test('refuses a body that is not a channel list at all', () => {
    expect(() => readChannelList('<html>Service Unavailable</html>')).toThrow(ShapeError);
    expect(() => readChannelList({ channels: {} })).toThrow(ShapeError);
    expect(() => readChannelList(null)).toThrow(ShapeError);
  });
});

const VIDEO = {
  videoId: 'v1',
  channelId: 'UCaaa',
  title: 'ある配信',
  publishedAt: '2026-01-01T00:00:00Z',
  availability: 'public',
  liveBroadcastContent: 'none',
  type: 'streaming',
  durationSeconds: 3723,
  viewCount: 1234,
  likeCount: 56,
  commentCount: 7,
  chatMessageCount: 890,
  chatUniqueUserCount: 12,
  scheduledStartTime: '2026-01-01T00:00:00Z',
  actualStartTime: '2026-01-01T00:01:00Z',
  actualEndTime: '2026-01-01T01:02:03Z',
  fetchedAt: '2026-09-07T12:00:00Z',
};

describe('readVideoPage', () => {
  test('reads a page and its cursor', () => {
    const page = readVideoPage({ channelId: 'UCaaa', videos: [VIDEO], nextCursor: 'abc' });

    expect(page.videos[0].videoId).toEqual('v1');
    expect(page.videos[0].durationSeconds).toEqual(3723);
    expect(page.videos[0].actualEndTime?.toISOString()).toEqual('2026-01-01T01:02:03.000Z');
    expect(page.nextCursor).toEqual('abc');
  });

  test('the last page says so', () => {
    expect(readVideoPage({ channelId: 'UCaaa', videos: [], nextCursor: null }).nextCursor).toBeNull();
  });

  // Every row #67 migrated arrives this way until video-update reaches it, so
  // this is the common case rather than the edge one.
  test('a video whose type and length have not been collected reads as null', () => {
    const page = readVideoPage({
      channelId: 'UCaaa',
      videos: [{ ...VIDEO, type: null, durationSeconds: null, viewCount: null }],
      nextCursor: null,
    });

    expect(page.videos[0].type).toBeNull();
    expect(page.videos[0].durationSeconds).toBeNull();
    expect(page.videos[0].viewCount).toBeNull();
  });

  // A video that was never a stream.
  test('a video with no streaming times reads them as null', () => {
    const page = readVideoPage({
      channelId: 'UCaaa',
      videos: [{ ...VIDEO, scheduledStartTime: null, actualStartTime: null, actualEndTime: null }],
      nextCursor: null,
    });

    expect(page.videos[0].scheduledStartTime).toBeNull();
  });

  test('refuses an availability or a type it does not know', () => {
    const page = (video: Record<string, unknown>) => () =>
      readVideoPage({ channelId: 'UCaaa', videos: [video], nextCursor: null });

    expect(page({ ...VIDEO, availability: 'unavalable' })).toThrow(ShapeError);
    expect(page({ ...VIDEO, type: 'podcast' })).toThrow(ShapeError);
  });
});

describe('readVideoRanking', () => {
  const body = (over = {}) => ({
    metric: 'viewCountPerSecond',
    kind: 'streaming',
    videos: [{ ...VIDEO, metricValue: 0.34 }],
    ...over,
  });

  test('reads the ranking and the value each row was ordered by', () => {
    const ranking = readVideoRanking('viewCountPerSecond', 'streaming')(body());

    expect(ranking.metric).toEqual('viewCountPerSecond');
    expect(ranking.kind).toEqual('streaming');
    expect(ranking.videos[0].metricValue).toEqual(0.34);
    expect(ranking.videos[0].title).toEqual('ある配信');
  });

  test('a ranking of every kind says so with null', () => {
    expect(readVideoRanking('viewCount', null)(body({ metric: 'viewCount', kind: null })).kind).toBeNull();
  });

  // Every ranking is a different URL and the API caches by URL. An answer
  // carrying another metric would look like a correct ranking of the wrong
  // thing, which nobody could spot from the numbers.
  test('refuses an answer to a different question', () => {
    expect(() => readVideoRanking('likeCount', 'streaming')(body())).toThrow('body.metric');
    expect(() => readVideoRanking('viewCountPerSecond', 'shorts')(body())).toThrow('body.kind');
    expect(() => readVideoRanking('viewCountPerSecond', null)(body())).toThrow('body.kind');
  });

  test('refuses a row with no value to have been ordered by', () => {
    expect(() => readVideoRanking('viewCountPerSecond', 'streaming')(body({ videos: [VIDEO] }))).toThrow(ShapeError);
  });

  // The rates leave out any video whose duration is not collected yet, so a
  // short list is the ordinary case rather than a failure.
  test('an empty ranking is an answer', () => {
    expect(readVideoRanking('viewCountPerSecond', 'shorts')(body({ kind: 'shorts', videos: [] })).videos).toEqual([]);
  });
});

describe('readVideoTable', () => {
  const TABLE = {
    fetchedAt: '2026-09-07T12:00:00Z',
    columns: {
      videoId: ['v1'],
      channelId: ['UCaaa'],
      title: ['ある配信'],
      type: ['streaming'],
      publishedAt: ['2026-01-01T00:00:00Z'],
      durationSeconds: [3723],
      viewCount: [1234],
      likeCount: [56],
      commentCount: [7],
      chatMessageCount: [890],
      chatUniqueUserCount: [12],
      actualStartTime: ['2026-01-01T00:01:00Z'],
      actualEndTime: ['2026-01-01T01:02:03Z'],
    },
  };

  test('reads a row, denormalized from its column', () => {
    const table = readVideoTable(TABLE);

    expect(table.fetchedAt?.toISOString()).toEqual('2026-09-07T12:00:00.000Z');
    expect(table.columns.videoId).toEqual(['v1']);
    expect(table.columns.title).toEqual(['ある配信']);
    expect(table.columns.viewCount).toEqual([1234]);
    expect(table.columns.actualEndTime).toEqual(['2026-01-01T01:02:03Z']);
  });

  test('an empty table has no fetchedAt', () => {
    const table = readVideoTable({
      fetchedAt: null,
      columns: Object.fromEntries(Object.keys(TABLE.columns).map((name) => [name, []])),
    });

    expect(table.fetchedAt).toBeNull();
    expect(table.columns.videoId).toEqual([]);
  });

  // A row #67's migration wrote and video-update has not reached yet: its
  // type and every count are null, not zero.
  test('a row not yet classified reads its columns as null', () => {
    const table = readVideoTable({
      ...TABLE,
      columns: { ...TABLE.columns, type: [null], durationSeconds: [null], viewCount: [null] },
    });

    expect(table.columns.type).toEqual([null]);
    expect(table.columns.durationSeconds).toEqual([null]);
    expect(table.columns.viewCount).toEqual([null]);
  });

  // A column short by one would otherwise misalign every field after it once
  // @/lib/ranking.ts zips the columns back into one row per video, silently:
  // JavaScript reads past the end of a short array as undefined, not as a
  // thrown error.
  test('refuses a column shorter than videoId', () => {
    expect(() => readVideoTable({ ...TABLE, columns: { ...TABLE.columns, title: [] } })).toThrow(ShapeError);
  });

  // These columns are tallies and the member page adds them up. A negative or
  // fractional one is not a small error to carry into a total - it is a body
  // that means something other than what would be read from it.
  test('refuses a count below zero or with a fraction', () => {
    expect(() => readVideoTable({ ...TABLE, columns: { ...TABLE.columns, viewCount: [-1] } })).toThrow(ShapeError);
    expect(() => readVideoTable({ ...TABLE, columns: { ...TABLE.columns, durationSeconds: [1.5] } })).toThrow(
      ShapeError,
    );
  });

  test('refuses a type it does not know', () => {
    expect(() => readVideoTable({ ...TABLE, columns: { ...TABLE.columns, type: ['podcast'] } })).toThrow(ShapeError);
  });

  test('refuses a body that is not a video table at all', () => {
    expect(() => readVideoTable('<html>Service Unavailable</html>')).toThrow(ShapeError);
    expect(() => readVideoTable({ columns: {} })).toThrow(ShapeError);
    expect(() => readVideoTable(null)).toThrow(ShapeError);
  });
});

describe('readLiveList', () => {
  const STREAM = {
    videoId: 'v1',
    channelId: 'UCaaa',
    title: 'まもなく',
    state: 'upcoming',
    scheduledStartTime: '2026-09-07T13:00:00Z',
    actualStartTime: null,
    fetchedAt: '2026-09-07T12:00:00Z',
  };

  test('reads the streams and the free chats it left out', () => {
    const live = readLiveList({ streams: [STREAM], excludedFreeChats: 3 });

    expect(live.streams[0].state).toEqual('upcoming');
    expect(live.streams[0].actualStartTime).toBeNull();
    expect(live.excludedFreeChats).toEqual(3);
  });

  // 'none' is what the endpoint filters out, so its arrival would mean the
  // filter had stopped working.
  test("refuses a state of 'none'", () => {
    expect(() => readLiveList({ streams: [{ ...STREAM, state: 'none' }], excludedFreeChats: 0 })).toThrow(ShapeError);
  });

  // Zero is the answer that says "nothing was hidden from you". Missing it
  // would make a channel with only a free chat look like a channel with
  // nothing scheduled, which is the difference this endpoint exists for.
  test('requires the excluded count rather than assuming zero', () => {
    expect(() => readLiveList({ streams: [] })).toThrow(ShapeError);
  });
});
