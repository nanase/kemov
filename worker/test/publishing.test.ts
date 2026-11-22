import { env } from 'cloudflare:test';

import { liveBodies, publishChange, type LatestRevisionRow, type PublishTarget } from '../src/admin/publishing';
import type { Env } from '../src/lib/env';
import { clearEverything } from './reset-db';

/**
 * The part of publishing that is the same for every data (#281): the order of
 * the writes, and what is left behind when one of them fails. Tried here with
 * a target of its own over `footprints_event`, so what is checked is the
 * contract, not あしあと's own JSON.
 */

const NOW = new Date('2026-11-22T00:00:00Z');
const OBJECT_KEY = 'test/published.json';

const TARGET: PublishTarget = {
  entity: 'footprints_event',
  target: 'footprints',
  objectKey: OBJECT_KEY,
  table: 'footprints_event',
  keyColumn: 'event_id',
  buildJson: async (_env, now, change) => JSON.stringify({ at: now.toISOString(), change }),
};

const R2_DOWN: Env = {
  ...env,
  PUBLIC_DATA: { put: () => Promise.reject(new Error('R2 is down')) } as unknown as R2Bucket,
};

beforeEach(async () => {
  await clearEverything();
  await env.PUBLIC_DATA.delete(OBJECT_KEY);
});

async function insertEvent(title: string): Promise<number> {
  const inserted = await env.DB.prepare(
    `INSERT INTO footprints_event (date_precision, start_date, kind, title) VALUES ('day', '2025-01-01', 'other', ?1)`,
  )
    .bind(title)
    .run();

  return inserted.meta.last_row_id;
}

function renameStatement(eventId: number, title: string): D1PreparedStatement {
  return env.DB.prepare('UPDATE footprints_event SET title = ?1 WHERE event_id = ?2').bind(title, eventId);
}

async function titleOf(eventId: number): Promise<string | undefined> {
  const row = await env.DB.prepare('SELECT title FROM footprints_event WHERE event_id = ?1')
    .bind(eventId)
    .first<{ title: string }>();

  return row?.title;
}

async function revisions(): Promise<{ revision_id: number; entity_key: string; action: string }[]> {
  const { results } = await env.DB.prepare(
    'SELECT revision_id, entity_key, action FROM revision ORDER BY revision_id',
  ).all<{ revision_id: number; entity_key: string; action: string }>();

  return results;
}

async function publications(): Promise<{ publication_id: number; last_revision_id: number; object_key: string }[]> {
  const { results } = await env.DB.prepare(
    'SELECT publication_id, last_revision_id, object_key FROM publication WHERE object_key = ?1 ORDER BY publication_id',
  )
    .bind(OBJECT_KEY)
    .all<{ publication_id: number; last_revision_id: number; object_key: string }>();

  return results;
}

describe('publishChange', () => {
  test('writes the JSON, then records the row, the revision and a publication naming it', async () => {
    const eventId = await insertEvent('前');
    const change = { key: String(eventId), action: 'publish' as const, body: { event_id: eventId } };

    const outcome = await publishChange(env, TARGET, change, [renameStatement(eventId, '後')], NOW);

    expect(outcome).toMatchObject({ written: true, revisionId: expect.any(Number) });
    expect(JSON.parse(await (await env.PUBLIC_DATA.get(OBJECT_KEY))!.text())).toEqual({
      at: '2026-11-22T00:00:00.000Z',
      change,
    });
    expect(await titleOf(eventId)).toEqual('後');

    const [revision] = await revisions();

    expect(revision).toMatchObject({ entity_key: String(eventId), action: 'publish' });
    expect(outcome.written && outcome.revisionId).toEqual(revision!.revision_id);
    expect(await publications()).toEqual([
      {
        publication_id: outcome.written ? outcome.publicationId : -1,
        last_revision_id: revision!.revision_id,
        object_key: OBJECT_KEY,
      },
    ]);
  });

  test('records nothing at all when the JSON cannot be written', async () => {
    const eventId = await insertEvent('前');

    const outcome = await publishChange(
      R2_DOWN,
      TARGET,
      { key: String(eventId), action: 'withdraw', body: null },
      [renameStatement(eventId, '後')],
      NOW,
    );

    expect(outcome).toEqual({ written: false, error: expect.stringContaining('R2 is down') });
    expect(await titleOf(eventId)).toEqual('前');
    expect(await revisions()).toEqual([]);
    expect(await publications()).toEqual([]);
  });

  // A failure to read what the JSON is built from is D1's, not "could not be
  // written": the caller would otherwise save the fields as if R2 were down.
  test('throws when the JSON cannot be built', async () => {
    const eventId = await insertEvent('前');
    const failing: PublishTarget = { ...TARGET, buildJson: () => Promise.reject(new Error('D1 is down')) };

    await expect(
      publishChange(env, failing, { key: String(eventId), action: 'withdraw', body: null }, [], NOW),
    ).rejects.toThrow('D1 is down');
    expect(await env.PUBLIC_DATA.get(OBJECT_KEY)).toBeNull();
  });

  // A delete between the caller's read and the batch: no revision is left to
  // keep a row that no longer exists in every later JSON.
  test('logs no revision for a row that is gone by the time the batch runs', async () => {
    const eventId = await insertEvent('消える');

    await env.DB.prepare('DELETE FROM footprints_event WHERE event_id = ?1').bind(eventId).run();

    const outcome = await publishChange(
      env,
      TARGET,
      { key: String(eventId), action: 'publish', body: { event_id: eventId } },
      [renameStatement(eventId, '後')],
      NOW,
    );

    // With no revision anywhere, there is none for a publication to name either.
    expect(outcome).toMatchObject({ written: true, revisionId: null, publicationId: null });
    expect(await revisions()).toEqual([]);
    expect(await publications()).toEqual([]);
  });
});

describe('liveBodies', () => {
  const latest: LatestRevisionRow[] = [
    { entity_key: '1', revision_id: 1, action: 'publish', body: JSON.stringify({ id: 1, v: 'old' }) },
    { entity_key: '2', revision_id: 2, action: 'withdraw', body: null },
    { entity_key: '3', revision_id: 3, action: 'publish', body: JSON.stringify({ id: 3 }) },
  ];

  test('puts a publish body in place of what its key had', () => {
    expect(liveBodies(latest, { key: '1', action: 'publish', body: { id: 1, v: 'new' } })).toEqual([
      { id: 3 },
      { id: 1, v: 'new' },
    ]);
  });

  test('leaves a withdrawn key out, and keeps every other live one', () => {
    expect(liveBodies(latest, { key: '3', action: 'withdraw', body: null })).toEqual([{ id: 1, v: 'old' }]);
  });

  test('adds a key that had no revision yet', () => {
    expect(liveBodies(latest, { key: '4', action: 'publish', body: { id: 4 } })).toHaveLength(3);
  });
});
