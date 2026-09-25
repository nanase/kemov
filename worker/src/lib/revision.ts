/**
 * One `revision` row for a change the admin site made to an entity it
 * tracks.
 *
 * `channel`, `video_override` and `channel_snapshot_exclusion` do not pass
 * through a publish - #141's design decision 5 is that they take effect the
 * moment they are saved - so every write to one of them logs a `save` or a
 * `delete` here, and only here: `revision` is their whole history, not a
 * draft of something published later (#158).
 *
 * `footprints_event`, `genet_stream` and `subscriber_milestone` (#225) do
 * pass through a publish: saving one logs nothing, and only
 * `publish`/`withdraw` (and the collector's own `import`) add a row - see
 * #144's task 9/10.
 */

/**
 * Every entity task 9 (this PR), 10 or 12 (#158) writes a `revision` row for.
 * A runtime array rather than a bare union: revisions.ts's own GET (task 13,
 * #144) validates an `entity` query parameter against this same list, which
 * needs a value to check membership against, not only a type to check
 * assignability against.
 */
export const REVISION_ENTITIES = [
  'footprints_event',
  'genet_stream',
  'genet_tune',
  'genet_person',
  'channel',
  'video_override',
  'channel_snapshot_exclusion',
  'subscriber_milestone',
] as const;

export type RevisionEntity = (typeof REVISION_ENTITIES)[number];

export const REVISION_ACTIONS = ['import', 'publish', 'withdraw', 'save', 'delete'] as const;

export type RevisionAction = (typeof REVISION_ACTIONS)[number];

/**
 * A statement for one `revision` row, meant to sit in the same `db.batch` as
 * the row it logs - see footprints.ts for a `publish`/`withdraw`, and
 * members.ts, video-overrides.ts and snapshot-exclusions.ts for a `save`/`delete`.
 *
 * `created_via` is always `'admin'`: everything through `/admin/api` is a
 * person acting through the admin site, never the collector.
 *
 * `body`'s key order is the caller's to get right - see the comment on each
 * call site - because `JSON.stringify` only keeps the order an object
 * literal was built in, and this function cannot rebuild one without
 * choosing an order of its own.
 */
export function revisionStatement(
  db: D1Database,
  entity: RevisionEntity,
  entityKey: string,
  action: RevisionAction,
  body: Record<string, unknown> | null,
): D1PreparedStatement {
  return db
    .prepare(`INSERT INTO revision (entity, entity_key, action, body, created_via) VALUES (?1, ?2, ?3, ?4, 'admin')`)
    .bind(entity, entityKey, action, body === null ? null : JSON.stringify(body));
}
