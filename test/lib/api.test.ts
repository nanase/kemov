import axios from '@/lib/axios';
import { ApiError, ApiShapeError, getAllVideos, getChannels, getLive, getRanking, MAX_VIDEO_PAGES } from '@/lib/api';

vi.mock('@/lib/axios', () => ({ default: { get: vi.fn() } }));

/**
 * The client, and the two failures the site being replaced could not tell
 * apart from an answer.
 *
 * A request that failed used to become an empty array, so "could not be read"
 * and "has none" looked the same. And a response of the wrong shape used to be
 * whatever `axios.get<T>()` had been told to call it.
 */

const get = vi.mocked(axios.get);

const CHANNELS = {
  fetchedAt: '2026-09-07T12:00:00Z',
  channels: [
    {
      channelId: 'UCaaa',
      name: 'カラカル',
      fullname: 'カラカル / Caracal',
      globalname: null,
      twitter: null,
      color: { key: '#000', sub: '#000', light: '#000', back: '#000' },
      activityStartDate: '2021-04-26',
      activityEndDate: null,
      customUrl: null,
      thumbnailUrl: null,
      fetchedAt: '2026-09-07T12:00:00Z',
      latest: { subscriberCount: 1000, viewCount: 2000, videoCount: 30 },
      perHour: {
        subscriberCount: { value: null, reason: 'history too short' },
        viewCount: { value: null, reason: 'history too short' },
        videoCount: { value: null, reason: 'history too short' },
      },
      perDay: {
        subscriberCount: { value: null, reason: 'history too short' },
        viewCount: { value: null, reason: 'history too short' },
        videoCount: { value: null, reason: 'history too short' },
      },
    },
  ],
};

const video = (videoId: string) => ({
  videoId,
  channelId: 'UCaaa',
  title: videoId,
  publishedAt: '2026-01-01T00:00:00Z',
  availability: 'public',
  liveBroadcastContent: 'none',
  type: 'streaming',
  durationSeconds: 60,
  viewCount: 1,
  likeCount: null,
  commentCount: null,
  chatMessageCount: null,
  chatUniqueUserCount: null,
  scheduledStartTime: null,
  actualStartTime: null,
  actualEndTime: null,
  fetchedAt: '2026-09-07T12:00:00Z',
});

const answer = (data: unknown, headers: Record<string, string> = {}) => ({ data, headers });

beforeEach(() => {
  get.mockReset();
});

describe('getChannels', () => {
  test('reads the answer and what it says about its own age', async () => {
    get.mockResolvedValue(answer(CHANNELS, { 'x-kemov-cache': 'stale', 'x-kemov-stale-seconds': '3600' }));

    const { data, freshness } = await getChannels();

    expect(data.channels[0].channelId).toEqual('UCaaa');
    expect(freshness).toEqual({ state: 'stale', staleSeconds: 3600 });
  });

  // The API sets these on every answer, including its errors, so their absence
  // means something else answered - a proxy, a captive portal, an error page.
  // Saying 'unknown' is better than reporting a confident 'fresh'.
  test('says the age is unknown when nothing said what it was', async () => {
    get.mockResolvedValue(answer(CHANNELS));

    expect((await getChannels()).freshness).toEqual({ state: 'unknown', staleSeconds: 0 });
  });

  test('carries the status of a failure rather than an empty result', async () => {
    get.mockRejectedValue(Object.assign(new Error('Request failed'), { response: { status: 503 } }));

    await expect(getChannels()).rejects.toThrow(ApiError);
    await expect(getChannels()).rejects.toMatchObject({ status: 503, path: '/channels' });
  });

  test('a body of the wrong shape is a failure and not an answer', async () => {
    get.mockResolvedValue(answer({ channels: [{ channelId: 42 }] }));

    await expect(getChannels()).rejects.toThrow(ApiShapeError);
  });

  // The one that would otherwise be hardest to notice: a request that reached
  // something else entirely and came back with 200.
  test('an error page is refused rather than read as a channel list', async () => {
    get.mockResolvedValue(answer('<html>Service Unavailable</html>'));

    await expect(getChannels()).rejects.toThrow(ApiShapeError);
  });
});

describe('getLive', () => {
  test('reads the streams and the count of what was left out', async () => {
    get.mockResolvedValue(answer({ streams: [], excludedFreeChats: 2 }));

    expect((await getLive()).data.excludedFreeChats).toEqual(2);
  });
});

describe('getRanking', () => {
  const ranked = (kind: string | null) => ({
    metric: 'chatMessageCountPerSecond',
    kind,
    videos: [{ ...video('a'), metricValue: 2.5 }],
  });

  test('asks the API to narrow the kind rather than narrowing what came back', async () => {
    get.mockResolvedValue(answer(ranked('streaming')));

    const result = await getRanking('chatMessageCountPerSecond', 'streaming', 30);

    expect(get.mock.calls[0][0]).toContain('metric=chatMessageCountPerSecond');
    expect(get.mock.calls[0][0]).toContain('type=streaming');
    expect(get.mock.calls[0][0]).toContain('limit=30');
    expect(result.data.videos[0].metricValue).toEqual(2.5);
  });

  // Absent means every kind, which is not the same as asking for one.
  test('sends no type when every kind is wanted', async () => {
    get.mockResolvedValue(answer(ranked(null)));

    await getRanking('chatMessageCountPerSecond', null, 10);

    expect(get.mock.calls[0][0]).not.toContain('type=');
  });

  test('refuses a ranking of something other than what was asked for', async () => {
    get.mockResolvedValue(answer(ranked('shorts')));

    await expect(getRanking('chatMessageCountPerSecond', 'streaming', 30)).rejects.toThrow(ApiShapeError);
  });
});

describe('getAllVideos', () => {
  test('follows the cursor to the end of the archive', async () => {
    get
      .mockResolvedValueOnce(answer({ channelId: 'UCaaa', videos: [video('a')], nextCursor: 'next' }))
      .mockResolvedValueOnce(answer({ channelId: 'UCaaa', videos: [video('b')], nextCursor: null }));

    const archive = await getAllVideos('UCaaa');

    expect(archive.videos.map((v) => v.videoId)).toEqual(['a', 'b']);
    expect(archive.complete).toBe(true);
    expect(archive.error).toBeUndefined();
  });

  test('hands the cursor back as it was given', async () => {
    get
      .mockResolvedValueOnce(answer({ channelId: 'UCaaa', videos: [], nextCursor: 'a+b/c=' }))
      .mockResolvedValueOnce(answer({ channelId: 'UCaaa', videos: [], nextCursor: null }));

    await getAllVideos('UCaaa');

    expect(get.mock.calls[1][0]).toContain(`cursor=${encodeURIComponent('a+b/c=')}`);
  });

  // The failure the detail page has to be able to show. Its totals are sums
  // over the whole archive, so a page lost halfway would make every one of
  // them smaller - and a smaller number reads as a fact, not as a failure.
  test('keeps what arrived and says the rest did not', async () => {
    get
      .mockResolvedValueOnce(answer({ channelId: 'UCaaa', videos: [video('a')], nextCursor: 'next' }))
      .mockRejectedValueOnce(new Error('the connection dropped'));

    const archive = await getAllVideos('UCaaa');

    expect(archive.videos.map((v) => v.videoId)).toEqual(['a']);
    expect(archive.complete).toBe(false);
    expect(archive.error).toBeInstanceOf(ApiError);
  });

  test('the first page failing leaves nothing, and still says why', async () => {
    get.mockRejectedValue(new Error('the connection dropped'));

    const archive = await getAllVideos('UCaaa');

    expect(archive.videos).toEqual([]);
    expect(archive.complete).toBe(false);
    expect(archive.error?.message).toContain('could not be read');
  });

  // A cursor that never comes back null would page forever. The largest
  // channel is seven pages, so the ceiling is far above anything real.
  test('stops rather than paging forever', async () => {
    get.mockResolvedValue(answer({ channelId: 'UCaaa', videos: [video('a')], nextCursor: 'always' }));

    const archive = await getAllVideos('UCaaa');

    expect(get).toHaveBeenCalledTimes(MAX_VIDEO_PAGES);
    expect(archive.complete).toBe(false);
    expect(archive.error?.message).toContain('without reaching the end');
  });
});
