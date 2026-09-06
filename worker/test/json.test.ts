import { errorResponse, jsonResponse } from '../src/lib/json';

describe('jsonResponse', () => {
  test('serialises the body', async () => {
    const response = jsonResponse({ channels: 11 });

    expect(await response.json()).toEqual({ channels: 11 });
  });

  test('declares the content type', () => {
    expect(jsonResponse({}).headers.get('content-type')).toEqual('application/json; charset=UTF-8');
  });

  test('defaults to 200', () => {
    expect(jsonResponse({}).status).toEqual(200);
  });

  test('keeps the given status', () => {
    expect(jsonResponse({}, { status: 503 }).status).toEqual(503);
  });

  test('keeps other given headers', () => {
    const response = jsonResponse({}, { headers: { 'cache-control': 'max-age=60' } });

    expect(response.headers.get('cache-control')).toEqual('max-age=60');
  });

  test('owns the content type even when one is given', () => {
    const response = jsonResponse({}, { headers: { 'content-type': 'text/plain' } });

    expect(response.headers.get('content-type')).toEqual('application/json; charset=UTF-8');
  });
});

describe('errorResponse', () => {
  test('reports the status', () => {
    expect(errorResponse(404, 'nope').status).toEqual(404);
  });

  test('carries the message as JSON', async () => {
    expect(await errorResponse(404, 'nope').json()).toEqual({ error: 'nope' });
  });
});
