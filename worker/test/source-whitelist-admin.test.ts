import { env } from 'cloudflare:test';

import {
  addSourceWhitelist,
  deleteSourceWhitelist,
  listSourceWhitelist,
  updateSourceWhitelist,
} from '../src/admin/source-whitelist';
import { clearEverything } from './reset-db';
import { SAVE_FAILED } from '../src/lib/refusal';

beforeEach(clearEverything);

interface Entry {
  prefix: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

async function listed(): Promise<Entry[]> {
  return ((await (await listSourceWhitelist(env)).json()) as { sourceWhitelist: Entry[] }).sourceWhitelist;
}

const NOW = new Date('2026-11-24T09:00:00Z');

const HOST_PROBLEM = 'prefix must start with a lowercase host name, without a port or a user name';
const HOST_TEXT = 'URL の先頭のホスト名に、大文字・ポート番号・ユーザー名のどれかが含まれています';

describe('listSourceWhitelist', () => {
  test('answers an empty list for an empty table', async () => {
    expect(await listed()).toEqual([]);
  });

  test('lists entries in the order they were added', async () => {
    await addSourceWhitelist(env, { prefix: 'https://b.example/' }, NOW);
    await addSourceWhitelist(env, { prefix: 'https://a.example/' }, NOW);

    expect((await listed()).map((entry) => entry.prefix)).toEqual(['https://b.example/', 'https://a.example/']);
  });
});

describe('addSourceWhitelist', () => {
  test('adds an entry with its note and answers 201', async () => {
    const response = await addSourceWhitelist(env, { prefix: 'https://partner.example/news/', note: '提携先' }, NOW);

    expect(response.status).toEqual(201);

    const { sourceWhitelist } = (await response.json()) as { sourceWhitelist: Entry };

    expect(sourceWhitelist).toEqual({
      prefix: 'https://partner.example/news/',
      note: '提携先',
      createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    });
    expect(await listed()).toEqual([sourceWhitelist]);
  });

  test('takes a missing note as none', async () => {
    await addSourceWhitelist(env, { prefix: 'https://partner.example/' }, NOW);

    expect((await listed())[0]!.note).toBeNull();
  });

  test('answers 409 for a prefix already on the list, and adds nothing', async () => {
    await addSourceWhitelist(env, { prefix: 'https://partner.example/' }, NOW);

    const response = await addSourceWhitelist(env, { prefix: 'https://partner.example/', note: 'again' }, NOW);

    expect(response.status).toEqual(409);
    expect(await listed()).toHaveLength(1);
  });

  test.each([
    [{}, SAVE_FAILED, 'prefix must be a string'],
    [{ prefix: 12 }, SAVE_FAILED, 'prefix must be a string'],
    [
      { prefix: 'http://partner.example/' },
      'URL の先頭が https:// で始まっていません',
      'prefix must start with https://',
    ],
    // Would accept every https URL there is.
    [{ prefix: 'https://' }, 'URL の先頭の形式が正しくありません', 'prefix must be a URL'],
    [{ prefix: 'https:///path' }, HOST_TEXT, HOST_PROBLEM],
    [{ prefix: 'https://Partner.example/' }, HOST_TEXT, HOST_PROBLEM],
    [{ prefix: 'https://partner.example:8443/' }, HOST_TEXT, HOST_PROBLEM],
    [{ prefix: 'https://user@partner.example/' }, HOST_TEXT, HOST_PROBLEM],
    [
      { prefix: 'https://partner.example/a b' },
      'URL の先頭に空白が含まれています',
      'prefix must not contain whitespace or control characters',
    ],
    [{ prefix: 'https://partner.example/', note: '' }, SAVE_FAILED, 'note must be a non-empty string or null'],
    [{ prefix: 'https://partner.example/', note: 3 }, SAVE_FAILED, 'note must be a non-empty string or null'],
    [{ prefix: 'https://partner.example/', other: 1 }, SAVE_FAILED, 'other cannot be saved'],
  ])('refuses %j with 400, and adds nothing', async (body, error, detail) => {
    const response = await addSourceWhitelist(env, body, NOW);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error, detail });
    expect(await listed()).toEqual([]);
  });

  test('accepts a host with no trailing slash, an account and an encoded path', async () => {
    for (const prefix of [
      'https://partner.example',
      'https://x.com/Someone_KEMOV',
      'https://dic.nicovideo.jp/a/%E3%81%91',
    ]) {
      expect((await addSourceWhitelist(env, { prefix }, NOW)).status).toEqual(201);
    }
  });
});

describe('updateSourceWhitelist', () => {
  test('changes the note and moves updated_at, not created_at', async () => {
    await addSourceWhitelist(env, { prefix: 'https://partner.example/', note: 'before' }, NOW);
    await env.DB.prepare(
      `UPDATE source_whitelist SET created_at = '2026-01-01T00:00:00Z', updated_at = '2026-01-01T00:00:00Z'`,
    ).run();

    const response = await updateSourceWhitelist(env, 'https://partner.example/', { note: 'after' });

    expect(response.status).toEqual(200);

    const [entry] = await listed();

    expect(entry).toMatchObject({
      prefix: 'https://partner.example/',
      note: 'after',
      createdAt: '2026-01-01T00:00:00Z',
    });
    expect(entry!.updatedAt).not.toEqual('2026-01-01T00:00:00Z');
  });

  test('clears the note with null', async () => {
    await addSourceWhitelist(env, { prefix: 'https://partner.example/', note: 'before' }, NOW);
    await updateSourceWhitelist(env, 'https://partner.example/', { note: null });

    expect((await listed())[0]!.note).toBeNull();
  });

  test('refuses a key other than note, since a different prefix is a different entry', async () => {
    await addSourceWhitelist(env, { prefix: 'https://partner.example/' }, NOW);

    const response = await updateSourceWhitelist(env, 'https://partner.example/', { prefix: 'https://other.example/' });

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: SAVE_FAILED, detail: 'prefix cannot be saved' });
  });

  test('answers 404 for a prefix that is not on the list', async () => {
    expect((await updateSourceWhitelist(env, 'https://nowhere.example/', { note: 'x' })).status).toEqual(404);
  });
});

describe('deleteSourceWhitelist', () => {
  test('removes the entry', async () => {
    await addSourceWhitelist(env, { prefix: 'https://a.example/' }, NOW);
    await addSourceWhitelist(env, { prefix: 'https://b.example/' }, NOW);

    expect((await deleteSourceWhitelist(env, 'https://a.example/', NOW)).status).toEqual(200);
    expect((await listed()).map((entry) => entry.prefix)).toEqual(['https://b.example/']);
  });

  test('answers 404 for a prefix that is not on the list', async () => {
    expect((await deleteSourceWhitelist(env, 'https://nowhere.example/', NOW)).status).toEqual(404);
  });

  // Refusing would make the list impossible to prune once anything used it,
  // and an event already published stays published either way.
  test('does not refuse a prefix an event source still matches, or touch the event', async () => {
    await env.DB.prepare(
      `INSERT INTO footprints_event (date_precision, start_date, kind, title, status)
       VALUES ('day', '2026-01-01', 'other', 'イベント', 'published')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO footprints_event_source (event_id, position, url) VALUES (1, 1, 'https://partner.example/a')`,
    ).run();
    await addSourceWhitelist(env, { prefix: 'https://partner.example/' }, NOW);

    expect((await deleteSourceWhitelist(env, 'https://partner.example/', NOW)).status).toEqual(200);
    expect(await env.DB.prepare('SELECT status FROM footprints_event').first()).toEqual({ status: 'published' });
  });
});

// #291: `error` is the sentence the screen shows; `detail` is the English for
// the log.
describe('what a refused request says', () => {
  test('says the prefix is already on the list', async () => {
    await addSourceWhitelist(env, { prefix: 'https://partner.example/' }, NOW);

    expect(await (await addSourceWhitelist(env, { prefix: 'https://partner.example/' }, NOW)).json()).toEqual({
      error: 'この URL の先頭は既に一覧に存在します',
      detail: 'https://partner.example/ is already on the list',
    });
  });

  test('says the prefix is not on the list', async () => {
    expect(await (await deleteSourceWhitelist(env, 'https://partner.example/', NOW)).json()).toEqual({
      error: 'この URL の先頭は一覧にありません',
      detail: 'https://partner.example/ is not on the list',
    });
  });
});
