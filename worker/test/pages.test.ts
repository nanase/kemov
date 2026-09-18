import { env } from 'cloudflare:test';

import { handleDynamicPageRequest } from '../src/pages';

/**
 * `/members/<id>`, against the real D1. `/members/` has no page of its own
 * yet (#137, #144's later work), so every test hands this a fake `ASSETS`
 * rather than the real one - the real one answers every path here with a
 * 404, which is covered on its own below.
 */

const PAGE_HTML = (title: string, ogUrl: string) => `<!doctype html>
<html lang="ja">
  <head>
    <title>${title}</title>
    <meta property="og:title" content="${title}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${ogUrl}" />
  </head>
  <body></body>
</html>`;

/** A fake `ASSETS` that answers `path` with `status`/`body`, and 404 for anything else. */
function fakeAssets(pages: Readonly<Record<string, { status: number; body: string }>>): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      const page = pages[path];

      if (page === undefined) return new Response('not found', { status: 404 });

      return new Response(page.body, { status: page.status, headers: { etag: '"stub"' } });
    },
  } as unknown as Fetcher;
}

const MEMBERS_PAGE = fakeAssets({
  '/members/': { status: 200, body: PAGE_HTML('けもV メンバー', 'https://kemov.nanase.cc/members') },
});
const NOT_FOUND_ASSETS = fakeAssets({});

async function insertChannel(channelId: string, name: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, color_key, color_sub, color_light, color_back, activity_start_date)
     VALUES (?1, ?2, ?2, '#000000', '#000000', '#000000', '#000000', '2021-01-01')`,
  )
    .bind(channelId, name)
    .run();
}

beforeEach(async () => {
  await env.DB.prepare('DELETE FROM channel').run();
});

const CHANNEL_ID = 'UCabMjG8p6G5xLkPJgEoTnDg';

async function headOf(
  response: Response,
): Promise<{ title: string | undefined; ogTitle: string | undefined; ogUrl: string | undefined }> {
  const body = await response.text();
  const title = /<title>([^<]*)<\/title>/.exec(body)?.[1];
  const ogTitle = /<meta property="og:title" content="([^"]*)"/.exec(body)?.[1];
  const ogUrl = /<meta property="og:url" content="([^"]*)"/.exec(body)?.[1];

  return { title, ogTitle, ogUrl };
}

describe('handleDynamicPageRequest', () => {
  test('is null for a path that names neither /members nor /videos', async () => {
    expect(await handleDynamicPageRequest(new Request('https://kemov.nanase.cc/api/channels'), env)).toBeNull();
  });

  test('is null for /members/ itself', async () => {
    expect(await handleDynamicPageRequest(new Request('https://kemov.nanase.cc/members/'), env)).toBeNull();
  });

  test('answers 200 with the member name for an existing channel id', async () => {
    await insertChannel(CHANNEL_ID, 'カラカル');

    const response = await handleDynamicPageRequest(
      new Request(`https://kemov.nanase.cc/members/${CHANNEL_ID}`),
      env,
      MEMBERS_PAGE,
    );

    expect(response).not.toBeNull();
    expect(response?.status).toEqual(200);

    const head = await headOf(response!);

    expect(head.title).toEqual('カラカル - けもV メンバー');
    expect(head.ogTitle).toEqual('カラカル - けもV メンバー');
    expect(head.ogUrl).toEqual(`https://kemov.nanase.cc/members/${CHANNEL_ID}`);
  });

  test('does not read D1 for an id of the wrong shape', async () => {
    const spy = vi.spyOn(env.DB, 'prepare');

    const response = await handleDynamicPageRequest(
      new Request('https://kemov.nanase.cc/members/not-a-channel-id'),
      env,
      MEMBERS_PAGE,
    );

    expect(response?.status).toEqual(404);
    expect(spy).not.toHaveBeenCalled();

    spy.mockRestore();
  });

  test('is 404 for an id that is the right shape but not in D1', async () => {
    const response = await handleDynamicPageRequest(
      new Request(`https://kemov.nanase.cc/members/${CHANNEL_ID}`),
      env,
      MEMBERS_PAGE,
    );

    expect(response?.status).toEqual(404);
  });

  test('returns whatever ASSETS answers when it cannot supply the page, unforced', async () => {
    await insertChannel(CHANNEL_ID, 'カラカル');

    const response = await handleDynamicPageRequest(
      new Request(`https://kemov.nanase.cc/members/${CHANNEL_ID}`),
      env,
      NOT_FOUND_ASSETS,
    );

    expect(response?.status).toEqual(404);
    expect(await response?.text()).toEqual('not found');
  });

  // This is what the current build actually does: the page does not exist in
  // dist/ yet, so env.ASSETS answers 404 without this test injecting anything.
  test('is 404 through the real ASSETS binding, because the page is not built yet', async () => {
    await insertChannel(CHANNEL_ID, 'カラカル');

    const response = await handleDynamicPageRequest(new Request(`https://kemov.nanase.cc/members/${CHANNEL_ID}`), env);

    expect(response?.status).toEqual(404);
  });

  test('refuses a method other than GET or HEAD', async () => {
    const response = await handleDynamicPageRequest(
      new Request(`https://kemov.nanase.cc/members/${CHANNEL_ID}`, { method: 'POST' }),
      env,
      MEMBERS_PAGE,
    );

    expect(response?.status).toEqual(405);
    expect(response?.headers.get('Allow')).toEqual('GET, HEAD');
  });

  // <title> is text content: an unescaped '<' or '&' there could end the
  // element early or start a bogus entity, so setInnerContent's escaping is
  // what keeps a name carrying either one from breaking the page around it.
  test('escapes & and < in the <title> text', async () => {
    await insertChannel(CHANNEL_ID, 'A & B <script>');

    const response = await handleDynamicPageRequest(
      new Request(`https://kemov.nanase.cc/members/${CHANNEL_ID}`),
      env,
      MEMBERS_PAGE,
    );
    const body = await response!.text();

    expect(body).toContain('<title>A &amp; B &lt;script&gt; - けもV メンバー</title>');
  });

  // og:title sits in a quoted attribute, where '<' is inert text and only an
  // unescaped '"' can break out of the value - into a new attribute, or with
  // '>' beside it, a new element. setAttribute escaping just that one
  // character is what a name carrying it cannot get around.
  test('escapes a " in og:title so the attribute cannot be broken out of', async () => {
    await insertChannel(CHANNEL_ID, 'quote " onload="alert(1)');

    const response = await handleDynamicPageRequest(
      new Request(`https://kemov.nanase.cc/members/${CHANNEL_ID}`),
      env,
      MEMBERS_PAGE,
    );
    const body = await response!.text();

    expect(body).toContain('content="quote &quot; onload=&quot;alert(1) - けもV メンバー"');
    expect(body).not.toContain('onload="alert(1)"');
  });

  test('unescapes an entity the collector stored as literal text', async () => {
    await insertChannel(CHANNEL_ID, 'O&#39;Brien &quot;Coyote&quot;');

    const response = await handleDynamicPageRequest(
      new Request(`https://kemov.nanase.cc/members/${CHANNEL_ID}`),
      env,
      MEMBERS_PAGE,
    );
    const head = await headOf(response!);

    expect(head.title).toEqual('O\'Brien "Coyote" - けもV メンバー');
  });

  test('drops the etag once the body has been rewritten', async () => {
    await insertChannel(CHANNEL_ID, 'カラカル');

    const response = await handleDynamicPageRequest(
      new Request(`https://kemov.nanase.cc/members/${CHANNEL_ID}`),
      env,
      MEMBERS_PAGE,
    );

    expect(response?.headers.get('etag')).toBeNull();
  });

  test('leaves the site pages and API untouched', async () => {
    expect(await handleDynamicPageRequest(new Request('https://kemov.nanase.cc/stats/'), env)).toBeNull();
    expect(await handleDynamicPageRequest(new Request('https://kemov.nanase.cc/api/channels'), env)).toBeNull();
    expect(await handleDynamicPageRequest(new Request('https://kemov.nanase.cc/admin/api/me'), env)).toBeNull();
  });
});
