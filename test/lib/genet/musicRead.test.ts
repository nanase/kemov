import { readGenetMusicData } from '@/lib/genet/musicRead';
import { ShapeError } from '@/lib/read';

/** One of each record, every optional field filled. */
function body(): Record<string, unknown> {
  return {
    published_at: '2026-09-20T13:37:36Z',
    shape_version: 2,
    channel_id: 'UCabc',
    streams: [
      {
        video_id: 'vid1',
        platform: 'youtube',
        url: null,
        video_type: 'live',
        title: '配信',
        short_title: null,
        published_at: '2026-09-20T10:00:00Z',
        categories: ['雑談'],
        keywords: ['歌'],
        performances: [
          {
            tune_id: 1,
            description: null,
            scenes: [{ style: 'sing', video_id: 'vid1', start_seconds: 12 }],
          },
        ],
      },
    ],
    tunes: [
      {
        tune_id: 1,
        title: '曲',
        original_title: null,
        subtunes: ['別名'],
        attributes: [{ name: '作曲', text: null, people: [{ person_id: 7, credited_as: null, note: 'メモ' }] }],
        videos: [{ video_id: 'vid2', title: '動画', start_seconds: null, description: null }],
        scores: [{ url: 'https://example.com/score', title: '楽譜' }],
      },
    ],
    people: [{ person_id: 7, name: '人', link: null }],
  };
}

describe('readGenetMusicData', () => {
  test('passes a well-formed body through unchanged', () => {
    expect(readGenetMusicData(body())).toEqual(body());
  });

  test('accepts a null channel_id and a body from before the field existed', () => {
    expect(readGenetMusicData({ ...body(), channel_id: null }).channel_id).toBeNull();

    const old = body();

    delete old.channel_id;
    delete old.shape_version;

    expect(readGenetMusicData(old).channel_id).toBeNull();
  });

  const GONE = Symbol('remove the field');

  // Each case is a path into the body and what to put there.
  test.each<[string, (string | number)[], unknown]>([
    ['a missing top-level field', ['people'], GONE],
    ['streams that are not an array', ['streams'], 'no'],
    ['a missing stream field', ['streams', 0, 'video_id'], GONE],
    ['a wrong-typed stream field', ['streams', 0, 'title'], 3],
    ['an unknown platform', ['streams', 0, 'platform'], 'niconico'],
    ['an unknown video type', ['streams', 0, 'video_type'], 'clip'],
    ['an unknown scene style', ['streams', 0, 'performances', 0, 'scenes', 0, 'style'], 'dance'],
    ['a malformed instant', ['streams', 0, 'published_at'], '2026-02-30T00:00:00Z'],
    ['a non-string keyword', ['streams', 0, 'keywords'], [1]],
    ['a non-numeric tune_id', ['tunes', 0, 'tune_id'], '1'],
    ['a missing attribute people', ['tunes', 0, 'attributes', 0, 'people'], GONE],
    ['a wrong-typed score url', ['tunes', 0, 'scores', 0, 'url'], null],
    ['a wrong-typed person name', ['people', 0, 'name'], null],
    ['a numeric channel_id', ['channel_id'], 5],
  ])('throws a ShapeError for %s', (_name, path, replacement) => {
    const data = body();
    let parent: Record<string | number, unknown> = data;

    for (const key of path.slice(0, -1)) parent = parent[key] as Record<string | number, unknown>;

    const last = path[path.length - 1];

    if (replacement === GONE) delete parent[last];
    else parent[last] = replacement;

    expect(() => readGenetMusicData(data)).toThrow(ShapeError);
  });

  test.each([null, [], 'text', 3])('throws a ShapeError when the body is %j', (value) => {
    expect(() => readGenetMusicData(value)).toThrow(ShapeError);
  });
});
