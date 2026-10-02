import { forgetPublicData } from '@/admin/lib/preview';
import { publicChannels, publicMilestones } from '@/admin/lib/public-data';
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
