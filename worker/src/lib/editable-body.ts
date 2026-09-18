import { errorResponse } from './json';

/** What is wrong with one field's value, or null when it is fine. */
export type FieldProblem<K extends string> = (key: K, value: unknown) => string | null;

/**
 * A PUT body checked against an allow-list of editable keys, shared by
 * members.ts and video-overrides.ts - the two admin/api resources with more
 * than one editable column, so the same three-step shape (reject an unknown
 * key, default a left-out one to null, validate each one) was worth pulling
 * out from underneath their otherwise unrelated column lists and rules.
 * snapshot-exclusions.ts has exactly one editable field and validates it
 * inline instead - this exists for the shape of the check, not to force
 * every resource through it.
 *
 * A key the body leaves out is treated the same as one sent as null: every
 * PUT here is a full replace, not a patch, so there is no previous value for
 * "left out" to mean "keep". `fieldProblem` is what turns that into a 400
 * for a column that may not actually be null.
 */
export function readEditableBody<K extends string>(
  body: Record<string, unknown>,
  keys: readonly K[],
  fieldProblem: FieldProblem<K>,
): { values: Record<K, unknown> } | { error: Response } {
  const allowed: ReadonlySet<string> = new Set(keys);
  const unknownKey = Object.keys(body).find((key) => !allowed.has(key));

  if (unknownKey !== undefined) return { error: errorResponse(400, `${unknownKey} cannot be saved`) };

  const values = {} as Record<K, unknown>;

  for (const key of keys) values[key] = body[key] ?? null;

  for (const key of keys) {
    const problem = fieldProblem(key, values[key]);

    if (problem !== null) return { error: errorResponse(400, problem) };
  }

  return { values };
}
