import {
  countText,
  publishedDateText,
  publishedDateTimeText,
  summaryCountText,
  videoTimeText,
} from '@/lib/genet/musicFormat';

describe('publishedDateText and publishedDateTimeText', () => {
  test('reads the JST calendar date and weekday, rolling past a UTC day boundary', () => {
    // 2025-02-01T10:00:00Z is 2025-02-01 19:00 JST, a Saturday.
    expect(publishedDateText('2025-02-01T10:00:00Z')).toEqual('2025-02-01 (土)');
    expect(publishedDateTimeText('2025-02-01T10:00:00Z')).toEqual('2025-02-01 (土) 19:00');
  });

  test('rolls the date forward when the JST shift crosses midnight', () => {
    // 2025-01-06T15:30:00Z is 2025-01-07 00:30 JST.
    expect(publishedDateText('2025-01-06T15:30:00Z')).toEqual('2025-01-07 (火)');
  });
});

describe('videoTimeText', () => {
  test.each([
    [0, '0:00'],
    [90, '1:30'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3976, '1:06:16'],
  ])('formats %s seconds as %s', (seconds, expected) => {
    expect(videoTimeText(seconds)).toEqual(expected);
  });
});

describe('countText', () => {
  test('joins the count and its own counter word', () => {
    expect(countText(113, '本')).toEqual('113 本');
    expect(countText(228, '曲')).toEqual('228 曲');
  });
});

describe('summaryCountText', () => {
  test('plain counts when nothing narrows the list', () => {
    expect(summaryCountText(113, 228, false, 113, 228)).toEqual('113 本 · 228 曲');
  });

  test('before/after counts once something narrows the list', () => {
    expect(summaryCountText(113, 228, true, 10, 2)).toEqual('113 本 → 10 本 · 228 曲 → 2 曲');
  });
});
