import { env } from 'cloudflare:test';

/**
 * The constraints 0007_add_genet_music.sql adds. Nothing in `worker/src/`
 * writes these tables yet - moving streaming.yml in and the admin site's
 * editing and publish operations are #144's later tasks - so this is the
 * schema on its own, exercised with raw SQL rather than through application
 * code.
 */

function personStatement(link: string | null): D1PreparedStatement {
  return env.DB.prepare('INSERT INTO genet_person (name, link) VALUES (?1, ?2)').bind('someone', link);
}

async function createPerson(link: string | null = null): Promise<number> {
  const { meta } = await personStatement(link).run();
  return meta.last_row_id;
}

function tuneStatement(subtunes = '[]'): D1PreparedStatement {
  return env.DB.prepare('INSERT INTO genet_tune (title, subtunes) VALUES (?1, ?2)').bind('a tune', subtunes);
}

async function createTune(): Promise<number> {
  const { meta } = await tuneStatement().run();
  return meta.last_row_id;
}

function streamStatement(
  videoId: string,
  overrides: { platform?: string; url?: string | null; categories?: string; keywords?: string; status?: string } = {},
): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO genet_stream (video_id, platform, url, video_type, title, published_at, categories, keywords, status)
     VALUES (?1, ?2, ?3, 'live', 'title', '2026-01-01T00:00:00Z', ?4, ?5, ?6)`,
  ).bind(
    videoId,
    overrides.platform ?? 'youtube',
    overrides.url ?? null,
    overrides.categories ?? '[]',
    overrides.keywords ?? '[]',
    overrides.status ?? 'draft',
  );
}

async function createStream(videoId: string): Promise<void> {
  await streamStatement(videoId).run();
}

async function createPerformance(videoId: string, tuneId: number): Promise<void> {
  await env.DB.prepare('INSERT INTO genet_performance (video_id, position, tune_id) VALUES (?1, 1, ?2)')
    .bind(videoId, tuneId)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM genet_scene').run();
  await env.DB.prepare('DELETE FROM genet_performance').run();
  await env.DB.prepare('DELETE FROM genet_stream').run();
  await env.DB.prepare('DELETE FROM genet_tune_score').run();
  await env.DB.prepare('DELETE FROM genet_tune_video').run();
  await env.DB.prepare('DELETE FROM genet_tune_attribute_person').run();
  await env.DB.prepare('DELETE FROM genet_tune_attribute').run();
  await env.DB.prepare('DELETE FROM genet_tune').run();
  await env.DB.prepare('DELETE FROM genet_person').run();
});

describe('genet_person', () => {
  test('allows two rows with no link', async () => {
    await personStatement(null).run();

    await expect(personStatement(null).run()).resolves.toMatchObject({ success: true });
  });

  test('refuses two rows with the same link', async () => {
    await personStatement('wiki:Foo').run();

    await expect(personStatement('wiki:Foo').run()).rejects.toThrow();
  });

  test('refuses a link with none of the allowed prefixes', async () => {
    await expect(personStatement('ftp://example.com').run()).rejects.toThrow();
  });
});

describe('genet_tune', () => {
  test('accepts a JSON array for subtunes', async () => {
    await expect(tuneStatement('["b-side"]').run()).resolves.toMatchObject({ success: true });
  });

  test('refuses a value that is not a JSON array', async () => {
    await expect(tuneStatement('{}').run()).rejects.toThrow();
  });

  test('refuses a value that is not valid JSON', async () => {
    await expect(tuneStatement('not json').run()).rejects.toThrow();
  });
});

describe('genet_tune_attribute', () => {
  test('accepts a name-only row', async () => {
    const tuneId = await createTune();

    await expect(
      env.DB.prepare('INSERT INTO genet_tune_attribute (tune_id, position, name) VALUES (?1, 1, ?2)')
        .bind(tuneId, '作曲')
        .run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a row with neither name nor text', async () => {
    const tuneId = await createTune();

    await expect(
      env.DB.prepare('INSERT INTO genet_tune_attribute (tune_id, position) VALUES (?1, 1)').bind(tuneId).run(),
    ).rejects.toThrow();
  });

  test('refuses two rows at the same position', async () => {
    const tuneId = await createTune();

    await env.DB.prepare('INSERT INTO genet_tune_attribute (tune_id, position, text) VALUES (?1, 1, ?2)')
      .bind(tuneId, 'x')
      .run();

    await expect(
      env.DB.prepare('INSERT INTO genet_tune_attribute (tune_id, position, text) VALUES (?1, 1, ?2)')
        .bind(tuneId, 'y')
        .run(),
    ).rejects.toThrow();
  });
});

describe('genet_tune_attribute_person', () => {
  test('references an existing attribute', async () => {
    const tuneId = await createTune();
    const personId = await createPerson();

    await env.DB.prepare('INSERT INTO genet_tune_attribute (tune_id, position, name) VALUES (?1, 1, ?2)')
      .bind(tuneId, '作曲')
      .run();

    await expect(
      env.DB.prepare(
        'INSERT INTO genet_tune_attribute_person (tune_id, attribute_position, position, person_id) VALUES (?1, 1, 1, ?2)',
      )
        .bind(tuneId, personId)
        .run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses an attribute_position that does not exist', async () => {
    const tuneId = await createTune();
    const personId = await createPerson();

    await expect(
      env.DB.prepare(
        'INSERT INTO genet_tune_attribute_person (tune_id, attribute_position, position, person_id) VALUES (?1, 1, 1, ?2)',
      )
        .bind(tuneId, personId)
        .run(),
    ).rejects.toThrow();
  });
});

describe('genet_stream', () => {
  test('accepts a YouTube stream with no url', async () => {
    await expect(streamStatement('yt1', { platform: 'youtube', url: null }).run()).resolves.toMatchObject({
      success: true,
    });
  });

  test('refuses a YouTube stream that carries a url', async () => {
    await expect(streamStatement('yt2', { platform: 'youtube', url: 'https://example.com' }).run()).rejects.toThrow();
  });

  test('accepts a TikTok stream with a url', async () => {
    await expect(
      streamStatement('tk1', { platform: 'tiktok', url: 'https://tiktok.com/x' }).run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a TikTok stream with no url', async () => {
    await expect(streamStatement('tk2', { platform: 'tiktok', url: null }).run()).rejects.toThrow();
  });

  test('refuses categories that is not a JSON array', async () => {
    await expect(streamStatement('yt3', { categories: '{}' }).run()).rejects.toThrow();
  });

  test('refuses a status outside draft/review/published', async () => {
    await expect(streamStatement('yt4', { status: 'live' }).run()).rejects.toThrow();
  });
});

describe('genet_performance', () => {
  test('references an existing stream and tune', async () => {
    const tuneId = await createTune();
    await createStream('yt1');

    await expect(
      env.DB.prepare('INSERT INTO genet_performance (video_id, position, tune_id) VALUES (?1, 1, ?2)')
        .bind('yt1', tuneId)
        .run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a stream that does not exist', async () => {
    const tuneId = await createTune();

    await expect(
      env.DB.prepare('INSERT INTO genet_performance (video_id, position, tune_id) VALUES (?1, 1, ?2)')
        .bind('nope', tuneId)
        .run(),
    ).rejects.toThrow();
  });
});

describe('genet_scene', () => {
  test.each(['play', 'sing', 'bgm', 'talk'])('accepts style %s', async (style) => {
    const tuneId = await createTune();
    await createStream('yt1');
    await createPerformance('yt1', tuneId);

    await expect(
      env.DB.prepare(
        'INSERT INTO genet_scene (video_id, position, scene_position, style, scene_video_id) VALUES (?1, 1, 1, ?2, ?1)',
      )
        .bind('yt1', style)
        .run(),
    ).resolves.toMatchObject({ success: true });
  });

  test('refuses a style outside the four values', async () => {
    const tuneId = await createTune();
    await createStream('yt1');
    await createPerformance('yt1', tuneId);

    await expect(
      env.DB.prepare(
        "INSERT INTO genet_scene (video_id, position, scene_position, style, scene_video_id) VALUES ('yt1', 1, 1, 'dance', 'yt1')",
      ).run(),
    ).rejects.toThrow();
  });

  test('refuses a performance that does not exist', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO genet_scene (video_id, position, scene_position, style, scene_video_id) VALUES ('nope', 1, 1, 'play', 'nope')",
      ).run(),
    ).rejects.toThrow();
  });
});
