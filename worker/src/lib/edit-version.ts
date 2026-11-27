import { changedElsewhereResponse } from './json';
import { malformed, refuse } from './refusal';

/**
 * `edit_version` (#307, migration 0017): the count of the writes to each row
 * the admin site edits - あしあと's events, 登録者数の節目 and ジェネット楽曲一覧's
 * streams. A screen sends back the version it read with every save, 公開 and
 * 非公開に戻す, and a row at another one was written by another screen since.
 *
 * Each table's `saveStatements` holds its statements to the version, and
 * each `*-publish.ts` holds the revision it logs to the version those
 * statements leave (`writtenAt`).
 */

/** What `heldToVersion` holds a write to, spread into the caller's `SaveOptions`. */
export interface HeldToVersion {
  whileVersion?: number;
}

/**
 * The `edit_version` a write's body says its fields were typed over (#307):
 * the row's `version` as the screen read it. `whileVersion` holds the write
 * to it, for the batch to write nothing over another screen's save that
 * lands after this request's read. A row already at another version was
 * written since the screen read it, and gets 409 straight away.
 *
 * A body with no `version` key is held to `current`, the version this
 * request read: its write lands only on the row as it read it, as one that
 * sent that version would. 400 for anything else but a whole number from 0
 * up, `null` included: a screen that lost the version it read must not
 * write over another's save unchecked.
 */
export function heldToVersion(
  body: Record<string, unknown>,
  current: number,
  what: string,
): HeldToVersion | { error: Response } {
  const { version } = body;

  if (version === undefined) return { whileVersion: current };

  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    return { error: refuse(400, malformed('version must be a whole number from 0 up')) };
  }

  if (version !== current) {
    return { error: changedElsewhereResponse(`${what} was saved by another screen since version ${version}`) };
  }

  return { whileVersion: version };
}

/**
 * How much a write adds to `edit_version`. A save of a published row that
 * logs no revision - its fields, saved after its JSON could not be written -
 * adds `UNLOGGED_VERSION_STEP`; every other write adds 1.
 *
 * That keeps `writtenAt` true of a row only this request's batch wrote. A
 * publish, a published row's save and a withdrawal each log a revision, so
 * one landing between this request's read and its batch fails `leftAs`'s
 * revision condition. A draft's save logs none, but leaves the row a draft,
 * which a published row's save or a withdrawal does not take for its own.
 * The one write that leaves a published row published with no revision is
 * the unlogged save, and it leaves the row at no version another save of
 * the same version could leave it at.
 */
export const UNLOGGED_VERSION_STEP = 2;

/**
 * `RevisionChange.whileRow`'s condition on the version, for a batch whose
 * row statements are held to `held`: the row is at the version they leave
 * it at (`UNLOGGED_VERSION_STEP`). Empty for a request held to no version.
 */
export function writtenAt(held: HeldToVersion, column = 'edit_version'): string {
  if (held.whileVersion === undefined) return '';

  // Written into the SQL, so never anything but the integer heldToVersion read.
  if (!Number.isSafeInteger(held.whileVersion)) throw new Error(`not a version: ${held.whileVersion}`);

  return ` AND ${column} = ${held.whileVersion + 1}`;
}
