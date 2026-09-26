import { ApiError, getChannels, getMonths, getSubscriberMilestones, getVideosTable } from '@/lib/api';
import { useMembersData } from '@/members/useMembersData';

/**
 * What the member page asks for, and what it does when an answer never comes.
 *
 * The endpoints fail apart from one another, and the page has to say
 * which of them it is missing. Showing an empty board because one request
 * failed would say the member did nothing, which is a different claim from
 * "this could not be read".
 */

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getChannels: vi.fn(),
  getMonths: vi.fn(),
  getSubscriberMilestones: vi.fn(),
  getVideosTable: vi.fn(),
}));

const asked = (value: unknown) => ({ data: value, fetchedAt: null });

const CHANNELS = asked({ channels: [{ channelId: 'UCa', name: 'カラカル' }], fetchedAt: null });
const TABLE = asked({
  fetchedAt: null,
  columns: {
    videoId: [],
    channelId: [],
    title: [],
    type: [],
    publishedAt: [],
    durationSeconds: [],
    viewCount: [],
    likeCount: [],
    commentCount: [],
    chatMessageCount: [],
    chatUniqueUserCount: [],
    actualStartTime: [],
    actualEndTime: [],
  },
});
const MONTHS = asked({ months: [], channels: [], totals: null });
const MILESTONES = asked({
  publishedAt: null,
  milestones: [
    { milestoneId: 2, channelId: 'UCa', reachedDate: '2024-01-30', subscriberCount: 20000 },
    { milestoneId: 1, channelId: 'UCa', reachedDate: '2021-10-10', subscriberCount: 10000 },
  ],
});

beforeEach(() => {
  vi.mocked(getChannels).mockReset();
  vi.mocked(getMonths).mockReset();
  vi.mocked(getVideosTable).mockReset();
  vi.mocked(getSubscriberMilestones).mockReset();
  vi.mocked(getSubscriberMilestones).mockResolvedValue(MILESTONES as never);
});

describe('useMembersData', () => {
  test('stops loading once every endpoint has answered', async () => {
    vi.mocked(getChannels).mockResolvedValue(CHANNELS as never);
    vi.mocked(getVideosTable).mockResolvedValue(TABLE as never);
    vi.mocked(getMonths).mockResolvedValue(MONTHS as never);

    const data = useMembersData();

    await data.start();
    data.stop();

    expect(data.loading.value).toBe(false);
    expect(data.failure.value).toBeNull();
    expect(data.missing.value).toEqual({ table: false, months: false });
  });

  // Without this the page says "読み込んでいます" until a retry succeeds, which
  // is ten minutes of a screen that is not loading anything.
  test('stops loading when the channel list fails, not only when it arrives', async () => {
    vi.mocked(getChannels).mockRejectedValue(new Error('down'));
    vi.mocked(getVideosTable).mockResolvedValue(TABLE as never);
    vi.mocked(getMonths).mockResolvedValue(MONTHS as never);

    const data = useMembersData();

    await data.start();
    data.stop();

    expect(data.loading.value).toBe(false);
    expect(data.failure.value).not.toBeNull();
  });

  test('names the endpoint that never answered', async () => {
    vi.mocked(getChannels).mockResolvedValue(CHANNELS as never);
    vi.mocked(getVideosTable).mockRejectedValue(new Error('down'));
    vi.mocked(getMonths).mockResolvedValue(MONTHS as never);

    const data = useMembersData();

    await data.start();
    data.stop();

    expect(data.missing.value).toEqual({ table: true, months: false });
    expect(data.channels.value).toHaveLength(1);
  });

  test('keeps the other endpoint when only the monthly series fails', async () => {
    vi.mocked(getChannels).mockResolvedValue(CHANNELS as never);
    vi.mocked(getVideosTable).mockResolvedValue(TABLE as never);
    vi.mocked(getMonths).mockRejectedValue(new Error('down'));

    const data = useMembersData();

    await data.start();
    data.stop();

    expect(data.missing.value).toEqual({ table: false, months: true });
  });

  test('groups the milestones by member, oldest first', async () => {
    vi.mocked(getChannels).mockResolvedValue(CHANNELS as never);
    vi.mocked(getVideosTable).mockResolvedValue(TABLE as never);
    vi.mocked(getMonths).mockResolvedValue(MONTHS as never);

    const data = useMembersData();

    await data.start();
    data.stop();

    expect(data.milestoneStatus.value).toBe('ready');
    expect(data.milestones.value.get('UCa')?.map((milestone) => milestone.subscriberCount)).toEqual([10000, 20000]);
  });

  // Nothing published yet is "nobody has one", not a failure (#225).
  test('reads "not published yet" as an empty answer', async () => {
    vi.mocked(getChannels).mockResolvedValue(CHANNELS as never);
    vi.mocked(getVideosTable).mockResolvedValue(TABLE as never);
    vi.mocked(getMonths).mockResolvedValue(MONTHS as never);
    vi.mocked(getSubscriberMilestones).mockRejectedValue(
      new ApiError('/subscribers/milestones', 404, 'not found', 'not published yet'),
    );

    const data = useMembersData();

    await data.start();
    data.stop();

    expect(data.milestones.value.size).toBe(0);
    expect(data.milestoneStatus.value).toBe('ready');
    expect(data.failure.value).toBeNull();
  });

  test('says "failed" for any other failure, and keeps the rest of the page', async () => {
    vi.mocked(getChannels).mockResolvedValue(CHANNELS as never);
    vi.mocked(getVideosTable).mockResolvedValue(TABLE as never);
    vi.mocked(getMonths).mockResolvedValue(MONTHS as never);
    vi.mocked(getSubscriberMilestones).mockRejectedValue(new ApiError('/subscribers/milestones', 503, 'unavailable'));

    const data = useMembersData();

    await data.start();
    data.stop();

    expect(data.milestoneStatus.value).toBe('failed');
    expect(data.failure.value).not.toBeNull();
    expect(data.missing.value).toEqual({ table: false, months: false });
  });

  test('keeps the last milestones when a later round fails', async () => {
    vi.mocked(getChannels).mockResolvedValue(CHANNELS as never);
    vi.mocked(getVideosTable).mockResolvedValue(TABLE as never);
    vi.mocked(getMonths).mockResolvedValue(MONTHS as never);

    const data = useMembersData();

    await data.start();
    data.stop();
    vi.mocked(getSubscriberMilestones).mockRejectedValue(new ApiError('/subscribers/milestones', 503, 'unavailable'));
    await data.start();
    data.stop();

    expect(data.milestones.value.get('UCa')).toHaveLength(2);
    expect(data.milestoneStatus.value).toBe('ready');
  });
});
