import { readEditableBody } from '../lib/editable-body';
import type { Env } from '../lib/env';
import { errorResponse, jsonResponse } from '../lib/json';

/**
 * Reading, saving and deleting `genet_person` (#141, #139): one composer,
 * lyricist or other credited person, shared across every `genet_tune` that
 * names them. `genet_person` has no `status` of its own - #141's design
 * decision is that only `genet_stream` carries one - so a save here logs no
 * `revision` at all; only publishing the stream that (through a tune) ends up
 * referencing this person does, in genet-publish.ts.
 */

const LINK_PREFIXES = ['wiki:', 'wikien:', 'https://'];

export interface PersonRow {
  person_id: number;
  name: string;
  link: string | null;
  memo: string | null;
}

export function present(row: PersonRow) {
  return { personId: row.person_id, name: row.name, link: row.link, memo: row.memo };
}

/** The shape #141's design gives one element of the public JSON's `people` array - `memo` left out, the same as every other `publicShapeOf` in this admin API. */
export function publicShapeOf(row: PersonRow) {
  return { person_id: row.person_id, name: row.name, link: row.link };
}

/** GET /admin/api/genet/people */
export async function listPeople(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT person_id, name, link, memo FROM genet_person ORDER BY person_id',
  ).all<PersonRow>();

  return jsonResponse({ people: results.map(present) });
}

/** Every `genet_person` row for the given ids, keyed by `person_id` - genet-streams.ts's publish validation and genet-publish.ts's JSON builder both want every referenced person at once rather than one query per id. */
export async function readPeople(env: Env, personIds: readonly number[]): Promise<Map<number, PersonRow>> {
  const ids = [...new Set(personIds)];

  if (ids.length === 0) return new Map();

  const placeholders = ids.map((_, index) => `?${index + 1}`).join(', ');

  const { results } = await env.DB.prepare(
    `SELECT person_id, name, link, memo FROM genet_person WHERE person_id IN (${placeholders})`,
  )
    .bind(...ids)
    .all<PersonRow>();

  return new Map(results.map((row) => [row.person_id, row]));
}

/** GET /admin/api/genet/people/:personId. 404 when there is no such person. */
export async function getPerson(env: Env, personId: number): Promise<Response> {
  const row = await env.DB.prepare('SELECT person_id, name, link, memo FROM genet_person WHERE person_id = ?1')
    .bind(personId)
    .first<PersonRow>();

  if (row === null) return errorResponse(404, `no person ${personId}`);

  return jsonResponse({ person: present(row) });
}

interface PersonFields {
  name: string;
  link: string | null;
  memo: string | null;
}

/**
 * `genet_person`'s three columns are independent of one another - no field
 * here needs to see a sibling's value the way footprints.ts's `startsAt`
 * needs `datePrecision` - so this is exactly the shape editable-body.ts's
 * `readEditableBody` exists for, the same as members.ts's `memberFieldProblem`.
 */
const EDITABLE_PERSON_KEYS = ['name', 'link', 'memo'] as const;

type EditablePersonKey = (typeof EDITABLE_PERSON_KEYS)[number];

/** The schema's own CHECKs on `genet_person`, mirrored here for a 400 with a reason instead of a raw constraint error. */
function personFieldProblem(key: EditablePersonKey, value: unknown): string | null {
  switch (key) {
    case 'name':
      return typeof value === 'string' && value !== '' ? null : 'name must be a non-empty string';
    case 'link':
      return value === null || (typeof value === 'string' && LINK_PREFIXES.some((prefix) => value.startsWith(prefix)))
        ? null
        : `link must start with one of ${LINK_PREFIXES.join(', ')}, or be null`;
    case 'memo':
      return value === null || typeof value === 'string' ? null : 'memo must be a string or null';
  }
}

function validatedPersonFields(body: Record<string, unknown>): PersonFields | { error: Response } {
  const read = readEditableBody(body, EDITABLE_PERSON_KEYS, personFieldProblem);

  if ('error' in read) return read;

  const { values } = read;

  return { name: values.name as string, link: values.link as string | null, memo: values.memo as string | null };
}

/** POST /admin/api/genet/people */
export async function createPerson(env: Env, body: Record<string, unknown>): Promise<Response> {
  const fields = validatedPersonFields(body);

  if ('error' in fields) return fields.error;

  const inserted = await env.DB.prepare('INSERT INTO genet_person (name, link, memo) VALUES (?1, ?2, ?3)')
    .bind(fields.name, fields.link, fields.memo)
    .run();

  const personId = inserted.meta.last_row_id;

  return jsonResponse({ person: present({ person_id: personId, ...fields }) }, { status: 201 });
}

/** PUT /admin/api/genet/people/:personId. 404 when there is no such person. */
export async function updatePerson(env: Env, personId: number, body: Record<string, unknown>): Promise<Response> {
  const existing = await env.DB.prepare('SELECT 1 FROM genet_person WHERE person_id = ?1').bind(personId).first();

  if (existing === null) return errorResponse(404, `no person ${personId}`);

  const fields = validatedPersonFields(body);

  if ('error' in fields) return fields.error;

  await env.DB.prepare('UPDATE genet_person SET name = ?1, link = ?2, memo = ?3 WHERE person_id = ?4')
    .bind(fields.name, fields.link, fields.memo, personId)
    .run();

  return jsonResponse({ person: present({ person_id: personId, ...fields }) });
}

/**
 * DELETE /admin/api/genet/people/:personId. 404 when there is no such
 * person, 409 when any `genet_tune_attribute_person` still names them -
 * deleting them out from under a tune's credit line would leave that row
 * pointing at nothing.
 */
export async function deletePerson(env: Env, personId: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT 1 FROM genet_person WHERE person_id = ?1').bind(personId).first();

  if (existing === null) return errorResponse(404, `no person ${personId}`);

  const referenced = await env.DB.prepare('SELECT 1 FROM genet_tune_attribute_person WHERE person_id = ?1')
    .bind(personId)
    .first();

  if (referenced !== null) return errorResponse(409, 'this person is credited on a tune; remove them there first');

  await env.DB.prepare('DELETE FROM genet_person WHERE person_id = ?1').bind(personId).run();

  return jsonResponse({});
}
