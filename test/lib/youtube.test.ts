import { getThumbnailURL, getWatchURL, getEmbedURL } from '@/lib/youtube';

describe('getThumbnailURL', () => {
  test('with no options (default)', () => {
    expect(getThumbnailURL('testid')).toBe('//i.ytimg.com/vi/testid/hqdefault.jpg');
  });

  test('with size', () => {
    expect(getThumbnailURL('testid', { size: 'default' })).toBe('//i.ytimg.com/vi/testid/default.jpg');
  });

  test('with server', () => {
    expect(getThumbnailURL('testid', { server: 'i4' })).toBe('//i4.ytimg.com/vi/testid/hqdefault.jpg');
  });

  test('with width', () => {
    expect(getThumbnailURL('testid', { width: 1280 })).toBe('//i.ytimg.com/vi/testid/maxresdefault.jpg');
  });

  test('with width and size', () => {
    expect(getThumbnailURL('testid', { width: 640, size: 'mq' })).toBe('//i.ytimg.com/vi/testid/mqdefault.jpg');
  });
});

describe('getWatchURL', () => {
  test('with video id', () => {
    expect(getWatchURL('testid')).toBe('//www.youtube.com/watch?v=testid');
  });
});

describe('getEmbedURL', () => {
  test('with video id', () => {
    expect(getEmbedURL('testid')).toBe('//www.youtube-nocookie.com/embed/testid');
  });

  test('nocookie is false', () => {
    expect(getEmbedURL('testid', false)).toBe('//www.youtube.com/embed/testid');
  });
});
