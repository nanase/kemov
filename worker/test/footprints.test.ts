import { env } from 'cloudflare:test';

/**
 * The constraints 0006_add_footprints_event.sql adds. Nothing in
 * `worker/src/` writes these tables yet - the admin site's editing and
 * publish operations are #144's later tasks - so this is the schema on its
 * own, exercised with raw SQL rather than through application code.
 */

interface EventFields {
  date_precision: string;
  start_date: string;
  starts_at: string | null;
  end_date: string | null;
  kind: string;
  title: string;
  status: string;
}

const defaultEvent: EventFields = {
  date_precision: 'day',
  start_date: '2026-01-01',
  starts_at: null,
  end_date: null,
  kind: 'other',
  title: 'event',
  status: 'draft',
};

function insertEvent(overrides: Partial<EventFields> = {}): Promise<D1Response> {
  const fields = { ...defaultEvent, ...overrides };
  const columns = Object.keys(fields) as (keyof EventFields)[];

  return env.DB.prepare(
    `INSERT INTO footprints_event (${columns.join(', ')}) VALUES (${columns.map((_, i) => `?${i + 1}`).join(', ')})`,
  )
    .bind(...columns.map((column) => fields[column]))
    .run();
}

async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?1, ?1, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM footprints_event_source').run();
  await env.DB.prepare('DELETE FROM footprints_event_member').run();
  await env.DB.prepare('DELETE FROM footprints_event').run();
  await env.DB.prepare('DELETE FROM channel').run();
});

describe('footprints_event', () => {
  test('accepts a day-precision date', async () => {
    await expect(insertEvent({ date_precision: 'day', start_date: '2026-01-01' })).resolves.toMatchObject({
      success: true,
    });
  });

  test('accepts a month-precision date', async () => {
    await expect(insertEvent({ date_precision: 'month', start_date: '2026-01' })).resolves.toMatchObject({
      success: true,
    });
  });

  test('refuses a full date under month precision', async () => {
    await expect(insertEvent({ date_precision: 'month', start_date: '2026-01-01' })).rejects.toThrow();
  });

  test('refuses a bare month under day precision', async () => {
    await expect(insertEvent({ date_precision: 'day', start_date: '2026-01' })).rejects.toThrow();
  });

  // 2026-01-01T10:00:00Z is 2026-01-01T19:00 in Japan time, so its calendar
  // date agrees with start_date.
  test('accepts starts_at whose Japan-time date matches start_date', async () => {
    await expect(insertEvent({ start_date: '2026-01-01', starts_at: '2026-01-01T10:00:00Z' })).resolves.toMatchObject({
      success: true,
    });
  });

  // 2026-01-01T20:00:00Z is already 2026-01-02T05:00 in Japan time, a day
  // after start_date - the case a stream just before midnight JST would hit.
  test('refuses starts_at whose Japan-time date disagrees with start_date', async () => {
    await expect(insertEvent({ start_date: '2026-01-01', starts_at: '2026-01-01T20:00:00Z' })).rejects.toThrow();
  });

  test('refuses starts_at under month precision', async () => {
    await expect(
      insertEvent({ date_precision: 'month', start_date: '2026-01', starts_at: '2026-01-01T10:00:00Z' }),
    ).rejects.toThrow();
  });

  test('refuses an end_date before start_date', async () => {
    await expect(insertEvent({ start_date: '2026-01-10', end_date: '2026-01-05' })).rejects.toThrow();
  });

  test('accepts an end_date on or after start_date', async () => {
    await expect(insertEvent({ start_date: '2026-01-01', end_date: '2026-01-10' })).resolves.toMatchObject({
      success: true,
    });
  });

  test.each([
    'project',
    'announcement',
    'debut',
    '3d',
    'new_outfit',
    'real_event',
    'goods',
    'music',
    'collab',
    'media',
    'milestone',
    'graduation',
    'anniversary',
    'other',
  ])('accepts kind %s', async (kind) => {
    await expect(insertEvent({ kind })).resolves.toMatchObject({ success: true });
  });

  test('refuses a kind outside the 14 values', async () => {
    await expect(insertEvent({ kind: 'concert' })).rejects.toThrow();
  });

  test('refuses a status outside draft/review/published', async () => {
    await expect(insertEvent({ status: 'live' })).rejects.toThrow();
  });
});

describe('footprints_event_member', () => {
  test('references an existing channel', async () => {
    await insertChannel('UCaaa');
    const { meta } = await insertEvent();

    await expect(
      env.DB.prepare('INSERT INTO footprints_event_member (event_id, channel_id) VALUES (?1, ?2)')
        .bind(meta.last_row_id, 'UCaaa')
        .run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a channel that does not exist', async () => {
    const { meta } = await insertEvent();

    await expect(
      env.DB.prepare('INSERT INTO footprints_event_member (event_id, channel_id) VALUES (?1, ?2)')
        .bind(meta.last_row_id, 'UCnope')
        .run(),
    ).rejects.toThrow();
  });
});

describe('footprints_event_source', () => {
  test('accepts an https URL', async () => {
    const { meta } = await insertEvent();

    await expect(
      env.DB.prepare('INSERT INTO footprints_event_source (event_id, position, url) VALUES (?1, 1, ?2)')
        .bind(meta.last_row_id, 'https://example.com')
        .run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a URL that is not https', async () => {
    const { meta } = await insertEvent();

    await expect(
      env.DB.prepare('INSERT INTO footprints_event_source (event_id, position, url) VALUES (?1, 1, ?2)')
        .bind(meta.last_row_id, 'http://example.com')
        .run(),
    ).rejects.toThrow();
  });

  test('refuses a second source at the same position', async () => {
    const { meta } = await insertEvent();

    await env.DB.prepare('INSERT INTO footprints_event_source (event_id, position, url) VALUES (?1, 1, ?2)')
      .bind(meta.last_row_id, 'https://example.com/a')
      .run();

    await expect(
      env.DB.prepare('INSERT INTO footprints_event_source (event_id, position, url) VALUES (?1, 1, ?2)')
        .bind(meta.last_row_id, 'https://example.com/b')
        .run(),
    ).rejects.toThrow();
  });
});
