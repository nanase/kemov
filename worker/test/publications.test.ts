import { env } from 'cloudflare:test';

import { listPublications } from '../src/admin/publications';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function insertPublication(target: string, objectKey: string, publishedAt: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO revision (entity, entity_key, action, body) VALUES ('footprints_event', '1', 'publish', '{}')`,
  ).run();

  const revision = await env.DB.prepare('SELECT revision_id FROM revision ORDER BY revision_id DESC LIMIT 1').first<{
    revision_id: number;
  }>();

  await env.DB.prepare(
    `INSERT INTO publication (target, last_revision_id, object_key, byte_length, published_at)
     VALUES (?1, ?2, ?3, 123, ?4)`,
  )
    .bind(target, revision!.revision_id, objectKey, publishedAt)
    .run();
}

describe('listPublications', () => {
  test('lists newest first', async () => {
    await insertPublication('footprints', 'footprints.json', '2026-09-10T00:00:00Z');
    await insertPublication('genet_music', 'genet-music.json', '2026-09-11T00:00:00Z');

    const body = (await (await listPublications(env)).json()) as { publications: { target: string }[] };

    expect(body.publications.map((p) => p.target)).toEqual(['genet_music', 'footprints']);
  });

  test('carries the byte length and object key', async () => {
    await insertPublication('footprints', 'footprints.json', '2026-09-10T00:00:00Z');

    const body = (await (await listPublications(env)).json()) as {
      publications: { objectKey: string; byteLength: number }[];
    };

    expect(body.publications[0]).toEqual(expect.objectContaining({ objectKey: 'footprints.json', byteLength: 123 }));
  });

  test('answers an empty list when nothing has published', async () => {
    const body = (await (await listPublications(env)).json()) as { publications: unknown[] };

    expect(body.publications).toEqual([]);
  });
});
