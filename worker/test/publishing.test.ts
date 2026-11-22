import { env } from 'cloudflare:test';

import {
  liveBodies,
  publishChange,
  REBUILD_LIMIT,
  republish,
  type LatestRevisionRow,
  type PublishTarget,
  type RevisionChange,
} from '../src/admin/publishing';
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

/** A JSON that says which events it has, and when it was built. */
const TARGET: PublishTarget = {
  entity: 'footprints_event',
  target: 'footprints',
  objectKey: OBJECT_KEY,
  table: 'footprints_event',
  keyColumn: 'event_id',
  buildJson: (now, latest, change) =>
    JSON.stringify({
      at: now.toISOString(),
      events: liveBodies(latest, change)
        .map((body) => body.event_id as number)
        .sort((a, b) => a - b),
    }),
};

const R2_DOWN: Env = {
  ...env,
  PUBLIC_DATA: { put: () => Promise.reject(new Error('R2 is down')) } as unknown as R2Bucket,
};

/** `env` with `PUBLIC_DATA`'s methods replaced by `overrides`, the rest left to the real bucket. */
interface BucketOverrides {
  put?: (key: string, value: string, options?: R2PutOptions) => Promise<R2Object>;
  head?: (key: string) => Promise<{ version: string } | null>;
}

function withBucket(overrides: BucketOverrides): Env {
  const bucket = new Proxy(env.PUBLIC_DATA, {
    get(target, property) {
      if (property in overrides) return overrides[property as keyof typeof overrides];

      const value = Reflect.get(target, property) as unknown;

      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });

  return { ...env, PUBLIC_DATA: bucket };
}

/** `env` with `DB.batch` replaced, the rest left to the real database. */
function withBatch(batch: D1Database['batch']): Env {
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === 'batch') return batch;

      const value = Reflect.get(target, property) as unknown;

      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });

  return { ...env, DB: db };
}

/** `env` whose `publication` insert waits at `held` before it runs, the rest left to the real database. */
function withHeldPublication(held: ReturnType<typeof stop>): Env {
  const db = new Proxy(env.DB, {
    get(target, property) {
      if (property === 'prepare') {
        return (sql: string) => {
          const statement = target.prepare(sql);

          if (!sql.includes('INSERT INTO publication')) return statement;

          return {
            bind: (...values: unknown[]) => {
              const bound = statement.bind(...values);

              return {
                run: async () => {
                  held.reach();
                  await held.released;

                  return await bound.run();
                },
              };
            },
          };
        };
      }

      const value = Reflect.get(target, property) as unknown;

      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  });

  return { ...env, DB: db };
}

/** A point one request stops at until the test lets it go on. */
function stop() {
  let reach!: () => void;
  let release!: () => void;
  const reached = new Promise<void>((resolve) => (reach = resolve));
  const released = new Promise<void>((resolve) => (release = resolve));

  return { reach, reached, release, released };
}

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

function publishOf(eventId: number): RevisionChange {
  return { key: String(eventId), action: 'publish', body: { event_id: eventId } };
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

async function publishedEvents(): Promise<number[]> {
  return (JSON.parse(await (await env.PUBLIC_DATA.get(OBJECT_KEY))!.text()) as { events: number[] }).events;
}

describe('publishChange', () => {
  test('writes the JSON, then records the row, the revision and a publication naming it', async () => {
    const eventId = await insertEvent('前');

    const outcome = await publishChange(env, TARGET, publishOf(eventId), [renameStatement(eventId, '後')], NOW);

    expect(outcome).toMatchObject({ written: true, revisionId: expect.any(Number) });
    expect(JSON.parse(await (await env.PUBLIC_DATA.get(OBJECT_KEY))!.text())).toEqual({
      at: '2026-11-22T00:00:00.000Z',
      events: [eventId],
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

    expect(outcome).toEqual({ written: false, recorded: false, error: expect.stringContaining('R2 is down') });
    expect(await titleOf(eventId)).toEqual('前');
    expect(await revisions()).toEqual([]);
    expect(await publications()).toEqual([]);
  });

  // A failure to build the JSON is not "could not be written": the caller
  // would otherwise save the fields as if R2 were down.
  test('throws when the JSON cannot be built', async () => {
    const eventId = await insertEvent('前');
    const failing: PublishTarget = {
      ...TARGET,
      buildJson: () => {
        throw new Error('cannot build');
      },
    };

    await expect(
      publishChange(env, failing, { key: String(eventId), action: 'withdraw', body: null }, [], NOW),
    ).rejects.toThrow('cannot build');
    expect(await env.PUBLIC_DATA.get(OBJECT_KEY)).toBeNull();
  });

  // A delete between the caller's read and the batch: no revision is left to
  // keep a row that no longer exists in every later JSON, and the JSON
  // already written with its body is built again without it.
  test('logs no revision for a row that is gone by the time the batch runs, and takes it back out of the JSON', async () => {
    const eventId = await insertEvent('消える');

    await env.DB.prepare('DELETE FROM footprints_event WHERE event_id = ?1').bind(eventId).run();

    const outcome = await publishChange(env, TARGET, publishOf(eventId), [renameStatement(eventId, '後')], NOW);

    // With no revision anywhere, there is none for a publication to name either.
    expect(outcome).toMatchObject({ written: true, revisionId: null, publicationId: null });
    expect(await revisions()).toEqual([]);
    expect(await publications()).toEqual([]);
    expect(await publishedEvents()).toEqual([]);
  });

  // The first request's write lands after the second request finished, built
  // from revisions that did not have the second's yet.
  test('keeps both events when a write built without the other lands last', async () => {
    const first = await insertEvent('一');
    const second = await insertEvent('二');
    const held = stop();
    let puts = 0;
    const holding = withBucket({
      put: async (key: string, value: string, options?: R2PutOptions) => {
        puts += 1;

        if (puts === 1) {
          held.reach();
          await held.released;
        }

        return await env.PUBLIC_DATA.put(key, value, options);
      },
    });

    const firstOutcome = publishChange(holding, TARGET, publishOf(first), [], NOW);

    await held.reached;

    const secondOutcome = await publishChange(env, TARGET, publishOf(second), [], NOW);

    expect(secondOutcome.written).toBe(true);
    expect(await publishedEvents()).toEqual([second]);

    held.release();

    expect((await firstOutcome).written).toBe(true);
    expect(await publishedEvents()).toEqual([first, second]);
    expect((await publications()).at(-1)!.last_revision_id).toEqual(
      Math.max(...(await revisions()).map((r) => r.revision_id)),
    );
  });

  // The first request has written and stops before its batch. The second
  // writes over it, records and checks before the first's revision exists,
  // so only the first's own check can put both back.
  test("keeps both events when another request writes between this one's write and its batch", async () => {
    const first = await insertEvent('一');
    const second = await insertEvent('二');
    const held = stop();
    const holding = withBatch((async (statements: D1PreparedStatement[]) => {
      held.reach();
      await held.released;

      return await env.DB.batch(statements);
    }) as D1Database['batch']);

    const firstOutcome = publishChange(holding, TARGET, publishOf(first), [], NOW);

    await held.reached;
    expect(await publishedEvents()).toEqual([first]);

    expect((await publishChange(env, TARGET, publishOf(second), [], NOW)).written).toBe(true);
    expect(await publishedEvents()).toEqual([second]);

    held.release();

    expect((await firstOutcome).written).toBe(true);
    expect(await publishedEvents()).toEqual([first, second]);
  });

  // No revision is newer than what the first request built from, so only
  // R2's version of the object shows that its JSON was written over.
  test('builds the JSON again when it was written over with no new revision', async () => {
    const eventId = await insertEvent('一');
    const held = stop();
    const holding = withBatch((async (statements: D1PreparedStatement[]) => {
      held.reach();
      await held.released;

      return await env.DB.batch(statements);
    }) as D1Database['batch']);

    const outcome = publishChange(holding, TARGET, publishOf(eventId), [], NOW);

    await held.reached;
    await env.PUBLIC_DATA.put(OBJECT_KEY, JSON.stringify({ at: 'elsewhere', events: [] }));

    held.release();

    expect((await outcome).written).toBe(true);
    expect(await publishedEvents()).toEqual([eventId]);
  });

  test('says the change was recorded but may not be out when the JSON never settles', async () => {
    const eventId = await insertEvent('前');
    const unsettled = withBucket({ head: () => Promise.resolve({ version: 'someone else' }) });

    const outcome = await publishChange(unsettled, TARGET, publishOf(eventId), [renameStatement(eventId, '後')], NOW);

    expect(outcome).toEqual({
      written: false,
      recorded: true,
      revisionId: expect.any(Number),
      error: `${OBJECT_KEY} was still behind after ${REBUILD_LIMIT} rebuilds`,
    });
    expect(await titleOf(eventId)).toEqual('後');
    expect(await revisions()).toHaveLength(1);
    // Left unclaimed, so the change still counts as waiting.
    expect(await publications()).toEqual([]);
  });

  test('says the change was recorded but may not be out when the JSON cannot be written again', async () => {
    const eventId = await insertEvent('前');
    let puts = 0;
    const failingLater = withBucket({
      head: () => Promise.resolve({ version: 'someone else' }),
      put: async (key: string, value: string, options?: R2PutOptions) => {
        puts += 1;

        if (puts > 1) throw new Error('R2 is down');

        return await env.PUBLIC_DATA.put(key, value, options);
      },
    });

    const outcome = await publishChange(failingLater, TARGET, publishOf(eventId), [], NOW);

    expect(outcome).toEqual({
      written: false,
      recorded: true,
      revisionId: expect.any(Number),
      error: expect.stringContaining('R2 is down'),
    });
    expect(await publications()).toEqual([]);
  });

  // The change is recorded by the time the check reads `revision` again, so a
  // failure there is not one to answer as if nothing had been saved.
  test('says the change was recorded when the revisions cannot be read again after the batch', async () => {
    const eventId = await insertEvent('前');
    let batched = false;
    const failingAfter = new Proxy(env.DB, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            const results = await target.batch(statements);

            batched = true;

            return results;
          };
        }

        if (property === 'prepare') {
          return (sql: string) => {
            if (batched && sql.includes('FROM revision r')) throw new Error('D1 is down');

            return target.prepare(sql);
          };
        }

        const value = Reflect.get(target, property) as unknown;

        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });

    const outcome = await publishChange({ ...env, DB: failingAfter }, TARGET, publishOf(eventId), [], NOW);

    expect(outcome).toEqual({
      written: false,
      recorded: true,
      revisionId: expect.any(Number),
      error: expect.stringContaining('D1 is down'),
    });
    expect(await revisions()).toHaveLength(1);
  });

  // Both JSONs checked out; the one checked first records last. The newest
  // publication row must still name the newest revision, or a published row
  // would count as waiting.
  test('does not let an older publication land after a newer one', async () => {
    const first = await insertEvent('一');
    const second = await insertEvent('二');
    const held = stop();

    const firstOutcome = publishChange(withHeldPublication(held), TARGET, publishOf(first), [], NOW);

    await held.reached;

    const secondOutcome = await publishChange(env, TARGET, publishOf(second), [], NOW);

    held.release();

    expect(await firstOutcome).toMatchObject({ written: true, publicationId: null });
    expect(secondOutcome).toMatchObject({ written: true, publicationId: expect.any(Number) });
    expect(await publishedEvents()).toEqual([first, second]);
    expect((await publications()).map((p) => p.last_revision_id)).toEqual([
      Math.max(...(await revisions()).map((r) => r.revision_id)),
    ]);
  });
});

describe('republish', () => {
  test('writes the JSON from the recorded revisions and records a publication naming the newest', async () => {
    const eventId = await insertEvent('一');

    await publishChange(env, TARGET, publishOf(eventId), [], NOW);

    const outcome = await republish(env, TARGET, NOW);

    expect(outcome).toMatchObject({ current: true, publicationId: expect.any(Number) });
    expect(await publishedEvents()).toEqual([eventId]);
  });

  // 「いま公開する」 read the revisions before a 「公開」 was recorded, and its
  // write lands after that publish finished.
  test('does not write over a publish that finished while it was building', async () => {
    const first = await insertEvent('一');
    const second = await insertEvent('二');

    await publishChange(env, TARGET, publishOf(first), [], NOW);

    const held = stop();
    let puts = 0;
    const holding = withBucket({
      put: async (key: string, value: string, options?: R2PutOptions) => {
        puts += 1;

        if (puts === 1) {
          held.reach();
          await held.released;
        }

        return await env.PUBLIC_DATA.put(key, value, options);
      },
    });

    const outcome = republish(holding, TARGET, NOW);

    await held.reached;
    expect((await publishChange(env, TARGET, publishOf(second), [], NOW)).written).toBe(true);

    held.release();

    expect((await outcome).current).toBe(true);
    expect(await publishedEvents()).toEqual([first, second]);
  });

  test('throws when the JSON cannot be written, and records nothing', async () => {
    await expect(republish(R2_DOWN, TARGET, NOW)).rejects.toThrow('R2 is down');
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

  test('is every live body as recorded when there is no change', () => {
    expect(liveBodies(latest, null)).toEqual([{ id: 1, v: 'old' }, { id: 3 }]);
  });
});
