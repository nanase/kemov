import { forgetPublicData } from '@/admin/lib/preview';
import { publicChannels, publicGenetStreams, publicMilestones } from '@/admin/lib/public-data';
import { getChannels, getSubscriberMilestones, isNotPublished } from '@/lib/api';

vi.mock('@/lib/api', () => ({
  getChannels: vi.fn(),
  getMonths: vi.fn(),
  getSubscriberMilestones: vi.fn(),
  isNotPublished: vi.fn(),
}));

const channelsRead = vi.mocked(getChannels);
const milestonesRead = vi.mocked(getSubscriberMilestones);

beforeEach(() => {
  vi.clearAllMocks();
  forgetPublicData();
  channelsRead.mockResolvedValue({ data: { fetchedAt: null, channels: [] }, freshness: null } as never);
  milestonesRead.mockResolvedValue({ data: { publishedAt: null, milestones: [] }, freshness: null } as never);
});

describe('publicMilestones', () => {
  test('is read once while nothing is published', async () => {
    await publicMilestones();
    await publicMilestones();

    expect(milestonesRead).toHaveBeenCalledTimes(1);
  });

  // A publish from this site makes the kept read stale.
  test('is read again after forgetPublicData', async () => {
    await publicMilestones();
    forgetPublicData();
    await publicMilestones();

    expect(milestonesRead).toHaveBeenCalledTimes(2);
  });

  test('nothing published yet is no milestones, not a failure', async () => {
    milestonesRead.mockRejectedValue(new Error('404'));
    vi.mocked(isNotPublished).mockReturnValue(true);

    await expect(publicMilestones()).resolves.toEqual([]);
  });
});

describe('publicChannels', () => {
  test('a failed read is not kept', async () => {
    channelsRead.mockRejectedValueOnce(new Error('offline'));

    await expect(publicChannels()).rejects.toThrow('offline');
    await expect(publicChannels()).resolves.toEqual([]);
    expect(channelsRead).toHaveBeenCalledTimes(2);
  });
});

describe('publicGenetStreams', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const music = {
    published_at: '2026-10-01T00:00:00Z',
    channel_id: null,
    shape_version: 2,
    streams: [
      {
        video_id: 'gHVZb1UheTk',
        platform: 'youtube',
        url: null,
        video_type: 'live',
        title: '【楽曲解説】くるみ割り人形',
        short_title: null,
        published_at: '2023-03-09T03:00:00Z',
        categories: [],
        keywords: [],
        performances: [],
      },
    ],
    tunes: [],
    people: [],
  };

  test('the streams the page lists, read once', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(music)));

    await expect(publicGenetStreams()).resolves.toMatchObject([{ video_id: 'gHVZb1UheTk' }]);
    await publicGenetStreams();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('nothing published yet is no streams, not a failure', async () => {
    fetchMock.mockResolvedValue(new Response('not published yet', { status: 404 }));

    await expect(publicGenetStreams()).resolves.toEqual([]);
  });

  test('a body the page could not read is a failure, and is not kept', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ...music, streams: 'x' })));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(music)));

    await expect(publicGenetStreams()).rejects.toThrow();
    await expect(publicGenetStreams()).resolves.toHaveLength(1);
  });
});
