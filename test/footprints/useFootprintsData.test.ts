import { getChannels, getFootprintEvents, getVideosTable } from '@/lib/api';
import { useFootprintsData } from '@/footprints/useFootprintsData';

/**
 * What the footprints page asks for, and what it makes of the answers.
 *
 * The one worth holding here is the 404. Nothing has been published yet, so
 * `GET /api/footprints/events` answers 404 and will keep answering it until
 * somebody publishes for the first time. That is an answer - there is nothing
 * recorded - and the page draws the road from the streams alone (#140).
 * Treating it as a failure would put "記録を取得できませんでした" on the
 * site's front page for as long as the record is empty.
 */

vi.mock('@/lib/api', () => ({
  getChannels: vi.fn(),
  getFootprintEvents: vi.fn(),
  getVideosTable: vi.fn(),
}));

const answered = (value: unknown) => ({ data: value, fetchedAt: null });

const CHANNELS = answered({ channels: [{ channelId: 'UCa', name: 'カラカル' }], fetchedAt: null });
const TABLE = answered({
  fetchedAt: null,
  columns: {
    videoId: ['v1'],
    channelId: ['UCa'],
    title: ['ある配信'],
    type: ['streaming'],
    publishedAt: ['2026-01-01T00:00:00Z'],
    durationSeconds: [3600],
    viewCount: [1],
    likeCount: [1],
    commentCount: [1],
    chatMessageCount: [1],
    chatUniqueUserCount: [1],
    actualStartTime: ['2026-01-01T00:00:00Z'],
    actualEndTime: ['2026-01-01T01:00:00Z'],
  },
});
const EVENTS = answered({ publishedAt: null, events: [{ eventId: 1, title: 'あるできごと' }] });

const refused = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });

beforeEach(() => {
  vi.mocked(getChannels)
    .mockReset()
    .mockResolvedValue(CHANNELS as never);
  vi.mocked(getVideosTable)
    .mockReset()
    .mockResolvedValue(TABLE as never);
  vi.mocked(getFootprintEvents)
    .mockReset()
    .mockResolvedValue(EVENTS as never);
});

async function read() {
  const data = useFootprintsData();

  await data.start();
  data.stop();

  return data;
}

describe('useFootprintsData', () => {
  test('reads the channels, the archive and what has been published', async () => {
    const data = await read();

    expect(data.channels.value).toHaveLength(1);
    expect(data.rows.value).toHaveLength(1);
    expect(data.events.value).toHaveLength(1);
    expect(data.loading.value).toBe(false);
    expect(data.failure.value).toBeNull();
  });

  // This is the state the site is in right now, and will be until the first
  // publish. It has to look like an empty record, not like a broken page.
  test('reads a 404 from the events as "nothing has been published"', async () => {
    vi.mocked(getFootprintEvents).mockRejectedValue(refused(404));

    const data = await read();

    expect(data.failure.value).toBeNull();
    expect(data.events.value).toEqual([]);
    expect(data.rows.value).toHaveLength(1);
    expect(data.loading.value).toBe(false);
  });

  // A 404 is only an answer while the rest arrived. With no archive either,
  // the page has nothing to draw and should say so.
  test('reports a failure when the archive is missing as well', async () => {
    vi.mocked(getFootprintEvents).mockRejectedValue(refused(404));
    vi.mocked(getVideosTable).mockRejectedValue(refused(500));

    const data = await read();

    expect(data.failure.value).not.toBeNull();
  });

  test('reports any other refusal from the events', async () => {
    vi.mocked(getFootprintEvents).mockRejectedValue(refused(500));

    const data = await read();

    expect(data.failure.value).not.toBeNull();
  });

  test('keeps the archive when only the events refuse', async () => {
    vi.mocked(getFootprintEvents).mockRejectedValue(refused(503));

    const data = await read();

    expect(data.rows.value).toHaveLength(1);
  });

  // Without this a first failure leaves "読み込んでいます" on screen until a
  // retry succeeds, which is ten minutes away.
  test('stops loading when the channel list fails, not only when it arrives', async () => {
    vi.mocked(getChannels).mockRejectedValue(refused(500));

    const data = await read();

    expect(data.loading.value).toBe(false);
    expect(data.failure.value).not.toBeNull();
  });

  test('is still loading until both rhythms have been round once', async () => {
    const data = useFootprintsData();

    expect(data.loading.value).toBe(true);

    await data.start();
    data.stop();

    expect(data.loading.value).toBe(false);
  });
});
