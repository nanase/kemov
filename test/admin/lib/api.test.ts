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
