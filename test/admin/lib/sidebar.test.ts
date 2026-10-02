import { pageGroup } from '@/admin/lib/sidebar';

describe('pageGroup', () => {
  test.each([
    ['inbox-review', 'やること'],
    ['footprints', 'データ'],
    ['history', '運用'],
  ])('%s belongs to %s', (page, group) => {
    expect(pageGroup(page)).toBe(group);
  });

  test('a page no group lists has none', () => {
    expect(pageGroup('nowhere')).toBe('');
  });
});
