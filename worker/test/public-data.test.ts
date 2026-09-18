import { env } from 'cloudflare:test';

import { publicDataResponse } from '../src/api/public-data';

/**
 * The R2 passthrough behind /api/footprints/events and /api/genet/music.
 * Routing itself - which path reaches which key - is api.test.ts's job, the
 * same split channels.ts and api.test.ts already keep.
 */

const KEY = 'footprints/events.json';

async function clearBucket(): Promise<void> {
  const listed = await env.PUBLIC_DATA.list();

  await Promise.all(listed.objects.map((object) => env.PUBLIC_DATA.delete(object.key)));
}

beforeEach(clearBucket);

const request = (init: RequestInit = {}) => new Request('https://kemov.nanase.cc/api/footprints/events', init);

// put() is typed to allow null - the outcome of an onlyIf condition this
// test never passes - so a plain put never actually returns one.
async function putObject(key: string, body: string): Promise<R2Object> {
  const object = await env.PUBLIC_DATA.put(key, body);

  if (object === null) throw new Error(`put ${key} unexpectedly returned null`);

  return object;
}

describe('publicDataResponse', () => {
  test('answers 404 before anything has been published', async () => {
    const response = await publicDataResponse(request(), env, KEY);

    expect(response.status).toEqual(404);
    expect(await response.json()).toEqual({ error: 'not published yet' });
  });

  test('serves the object as published, with its own ETag and Last-Modified', async () => {
    const put = await putObject(KEY, '{"events":[]}');

    const response = await publicDataResponse(request(), env, KEY);

    expect(response.status).toEqual(200);
    expect(await response.text()).toEqual('{"events":[]}');
    expect(response.headers.get('content-type')).toEqual('application/json; charset=UTF-8');
    expect(response.headers.get('etag')).toEqual(put.httpEtag);
    expect(response.headers.get('last-modified')).toEqual(put.uploaded.toUTCString());
    expect(response.headers.get('cache-control')).toEqual('public, max-age=60');
  });

  test('answers 304 with no body when If-None-Match matches the current ETag', async () => {
    const put = await putObject(KEY, '{"events":[]}');

    const response = await publicDataResponse(request({ headers: { 'If-None-Match': put.httpEtag } }), env, KEY);

    expect(response.status).toEqual(304);
    expect(await response.text()).toEqual('');
  });

  test('serves the object in full when If-None-Match names a different ETag', async () => {
    await putObject(KEY, '{"events":[]}');

    const response = await publicDataResponse(request({ headers: { 'If-None-Match': '"not-the-etag"' } }), env, KEY);

    expect(response.status).toEqual(200);
  });

  // RFC 7232 §3.2: If-None-Match is a comma-separated list of entity-tags,
  // or a bare *, not one bare tag - a browser holding more than one cached
  // response for this URL (there should only ever be one, but the header
  // does not promise that) sends every ETag it has.
  test('answers 304 when the current ETag is one of several in If-None-Match', async () => {
    const put = await putObject(KEY, '{"events":[]}');

    const response = await publicDataResponse(
      request({ headers: { 'If-None-Match': `"not-this-one", ${put.httpEtag}, "not-this-one-either"` } }),
      env,
      KEY,
    );

    expect(response.status).toEqual(304);
  });

  test('answers 304 for a bare *', async () => {
    await putObject(KEY, '{"events":[]}');

    const response = await publicDataResponse(request({ headers: { 'If-None-Match': '*' } }), env, KEY);

    expect(response.status).toEqual(304);
  });

  // Weak comparison (RFC 7232 §2.3.2) is what GET/HEAD's own If-None-Match
  // uses: a weak tag over the same value as the current strong one still
  // means "I already have this".
  test('answers 304 for a weak (W/) tag over the same value as the current ETag', async () => {
    const put = await putObject(KEY, '{"events":[]}');

    const response = await publicDataResponse(request({ headers: { 'If-None-Match': `W/${put.httpEtag}` } }), env, KEY);

    expect(response.status).toEqual(304);
  });

  test('serves the object in full when none of several If-None-Match tags match', async () => {
    await putObject(KEY, '{"events":[]}');

    const response = await publicDataResponse(
      request({ headers: { 'If-None-Match': '"not-this-one", "not-this-one-either"' } }),
      env,
      KEY,
    );

    expect(response.status).toEqual(200);
  });

  test('answers HEAD the same as GET, without a body', async () => {
    await putObject(KEY, '{"events":[]}');

    const found = await publicDataResponse(request({ method: 'HEAD' }), env, KEY);

    expect(found.status).toEqual(200);
    expect(await found.text()).toEqual('');
    expect(found.headers.get('etag')).not.toBeNull();

    const missing = await publicDataResponse(request({ method: 'HEAD' }), env, 'genet/music.json');

    expect(missing.status).toEqual(404);
    expect(await missing.text()).toEqual('');
  });
});
