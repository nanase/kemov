import { ShapeError } from '@/lib/read';
import { readChannelList, readLiveList, readVideoPage } from '@/type/api';

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

  test('a channel the collector has never read has no avatar and no reading', () => {
    const { channels } = readChannelList(
      list({ ...CHANNEL, customUrl: null, thumbnailUrl: null, globalname: null, fetchedAt: null }),
    );

    expect(channels[0].customUrl).toBeNull();
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
