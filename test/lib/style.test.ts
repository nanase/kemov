import { url } from '@/lib/style';

describe('url', () => {
  test('empty url', () => {
    expect(url('')).toEqual('url("")');
  });

  test('url', () => {
    expect(url('https://example.com/')).toEqual('url("https://example.com/")');
  });

  test('url with quote', () => {
    expect(url('https://example.com/?"')).toEqual('url("https://example.com/?%22")');
  });
});
