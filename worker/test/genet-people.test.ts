import { env } from 'cloudflare:test';

import { createPerson, deletePerson, getPerson, listPeople, updatePerson } from '../src/admin/genet-people';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function createValidPerson(overrides: Record<string, unknown> = {}): Promise<number> {
  const response = await createPerson(env, {
    name: 'ベートーヴェン',
    link: 'wiki:ベートーヴェン',
    memo: null,
    ...overrides,
  });
  const body = (await response.json()) as { person: { personId: number } };

  return body.person.personId;
}

describe('listPeople', () => {
  test('is empty with no rows', async () => {
    const response = await listPeople(env);

    expect(await response.json()).toEqual({ people: [] });
  });

  test('lists every person, in personId order', async () => {
    const first = await createValidPerson({ name: 'a', link: null });
    const second = await createValidPerson({ name: 'b', link: null });

    const response = await listPeople(env);
    const body = (await response.json()) as { people: { personId: number }[] };

    expect(body.people.map((p) => p.personId)).toEqual([first, second]);
  });
});

describe('createPerson', () => {
  test('creates a person with a link', async () => {
    const response = await createPerson(env, { name: 'ベートーヴェン', link: 'wiki:ベートーヴェン', memo: 'note' });

    expect(response.status).toEqual(201);

    const body = (await response.json()) as { person: { name: string; link: string | null; memo: string | null } };

    expect(body.person).toMatchObject({ name: 'ベートーヴェン', link: 'wiki:ベートーヴェン', memo: 'note' });
  });

  test('creates a person with no link', async () => {
    const response = await createPerson(env, { name: '不明', link: null, memo: null });

    expect(response.status).toEqual(201);
  });

  test('refuses an empty name', async () => {
    const response = await createPerson(env, { name: '', link: null, memo: null });

    expect(response.status).toEqual(400);
  });

  test.each(['not-a-real-scheme:foo', 'ftp://example.com'])(
    'refuses a link not starting with wiki:, wikien: or https:// (%s)',
    async (link) => {
      const response = await createPerson(env, { name: 'x', link, memo: null });

      expect(response.status).toEqual(400);
    },
  );

  test.each(['wiki:foo', 'wikien:foo', 'https://example.com/foo'])(
    'accepts a link starting with wiki:, wikien: or https:// (%s)',
    async (link) => {
      const response = await createPerson(env, { name: 'x', link, memo: null });

      expect(response.status).toEqual(201);
    },
  );
});

describe('getPerson', () => {
  test('answers 404 for a person that does not exist', async () => {
    expect((await getPerson(env, 1)).status).toEqual(404);
  });

  test('answers the saved person', async () => {
    const personId = await createValidPerson();

    const response = await getPerson(env, personId);
    const body = (await response.json()) as { person: { personId: number; name: string } };

    expect(body.person).toEqual({ personId, name: 'ベートーヴェン', link: 'wiki:ベートーヴェン', memo: null });
  });
});

describe('updatePerson', () => {
  test('answers 404 for a person that does not exist', async () => {
    expect((await updatePerson(env, 1, { name: 'x', link: null, memo: null })).status).toEqual(404);
  });

  test('replaces the row', async () => {
    const personId = await createValidPerson();

    const response = await updatePerson(env, personId, { name: 'new name', link: null, memo: 'new memo' });

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { person: { name: string; link: string | null; memo: string | null } };

    expect(body.person).toEqual({ personId, name: 'new name', link: null, memo: 'new memo' });
  });

  test('refuses an empty name, and changes nothing', async () => {
    const personId = await createValidPerson();

    const response = await updatePerson(env, personId, { name: '', link: null, memo: null });

    expect(response.status).toEqual(400);

    const stored = await env.DB.prepare('SELECT name FROM genet_person WHERE person_id = ?1')
      .bind(personId)
      .first<{ name: string }>();

    expect(stored!.name).toEqual('ベートーヴェン');
  });
});

describe('deletePerson', () => {
  test('answers 404 for a person that does not exist', async () => {
    expect((await deletePerson(env, 1)).status).toEqual(404);
  });

  test('deletes the row', async () => {
    const personId = await createValidPerson();

    const response = await deletePerson(env, personId);

    expect(response.status).toEqual(200);

    const stored = await env.DB.prepare('SELECT 1 FROM genet_person WHERE person_id = ?1').bind(personId).first();

    expect(stored).toBeNull();
  });

  test('refuses with 409 when a tune still credits this person', async () => {
    const personId = await createValidPerson();

    await env.DB.prepare(`INSERT INTO genet_tune (title) VALUES ('曲')`).run();
    await env.DB.prepare(`INSERT INTO genet_tune_attribute (tune_id, position, name) VALUES (1, 1, '作曲')`).run();
    await env.DB.prepare(
      `INSERT INTO genet_tune_attribute_person (tune_id, attribute_position, position, person_id) VALUES (1, 1, 1, ?1)`,
    )
      .bind(personId)
      .run();

    const response = await deletePerson(env, personId);

    expect(response.status).toEqual(409);

    const stored = await env.DB.prepare('SELECT 1 FROM genet_person WHERE person_id = ?1').bind(personId).first();

    expect(stored).not.toBeNull();
  });
});

// #291: `error` is the sentence the screen shows; `detail` is the English it
// marks the field by.
describe('what a refused save says', () => {
  test.each([
    [{ name: '' }, '名前を書いてください', 'name must be a non-empty string'],
    [
      { link: 'ftp://example.com' },
      'リンクの形式が正しくありません',
      'link must start with one of wiki:, wikien:, https://, or be null',
    ],
    [{ memo: 3 }, '保存に失敗しました', 'memo must be a string or null'],
  ])('%j', async (overrides, error, detail) => {
    const response = await createPerson(env, { name: 'a', link: null, memo: null, ...overrides });

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error, detail });
  });

  test('says the person is gone', async () => {
    expect(await (await getPerson(env, 999)).json()).toEqual({
      error: 'この人が見つかりません',
      detail: 'no person 999',
    });
  });

  test('says a tune still credits the person', async () => {
    const personId = await createValidPerson();

    const tune = await env.DB.prepare(`INSERT INTO genet_tune (title) VALUES ('曲')`).run();
    const tuneId = tune.meta.last_row_id;

    await env.DB.prepare(`INSERT INTO genet_tune_attribute (tune_id, position, name) VALUES (?1, 1, '作曲')`)
      .bind(tuneId)
      .run();
    await env.DB.prepare(
      `INSERT INTO genet_tune_attribute_person (tune_id, attribute_position, position, person_id) VALUES (?1, 1, 1, ?2)`,
    )
      .bind(tuneId, personId)
      .run();

    expect(await (await deletePerson(env, personId)).json()).toEqual({
      error: 'この人をクレジットしている曲があるため削除できませんでした',
      detail: 'this person is credited on a tune; remove them there first',
    });
  });
});
