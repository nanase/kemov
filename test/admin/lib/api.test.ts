import { AdminApiError } from '@/admin/lib/api';

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
