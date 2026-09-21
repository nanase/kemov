import { publishMarkFor, waitingNoticeFor } from '@/admin/lib/publish-mark';

describe('publishMarkFor', () => {
  test.each([
    ['draft', false, { label: '下書き', tone: 'draft' }],
    ['review', false, { label: '確認中', tone: 'review' }],
    ['published', false, { label: '公開', tone: 'published' }],
    ['published', true, { label: '公開待ち', tone: 'waiting' }],
    ['published', null, { label: '公開（未確認）', tone: 'unknown' }],
  ] as const)('%s, waiting %s', (status, waiting, mark) => {
    expect(publishMarkFor(status, waiting)).toEqual(mark);
  });

  // Only a published row splits on it: a draft is a draft whether or not its
  // withdrawal has reached the public JSON yet.
  test('waiting or unknown does not change a draft or a review row', () => {
    expect(publishMarkFor('draft', true)).toEqual({ label: '下書き', tone: 'draft' });
    expect(publishMarkFor('draft', null)).toEqual({ label: '下書き', tone: 'draft' });
    expect(publishMarkFor('review', true)).toEqual({ label: '確認中', tone: 'review' });
  });
});

describe('waitingNoticeFor', () => {
  test('a published row is waiting to come out', () => {
    expect(waitingNoticeFor('published').title).toEqual('公開待ち');
  });

  test('any other row is waiting to be taken off', () => {
    expect(waitingNoticeFor('draft').title).not.toEqual('公開待ち');
  });

  test('both name the button that does the second step', () => {
    expect(waitingNoticeFor('published').body).toContain('いま公開する');
    expect(waitingNoticeFor('draft').body).toContain('いま公開する');
  });
});
