import { env } from 'cloudflare:test';

import { getRevision, listRevisions, readRevisionId } from '../src/admin/revisions';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function insertRevision(
  entity: string,
  entityKey: string,
  action: string,
  body: Record<string, unknown> | null,
  createdAt: string,
  createdVia = 'admin',
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO revision (entity, entity_key, action, body, created_via, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  )
    .bind(entity, entityKey, action, body === null ? null : JSON.stringify(body), createdVia, createdAt)
    .run();
}

describe('listRevisions', () => {
  test('lists newest first, without body', async () => {
    await insertRevision('channel', 'UCaaa', 'save', { name: 'a' }, '2026-09-10T00:00:00Z');
    await insertRevision('channel', 'UCbbb', 'save', { name: 'b' }, '2026-09-11T00:00:00Z');

    const body = (await (await listRevisions(env, null, null, null, null, null)).json()) as {
      revisions: { entityKey: string; body?: unknown }[];
    };

    expect(body.revisions.map((r) => r.entityKey)).toEqual(['UCbbb', 'UCaaa']);
    expect(body.revisions[0]!.body).toBeUndefined();
  });

  test('narrows by entity', async () => {
    await insertRevision('channel', 'UCaaa', 'save', {}, '2026-09-10T00:00:00Z');
    await insertRevision('video_override', 'vid1', 'save', {}, '2026-09-10T00:00:00Z');

    const body = (await (await listRevisions(env, 'channel', null, null, null, null)).json()) as {
      revisions: { entity: string }[];
    };

    expect(body.revisions).toEqual([expect.objectContaining({ entity: 'channel' })]);
  });

  test('narrows by action', async () => {
    await insertRevision('footprints_event', '1', 'publish', {}, '2026-09-10T00:00:00Z');
    await insertRevision('footprints_event', '1', 'withdraw', null, '2026-09-11T00:00:00Z');

    const body = (await (await listRevisions(env, null, 'withdraw', null, null, null)).json()) as {
      revisions: { action: string }[];
    };

    expect(body.revisions).toEqual([expect.objectContaining({ action: 'withdraw' })]);
  });

  test('narrows by from/to, Japan-time dates', async () => {
    // 2026-09-10T14:59:59Z is 2026-09-10 23:59:59 JST; 2026-09-10T15:00:00Z rolls to 2026-09-11 JST.
    await insertRevision('channel', 'UCaaa', 'save', {}, '2026-09-10T14:59:59Z');
    await insertRevision('channel', 'UCbbb', 'save', {}, '2026-09-10T15:00:00Z');

    const body = (await (await listRevisions(env, null, null, '2026-09-11', '2026-09-11', null)).json()) as {
      revisions: { entityKey: string }[];
    };

    expect(body.revisions).toEqual([expect.objectContaining({ entityKey: 'UCbbb' })]);
  });

  test('refuses an unknown entity with 400', async () => {
    const response = await listRevisions(env, 'not_an_entity', null, null, null, null);

    expect(response.status).toEqual(400);
  });

  test('refuses an unknown action with 400', async () => {
    const response = await listRevisions(env, null, 'not_an_action', null, null, null);

    expect(response.status).toEqual(400);
  });

  test('refuses a malformed date with 400', async () => {
    expect((await listRevisions(env, null, null, '2026/09/10', null, null)).status).toEqual(400);
  });

  test('respects limit, and refuses one above the cap', async () => {
    for (let i = 0; i < 5; i++) {
      await insertRevision('channel', `UC${i}`, 'save', {}, `2026-09-10T00:0${i}:00Z`);
    }

    const limited = (await (await listRevisions(env, null, null, null, null, '2')).json()) as { revisions: unknown[] };

    expect(limited.revisions.length).toEqual(2);
    expect((await listRevisions(env, null, null, null, null, '201')).status).toEqual(400);
  });
});

describe('getRevision', () => {
  test('reads one revision, with its body parsed', async () => {
    await insertRevision('channel', 'UCaaa', 'save', { name: 'ケープペンギン' }, '2026-09-10T00:00:00Z');

    const row = await env.DB.prepare('SELECT revision_id FROM revision').first<{ revision_id: number }>();
    const response = await getRevision(env, row!.revision_id);
    const body = (await response.json()) as { revision: { body: Record<string, unknown> | null } };

    expect(body.revision.body).toEqual({ name: 'ケープペンギン' });
  });

  test('reads a withdraw/delete revision, whose body is null', async () => {
    await insertRevision('footprints_event', '1', 'withdraw', null, '2026-09-10T00:00:00Z');

    const row = await env.DB.prepare('SELECT revision_id FROM revision').first<{ revision_id: number }>();
    const body = (await (await getRevision(env, row!.revision_id)).json()) as { revision: { body: null } };

    expect(body.revision.body).toBeNull();
  });

  test('refuses an unknown revision_id with 404', async () => {
    const response = await getRevision(env, 999999);

    expect(response.status).toEqual(404);
  });
});

describe('readRevisionId', () => {
  test('accepts a plain positive integer', () => {
    expect(readRevisionId('42')).toEqual(42);
  });

  test.each(['0', '-1', '1.5', 'abc', ''])('rejects %s', (segment) => {
    expect(readRevisionId(segment)).toBeNull();
  });
});
