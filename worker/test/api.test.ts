import { handleApiRequest } from '../src/api';

describe('handleApiRequest', () => {
  test('reports 404 while no endpoint exists', () => {
    expect(handleApiRequest(new Request('https://kemov.nanase.cc/api/channels')).status).toEqual(404);
  });

  test('names the path it did not match', async () => {
    const response = handleApiRequest(new Request('https://kemov.nanase.cc/api/channels'));

    expect(await response.json()).toEqual({ error: 'no endpoint at /api/channels' });
  });

  test('answers in JSON', () => {
    const response = handleApiRequest(new Request('https://kemov.nanase.cc/'));

    expect(response.headers.get('content-type')).toEqual('application/json; charset=UTF-8');
  });

  test('ignores the query string when naming the path', async () => {
    const response = handleApiRequest(new Request('https://kemov.nanase.cc/api/live?limit=10'));

    expect(await response.json()).toEqual({ error: 'no endpoint at /api/live' });
  });
});
