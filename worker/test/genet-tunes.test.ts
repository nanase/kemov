import { env } from 'cloudflare:test';

import { createTune, deleteTune, getTune, listTunes, updateTune } from '../src/admin/genet-tunes';
import { clearEverything } from './reset-db';

beforeEach(clearEverything);

async function insertPerson(name: string, link: string | null = null): Promise<number> {
  const inserted = await env.DB.prepare('INSERT INTO genet_person (name, link) VALUES (?1, ?2)').bind(name, link).run();

  return inserted.meta.last_row_id;
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    title: '曲名',
    originalTitle: null,
    subtunes: [],
    attributes: [],
    videos: [],
    scores: [],
    memo: null,
    ...overrides,
  };
}

async function createValidTune(overrides: Record<string, unknown> = {}): Promise<number> {
  const response = await createTune(env, validBody(overrides));
  const body = (await response.json()) as { tune: { tuneId: number } };

  return body.tune.tuneId;
}

describe('listTunes', () => {
  test('is empty with no rows', async () => {
    expect(await (await listTunes(env, null)).json()).toEqual({ tunes: [] });
  });

  test('narrows by a substring of title', async () => {
    await createValidTune({ title: '交響曲第9番' });
    await createValidTune({ title: '運命' });

    const response = await listTunes(env, '交響');
    const body = (await response.json()) as { tunes: { title: string }[] };

    expect(body.tunes.map((t) => t.title)).toEqual(['交響曲第9番']);
  });
});

describe('createTune', () => {
  test('creates a tune with no attributes/videos/scores', async () => {
    const response = await createTune(env, validBody());

    expect(response.status).toEqual(201);

    const body = (await response.json()) as { tune: { title: string; subtunes: string[] } };

    expect(body.tune.title).toEqual('曲名');
    expect(body.tune.subtunes).toEqual([]);
  });

  test('refuses an empty title', async () => {
    expect((await createTune(env, validBody({ title: '' }))).status).toEqual(400);
  });

  test('creates attributes with linked people, in position order', async () => {
    const composerId = await insertPerson('作曲者', 'wiki:作曲者');

    const response = await createTune(
      env,
      validBody({
        attributes: [
          { name: '作曲', text: null, people: [{ personId: composerId, creditedAs: null, note: null }] },
          { name: null, text: 'ただの文' },
        ],
      }),
    );

    expect(response.status).toEqual(201);

    const body = (await response.json()) as {
      tune: { attributes: { name: string | null; text: string | null; people: { personId: number }[] }[] };
    };

    expect(body.tune.attributes).toEqual([
      { name: '作曲', text: null, people: [{ personId: composerId, creditedAs: null, note: null }] },
      { name: null, text: 'ただの文', people: [] },
    ]);
  });

  test('refuses an attribute with neither name nor text', async () => {
    const response = await createTune(env, validBody({ attributes: [{ name: null, text: null }] }));

    expect(response.status).toEqual(400);
  });

  test('allows an attribute with both text and people at save time', async () => {
    const composerId = await insertPerson('作曲者');

    const response = await createTune(
      env,
      validBody({
        attributes: [
          { name: '作曲', text: 'ただの文', people: [{ personId: composerId, creditedAs: null, note: null }] },
        ],
      }),
    );

    expect(response.status).toEqual(201);
  });

  // genet_tune_attribute_person.person_id's foreign key is enforced, so
  // without this check an attribute naming a personId that does not exist
  // would fail the whole batch with a raw constraint error instead of a 400.
  test('refuses an attribute person naming a personId that does not exist', async () => {
    const response = await createTune(
      env,
      validBody({
        attributes: [{ name: '作曲', text: null, people: [{ personId: 999, creditedAs: null, note: null }] }],
      }),
    );

    expect(response.status).toEqual(400);
  });

  test('creates videos and scores, in position order', async () => {
    const response = await createTune(
      env,
      validBody({
        videos: [{ videoId: 'abcdefghijk', title: 'ref video', startSeconds: 10, description: null }],
        scores: [{ url: 'https://imslp.org/wiki/x', title: 'sheet music' }],
      }),
    );

    expect(response.status).toEqual(201);

    const body = (await response.json()) as {
      tune: { videos: { videoId: string }[]; scores: { url: string; title: string }[] };
    };

    expect(body.tune.videos).toEqual([
      { videoId: 'abcdefghijk', title: 'ref video', startSeconds: 10, description: null },
    ]);
    expect(body.tune.scores).toEqual([{ url: 'https://imslp.org/wiki/x', title: 'sheet music' }]);
  });

  test('refuses a score url that does not start with https://', async () => {
    const response = await createTune(env, validBody({ scores: [{ url: 'http://example.com', title: 'x' }] }));

    expect(response.status).toEqual(400);
  });

  test('refuses a negative video startSeconds', async () => {
    const response = await createTune(
      env,
      validBody({ videos: [{ videoId: 'abcdefghijk', title: 'x', startSeconds: -1, description: null }] }),
    );

    expect(response.status).toEqual(400);
  });
});

describe('getTune', () => {
  test('answers 404 for a tune that does not exist', async () => {
    expect((await getTune(env, 1)).status).toEqual(404);
  });

  test('answers the saved tune', async () => {
    const tuneId = await createValidTune();
    const response = await getTune(env, tuneId);

    expect(response.status).toEqual(200);
  });
});

describe('updateTune', () => {
  test('answers 404 for a tune that does not exist', async () => {
    expect((await updateTune(env, 1, validBody())).status).toEqual(404);
  });

  test('replaces attributes, videos and scores wholesale', async () => {
    const personId = await insertPerson('x');
    const tuneId = await createValidTune({
      attributes: [{ name: '作曲', text: null, people: [{ personId, creditedAs: null, note: null }] }],
    });

    const response = await updateTune(env, tuneId, validBody({ title: '新しい題' }));

    expect(response.status).toEqual(200);

    const body = (await response.json()) as { tune: { title: string; attributes: unknown[] } };

    expect(body.tune.title).toEqual('新しい題');
    expect(body.tune.attributes).toEqual([]);

    const { results } = await env.DB.prepare('SELECT 1 FROM genet_tune_attribute_person WHERE tune_id = ?1')
      .bind(tuneId)
      .all();

    expect(results).toEqual([]);
  });
});

describe('deleteTune', () => {
  test('answers 404 for a tune that does not exist', async () => {
    expect((await deleteTune(env, 1)).status).toEqual(404);
  });

  test('deletes the tune and its children', async () => {
    const personId = await insertPerson('x');
    const tuneId = await createValidTune({
      attributes: [{ name: '作曲', text: null, people: [{ personId, creditedAs: null, note: null }] }],
      videos: [{ videoId: 'abcdefghijk', title: 'x', startSeconds: null, description: null }],
      scores: [{ url: 'https://x', title: 'x' }],
    });

    const response = await deleteTune(env, tuneId);

    expect(response.status).toEqual(200);
    expect(await env.DB.prepare('SELECT 1 FROM genet_tune WHERE tune_id = ?1').bind(tuneId).first()).toBeNull();
    expect(
      await env.DB.prepare('SELECT 1 FROM genet_tune_attribute WHERE tune_id = ?1').bind(tuneId).first(),
    ).toBeNull();
    expect(await env.DB.prepare('SELECT 1 FROM genet_tune_video WHERE tune_id = ?1').bind(tuneId).first()).toBeNull();
    expect(await env.DB.prepare('SELECT 1 FROM genet_tune_score WHERE tune_id = ?1').bind(tuneId).first()).toBeNull();
  });

  test('refuses with 409 when a stream still performs this tune', async () => {
    const tuneId = await createValidTune();

    await env.DB.prepare(
      `INSERT INTO genet_stream (video_id, video_type, title, published_at) VALUES ('abcdefghijk', 'live', 't', '2026-01-01T00:00:00Z')`,
    ).run();
    await env.DB.prepare('INSERT INTO genet_performance (video_id, position, tune_id) VALUES (?1, 1, ?2)')
      .bind('abcdefghijk', tuneId)
      .run();

    const response = await deleteTune(env, tuneId);

    expect(response.status).toEqual(409);
  });
});

// #291: `error` is the sentence the screen shows, counted from 1 where the
// form lists rows; `detail` is the English it marks the field by.
describe('what a refused save says', () => {
  test.each([
    [{ title: '' }, '曲名を書いてください', 'title must not be empty'],
    [
      {
        attributes: [
          { name: '作曲', text: 'a' },
          { name: null, text: null },
        ],
      },
      '作曲・作詞などの 2 番目に、項目の名前か中身を書いてください',
      'attributes[1] needs a name or a text',
    ],
    [
      { attributes: [{ name: '', text: 'a' }] },
      '作曲・作詞などの 1 番目の項目の名前が空になっています',
      'attributes[0].name must not be empty',
    ],
    [
      { attributes: [{ name: '作曲', text: '' }] },
      '作曲・作詞などの 1 番目の中身が空になっています',
      'attributes[0].text must not be empty',
    ],
    [
      {
        scores: [
          { url: 'https://example.com/a', title: 'a' },
          { url: 'http://example.com/b', title: 'b' },
        ],
      },
      '外部の資料の 2 番目のリンクが https:// で始まっていません',
      'scores[1].url must start with https://',
    ],
    [
      { videos: [{ videoId: 'abcdefghijk', title: 'a', startSeconds: -1 }] },
      '参考の動画の 1 番目の秒は 0 以上にしてください',
      'videos[0].startSeconds must be 0 or more',
    ],
    [{ subtunes: 'a' }, '保存に失敗しました', 'subtunes must be an array of strings'],
  ])('%j', async (overrides, error, detail) => {
    const response = await createTune(env, validBody(overrides));

    expect(response.status).toEqual(400);
    expect(await response.json()).toEqual({ error, detail });
  });

  test('says which person a credit leaves without a shown name', async () => {
    const first = await insertPerson('一人目');
    const second = await insertPerson('二人目');
    const people = [
      { personId: first, creditedAs: null, note: null },
      { personId: second, creditedAs: '', note: null },
    ];

    const response = await createTune(env, validBody({ attributes: [{ name: '作曲', text: null, people }] }));

    expect(await response.json()).toEqual({
      error: '作曲・作詞などの 1 番目の 2 人目の表示名が空になっています',
      detail: 'attributes[0].people[1].creditedAs must not be empty',
    });
  });

  test('says a person is gone', async () => {
    const people = [{ personId: 999, creditedAs: null, note: null }];

    const response = await createTune(env, validBody({ attributes: [{ name: '作曲', text: null, people }] }));

    expect(await response.json()).toEqual({
      error: '見つからない人物が含まれています',
      detail: 'unknown personIds: 999',
    });
  });

  test('says the tune is gone', async () => {
    expect(await (await getTune(env, 999)).json()).toEqual({ error: 'この曲が見つかりません', detail: 'no tune 999' });
  });

  test('says a stream still performs the tune', async () => {
    const tuneId = await createValidTune();

    await env.DB.prepare(
      `INSERT INTO genet_stream (video_id, video_type, title, published_at) VALUES ('abcdefghijk', 'live', 't', '2026-01-01T00:00:00Z')`,
    ).run();
    await env.DB.prepare('INSERT INTO genet_performance (video_id, position, tune_id) VALUES (?1, 1, ?2)')
      .bind('abcdefghijk', tuneId)
      .run();

    expect(await (await deleteTune(env, tuneId)).json()).toEqual({
      error: 'この曲を演奏している配信があるため削除できませんでした',
      detail: 'this tune is performed by a stream; remove it there first',
    });
  });
});
