import { env } from 'cloudflare:test';

import {
  addSourceWhitelist,
  deleteSourceWhitelist,
  listSourceWhitelist,
  updateSourceWhitelist,
} from '../src/admin/source-whitelist';
import { clearEverything } from './reset-db';

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

const HOST_PROBLEM = 'prefix must start with a lowercase host name, without a port or a user name';

describe('listSourceWhitelist', () => {
  test('answers an empty list for an empty table', async () => {
    expect(await listed()).toEqual([]);
  });

  test('lists entries in the order they were added', async () => {
    await addSourceWhitelist(env, { prefix: 'https://b.example/' });
    await addSourceWhitelist(env, { prefix: 'https://a.example/' });

    expect((await listed()).map((entry) => entry.prefix)).toEqual(['https://b.example/', 'https://a.example/']);
  });
});

describe('addSourceWhitelist', () => {
  test('adds an entry with its note and answers 201', async () => {
    const response = await addSourceWhitelist(env, { prefix: 'https://partner.example/news/', note: '提携先' });

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
    await addSourceWhitelist(env, { prefix: 'https://partner.example/' });

    expect((await listed())[0]!.note).toBeNull();
  });

  test('answers 409 for a prefix already on the list, and adds nothing', async () => {
    await addSourceWhitelist(env, { prefix: 'https://partner.example/' });

    const response = await addSourceWhitelist(env, { prefix: 'https://partner.example/', note: 'again' });

    expect(response.status).toEqual(409);
    expect(await listed()).toHaveLength(1);
  });

  test.each([
    [{}, 'prefix must be a string'],
    [{ prefix: 12 }, 'prefix must be a string'],
    [{ prefix: 'http://partner.example/' }, 'prefix must start with https://'],
    // Would accept every https URL there is.
    [{ prefix: 'https://' }, 'prefix must be a URL'],
    [{ prefix: 'https:///path' }, HOST_PROBLEM],
    [{ prefix: 'https://Partner.example/' }, HOST_PROBLEM],
    [{ prefix: 'https://partner.example:8443/' }, HOST_PROBLEM],
    [{ prefix: 'https://user@partner.example/' }, HOST_PROBLEM],
    [{ prefix: 'https://partner.example/a b' }, 'prefix must not contain whitespace or control characters'],
    [{ prefix: 'https://partner.example/', note: '' }, 'note must be a non-empty string or null'],
    [{ prefix: 'https://partner.example/', note: 3 }, 'note must be a non-empty string or null'],
    [{ prefix: 'https://partner.example/', other: 1 }, 'other cannot be saved'],
  ])('refuses %j with 400, and adds nothing', async (body, message) => {
    const response = await addSourceWhitelist(env, body);

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: message });
    expect(await listed()).toEqual([]);
  });

  test('accepts a host with no trailing slash, an account and an encoded path', async () => {
    for (const prefix of [
      'https://partner.example',
      'https://x.com/Someone_KEMOV',
      'https://dic.nicovideo.jp/a/%E3%81%91',
    ]) {
      expect((await addSourceWhitelist(env, { prefix })).status).toEqual(201);
    }
  });
});

describe('updateSourceWhitelist', () => {
  test('changes the note and moves updated_at, not created_at', async () => {
    await addSourceWhitelist(env, { prefix: 'https://partner.example/', note: 'before' });
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
    await addSourceWhitelist(env, { prefix: 'https://partner.example/', note: 'before' });
    await updateSourceWhitelist(env, 'https://partner.example/', { note: null });

    expect((await listed())[0]!.note).toBeNull();
  });

  test('refuses a key other than note, since a different prefix is a different entry', async () => {
    await addSourceWhitelist(env, { prefix: 'https://partner.example/' });

    const response = await updateSourceWhitelist(env, 'https://partner.example/', { prefix: 'https://other.example/' });

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error: 'prefix cannot be saved' });
  });

  test('answers 404 for a prefix that is not on the list', async () => {
    expect((await updateSourceWhitelist(env, 'https://nowhere.example/', { note: 'x' })).status).toEqual(404);
  });
});

describe('deleteSourceWhitelist', () => {
  test('removes the entry', async () => {
    await addSourceWhitelist(env, { prefix: 'https://a.example/' });
    await addSourceWhitelist(env, { prefix: 'https://b.example/' });

    expect((await deleteSourceWhitelist(env, 'https://a.example/')).status).toEqual(200);
    expect((await listed()).map((entry) => entry.prefix)).toEqual(['https://b.example/']);
  });

  test('answers 404 for a prefix that is not on the list', async () => {
    expect((await deleteSourceWhitelist(env, 'https://nowhere.example/')).status).toEqual(404);
  });

  // Refusing would make the list impossible to prune once anything used it,
  // and an event already published stays published either way.
  test('does not refuse a prefix an event source still matches, or touch the event', async () => {
    await env.DB.prepare(
      `INSERT INTO footprints_event (date_precision, start_date, kind, title, source_pending, status)
       VALUES ('day', '2026-01-01', 'other', 'イベント', 0, 'published')`,
    ).run();
    await env.DB.prepare(
      `INSERT INTO footprints_event_source (event_id, position, url) VALUES (1, 1, 'https://partner.example/a')`,
    ).run();
    await addSourceWhitelist(env, { prefix: 'https://partner.example/' });

    expect((await deleteSourceWhitelist(env, 'https://partner.example/')).status).toEqual(200);
    expect(await env.DB.prepare('SELECT status FROM footprints_event').first()).toEqual({ status: 'published' });
  });
});
