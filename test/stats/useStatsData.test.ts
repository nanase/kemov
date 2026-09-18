import dayjs from '@nanase/alnilam/dayjs';

import { ApiError, getChannels, getLive, getMonths, getStreams } from '@/lib/api';
import { useStatsData } from '@/stats/useStatsData';
import type { ChannelList, LiveList, MonthsSeries, StreamList } from '@/type/api';

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  getChannels: vi.fn(),
  getLive: vi.fn(),
  getMonths: vi.fn(),
  getStreams: vi.fn(),
}));

/**
 * What the page keeps when one endpoint refuses.
 *
 * The four are asked two at a time, and a page that threw away the answers it
 * did get would go blank whenever any one of them was down - which reads as
 * "there is nothing" rather than "this could not be read".
 */

const FETCHED_AT = '2026-09-19T00:00:00Z';
const freshness = { state: 'fresh', staleSeconds: 0 } as const;
const answer = <T>(data: T) => Promise.resolve({ data, freshness });
const refusal = (path: string) => Promise.reject(new ApiError(path, 503, 'unavailable'));

const CHANNELS = {
  fetchedAt: dayjs(FETCHED_AT),
  channels: [{ channelId: 'UCaaa', name: 'カラカル' }],
} as unknown as ChannelList;

const LIVE = { streams: [{ videoId: 'v1' }], freeChatsHidden: 0 } as unknown as LiveList;
const MONTHS = {
  fetchedAt: dayjs(FETCHED_AT),
  months: ['2026-09'],
  channels: [],
  total: {},
} as unknown as MonthsSeries;
const STREAMS = {
  fetchedAt: dayjs(FETCHED_AT),
  channels: [{ channelId: 'UCaaa', spans: [] }],
} as unknown as StreamList;

beforeEach(() => {
  vi.mocked(getChannels).mockReturnValue(answer(CHANNELS));
  vi.mocked(getLive).mockReturnValue(answer(LIVE));
  vi.mocked(getMonths).mockReturnValue(answer(MONTHS));
  vi.mocked(getStreams).mockReturnValue(answer(STREAMS));
});

/** Runs the first round of both rhythms and leaves nothing waiting. */
async function firstRound() {
  const data = useStatsData();

  await data.start();
  data.stop();

  return data;
}

test('keeps the counts when what is on air could not be read', async () => {
  vi.mocked(getLive).mockReturnValue(refusal('/live'));

  const data = await firstRound();

  expect(data.channels.value).toHaveLength(1);
  expect(data.countsFetchedAt.value).toBe(dayjs(FETCHED_AT).valueOf());
  expect(data.live.value).toEqual([]);
  expect(data.failure.value).not.toBeNull();
  // The record is drawn from the archive, which was never asked to fail here.
  expect(data.months.value).not.toBeNull();
  expect(data.streams.value).not.toBeNull();
  expect(data.loading.value).toBe(false);
});

test('keeps the stream spans when the month series could not be read', async () => {
  vi.mocked(getMonths).mockReturnValue(refusal('/months'));

  const data = await firstRound();

  expect(data.streams.value).not.toBeNull();
  expect(data.months.value).toBeNull();
  expect(data.failure.value).not.toBeNull();
});

test('reports no failure when every endpoint answered', async () => {
  const data = await firstRound();

  expect(data.failure.value).toBeNull();
  expect(data.live.value).toHaveLength(1);
});
