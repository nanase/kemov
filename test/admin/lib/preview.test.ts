import { forgetPublicData, publicDataGeneration, unreadableField } from '@/admin/lib/preview';

describe('forgetPublicData', () => {
  test('moves the generation on, so a kept read is read again', () => {
    const before = publicDataGeneration();

    forgetPublicData();

    expect(publicDataGeneration()).toBe(before + 1);
  });
});

describe('unreadableField', () => {
  test('names a field the way the edit panel does', () => {
    expect(unreadableField('start_date')).toBe('「日付」が、公開ページで読めない形です');
  });

  test('a field with no name of its own is named as it is', () => {
    expect(unreadableField('something')).toBe('「something」が、公開ページで読めない形です');
  });
});
