import { env } from 'cloudflare:test';

import { clearEverything } from './reset-db';

/**
 * migrations/0016_move_genet_stream_review_to_draft.sql runs on empty tables
 * when a test file starts; this runs it again on streams of every status, the
 * way production has them.
 */

beforeEach(clearEverything);

const MIGRATION = env.TEST_MIGRATIONS.find(({ name }) => name === '0016_move_genet_stream_review_to_draft.sql')!;

async function insertStream(videoId: string, status: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO genet_stream (video_id, platform, video_type, title, published_at, status)
     VALUES (?1, 'youtube', 'live', ?1, '2026-01-01T00:00:00Z', ?2)`,
  )
    .bind(videoId, status)
    .run();
}

describe('migration 0016', () => {
  test('moves the streams put off with あとで to draft, and leaves the others as they were', async () => {
    await insertStream('aaaaaaaaaaa', 'draft');
    await insertStream('bbbbbbbbbbb', 'review');
    await insertStream('ccccccccccc', 'published');

    await env.DB.batch(MIGRATION.queries.map((query) => env.DB.prepare(query)));

    const { results } = await env.DB.prepare('SELECT video_id, status FROM genet_stream ORDER BY video_id').all();

    expect(results).toEqual([
      { video_id: 'aaaaaaaaaaa', status: 'draft' },
      { video_id: 'bbbbbbbbbbb', status: 'draft' },
      { video_id: 'ccccccccccc', status: 'published' },
    ]);
  });
});
