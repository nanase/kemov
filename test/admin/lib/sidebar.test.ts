import { badgeFor, pageGroup, SIDEBAR_GROUPS } from '@/admin/lib/sidebar';
import type { DraftsResponse } from '@/admin/lib/sidebar-drafts';

describe('pageGroup', () => {
  test.each([
    ['inbox-collect', 'やること'],
    ['footprints', 'データ'],
    ['history', '運用'],
  ])('%s belongs to %s', (page, group) => {
    expect(pageGroup(page)).toBe(group);
  });

  test('a page no group lists has none', () => {
    expect(pageGroup('nowhere')).toBe('');
  });
});

describe('SIDEBAR_GROUPS', () => {
  // #277's decision 4.
  test('lists the items in the order decided', () => {
    expect(SIDEBAR_GROUPS.map((g) => [g.label, g.items.map((i) => i.name)])).toEqual([
      ['やること', ['収集の失敗']],
      ['データ', ['統計', '登録者数の節目', 'あしあと', 'メンバー', '配信・動画', 'ジェネット楽曲一覧']],
      ['運用', ['版の履歴', '出典ホワイトリスト']],
    ]);
  });
});

describe('badgeFor', () => {
  const drafts: DraftsResponse = {
    footprints: { drafts: 12, needsPublish: true },
    milestones: { drafts: 0, needsPublish: false },
    genet: null,
  };

  // The owner chose the same colour as 収集の失敗's (#285).
  test("shows a data's drafts as something to do, with the mark when its JSON needs 「本番に反映」", () => {
    expect(badgeFor('footprints', 3, drafts)).toEqual({ count: 12, due: true, needsPublish: true });
  });

  test('shows no number for no draft', () => {
    expect(badgeFor('subscribers', 3, drafts)).toEqual({ count: null, due: true, needsPublish: false });
  });

  // Not knowing must not read as "nothing to do".
  test('shows nothing for a data that could not be read', () => {
    expect(badgeFor('sets', 3, drafts)).toEqual({ count: null, due: false, needsPublish: false });
    expect(badgeFor('footprints', 3, null)).toEqual({ count: null, due: false, needsPublish: false });
  });

  test('shows 収集の失敗 as something to do', () => {
    expect(badgeFor('inbox-collect', 3, drafts)).toEqual({ count: 3, due: true, needsPublish: false });
    expect(badgeFor('inbox-collect', 0, drafts).count).toBeNull();
    expect(badgeFor('inbox-collect', null, drafts).count).toBeNull();
  });

  test('shows nothing beside an item that counts nothing', () => {
    expect(badgeFor('channels', 3, drafts)).toEqual({ count: null, due: false, needsPublish: false });
  });
});
