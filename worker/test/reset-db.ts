import { env } from 'cloudflare:test';

/**
 * Empties every table this repository's migrations declare.
 *
 * `publication` and `revision` each carry a trigger refusing a DELETE
 * (append-only, see migrations/0005_add_revision_and_publication.sql), so a
 * plain DELETE loop would be refused for them. Dropped here and put back
 * from its own sqlite_master text afterward - not retyped - so this cannot
 * drift from whatever the migration defines. What it protects in
 * production, a row surviving until a test file's tests are done, is not
 * weakened: the trigger is gone only for the moment this function runs.
 */
export async function clearEverything(): Promise<void> {
  const triggers = await env.DB.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('publication', 'revision')`,
  ).all<{ name: string; sql: string }>();

  for (const trigger of triggers.results) {
    await env.DB.prepare(`DROP TRIGGER ${trigger.name}`).run();
  }

  // Children before parents: the foreign keys refuse it in any other order.
  for (const table of [
    'chat_author',
    'collect_task',
    'genet_scene',
    'genet_performance',
    'genet_tune_video',
    'genet_tune_score',
    'genet_tune_attribute_person',
    'genet_tune_attribute',
    'genet_stream',
    'genet_tune',
    'genet_person',
    'subscriber_milestone_source',
    'subscriber_milestone',
    'footprints_event_source',
    'footprints_event_member',
    'footprints_event',
    'source_whitelist',
    'channel_snapshot_exclusion',
    'video_override',
    'publication',
    'revision',
    'channel_snapshot',
    'video',
    'channel',
  ]) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }

  for (const trigger of triggers.results) {
    await env.DB.prepare(trigger.sql).run();
  }
}
