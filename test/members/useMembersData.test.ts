import { getChannels, getMonths, getVideosTable } from '@/lib/api';
import { useMembersData } from '@/members/useMembersData';

/**
 * What the member page asks for, and what it does when an answer never comes.
 *
 * The three endpoints fail apart from one another, and the page has to say
 * which of them it is missing. Showing an empty board because one request
 * failed would say the member did nothing, which is a different claim from
 * "this could not be read".
 */

vi.mock('@/lib/api', () => ({
  getChannels: vi.fn(),
  getMonths: vi.fn(),
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

beforeEach(() => {
  vi.mocked(getChannels).mockReset();
  vi.mocked(getMonths).mockReset();
  vi.mocked(getVideosTable).mockReset();
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
});
