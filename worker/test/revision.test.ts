import { env } from 'cloudflare:test';

/**
 * The constraints 0005_add_revision_and_publication.sql adds. Nothing in
 * `worker/src/` writes these tables yet - the publish/save operations are
 * #144's later tasks - so this is the schema on its own, exercised with raw
 * SQL rather than through application code.
 */

// revision is append-only (that is what this file tests), so nothing here
// clears it between tests. Rows from earlier tests are harmless: nothing
// below depends on the table starting empty, only on the row a given test
// inserts for itself.
beforeEach(async () => {
  await env.DB.prepare('DELETE FROM publication').run();
});

describe('revision', () => {
  test('accepts a save with a body', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO revision (entity, entity_key, action, body) VALUES ('channel', 'UCaaa', 'save', '{}')",
      ).run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a publish with no body', async () => {
    await expect(
      env.DB.prepare("INSERT INTO revision (entity, entity_key, action) VALUES ('channel', 'UCaaa', 'publish')").run(),
    ).rejects.toThrow();
  });

  test('refuses a withdraw that carries a body', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO revision (entity, entity_key, action, body) VALUES ('channel', 'UCaaa', 'withdraw', '{}')",
      ).run(),
    ).rejects.toThrow();
  });

  test('refuses a body that is not a JSON object', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO revision (entity, entity_key, action, body) VALUES ('channel', 'UCaaa', 'save', '[1,2]')",
      ).run(),
    ).rejects.toThrow();
  });

  test('refuses an entity outside the entities the admin site tracks', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO revision (entity, entity_key, action, body) VALUES ('video', '1', 'save', '{}')",
      ).run(),
    ).rejects.toThrow();
  });

  test('is append only: refuses an UPDATE', async () => {
    await env.DB.prepare(
      "INSERT INTO revision (entity, entity_key, action, body) VALUES ('channel', 'UCaaa', 'save', '{}')",
    ).run();

    await expect(
      env.DB.prepare("UPDATE revision SET action = 'delete' WHERE entity_key = 'UCaaa'").run(),
    ).rejects.toThrow();
  });

  test('is append only: refuses a DELETE', async () => {
    await env.DB.prepare(
      "INSERT INTO revision (entity, entity_key, action, body) VALUES ('channel', 'UCaaa', 'save', '{}')",
    ).run();

    await expect(env.DB.prepare("DELETE FROM revision WHERE entity_key = 'UCaaa'").run()).rejects.toThrow();
  });
});

describe('publication', () => {
  test('references an existing revision', async () => {
    const { meta } = await env.DB.prepare(
      "INSERT INTO revision (entity, entity_key, action, body) VALUES ('footprints_event', '1', 'publish', '{}')",
    ).run();

    await expect(
      env.DB.prepare(
        "INSERT INTO publication (target, last_revision_id, object_key, byte_length) VALUES ('footprints', ?1, 'footprints/events.json', 100)",
      )
        .bind(meta.last_row_id)
        .run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a revision that does not exist', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO publication (target, last_revision_id, object_key, byte_length) VALUES ('footprints', 999999, 'footprints/events.json', 100)",
      ).run(),
    ).rejects.toThrow();
  });

  test('refuses a target outside footprints/genet_music', async () => {
    const { meta } = await env.DB.prepare(
      "INSERT INTO revision (entity, entity_key, action, body) VALUES ('footprints_event', '1', 'publish', '{}')",
    ).run();

    await expect(
      env.DB.prepare(
        "INSERT INTO publication (target, last_revision_id, object_key, byte_length) VALUES ('genet_video', ?1, 'x.json', 100)",
      )
        .bind(meta.last_row_id)
        .run(),
    ).rejects.toThrow();
  });
});
