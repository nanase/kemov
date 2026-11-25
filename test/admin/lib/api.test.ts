import { AdminApiError, errorDetail } from '@/admin/lib/api';

describe('AdminApiError', () => {
  test('keeps a plain string body as the message', () => {
    const error = new AdminApiError(0, '/genet/streams could not be reached: TypeError: Failed to fetch');

    expect(error.message).toEqual('/genet/streams could not be reached: TypeError: Failed to fetch');
  });

  test('reads a single error field', () => {
    const error = new AdminApiError(400, { error: 'videoId must be a non-empty string' });

    expect(error.message).toEqual('videoId must be a non-empty string');
  });

  test('joins multiple errors', () => {
    const error = new AdminApiError(400, {
      errors: ['title must not be empty', 'publishedAt must be YYYY-MM-DDTHH:MM:SSZ'],
    });

    expect(error.message).toEqual('title must not be empty / publishedAt must be YYYY-MM-DDTHH:MM:SSZ');
  });

  test('falls back to the status when the body names nothing', () => {
    const error = new AdminApiError(500, null);

    expect(error.message).toEqual('/admin/api answered 500');
  });
});

// #299: the worker's message for a row another screen changed is for logs.
describe('AdminApiError for a 409 the worker marks changedElsewhere', () => {
  const error = new AdminApiError(409, { error: 'footprints event 2 is no longer a draft', changedElsewhere: true });

  test('says it in Japanese, not in the worker message', () => {
    expect(error.message).toEqual('別の画面で変更されたため保存できませんでした');
    expect(error.changedElsewhere).toBe(true);
  });

  test('keeps the worker message for any other 409', () => {
    const other = new AdminApiError(409, { error: 'stream abcdefghijk already exists' });

    expect(other.message).toEqual('stream abcdefghijk already exists');
    expect(other.changedElsewhere).toBe(false);
  });
});

// #291: the worker's `error` is in Japanese for the screen; `detail` keeps the
// English that says which value was refused.
describe('AdminApiError detail', () => {
  test('reads the detail beside the error', () => {
    const error = new AdminApiError(400, { error: '色の形式が正しくありません', detail: 'colorBack must be #RRGGBB' });

    expect([error.message, error.detail]).toEqual(['色の形式が正しくありません', 'colorBack must be #RRGGBB']);
  });

  test('answers null when the body has none', () => {
    expect(new AdminApiError(404, { error: 'nope' }).detail).toBeNull();
    expect(new AdminApiError(400, { error: 'nope', detail: 3 }).detail).toBeNull();
    expect(new AdminApiError(0, 'could not be reached').detail).toBeNull();
  });
});

describe('errorDetail', () => {
  test('is the detail when the worker gave one', () => {
    expect(
      errorDetail(new AdminApiError(400, { error: '日付の形式が正しくありません', detail: 'from must be YYYY-MM-DD' })),
    ).toEqual('from must be YYYY-MM-DD');
  });

  test('is the message otherwise', () => {
    expect(errorDetail(new AdminApiError(400, { error: 'name must be a non-empty string' }))).toEqual(
      'name must be a non-empty string',
    );
    expect(errorDetail(new Error('boom'))).toEqual('boom');
    expect(errorDetail('plain')).toEqual('plain');
  });
});
