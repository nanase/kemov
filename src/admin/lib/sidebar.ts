/**
 * The sidebar's 3 groups and their order (#141, #144's handoff, #277's
 * decision 4) - the same names as the public site's own nav.
 *
 * `badgeFor` is what an item shows beside its name: 収集の失敗's count
 * (`GET /admin/api/collect-tasks`), and for the three data that publish, how
 * many drafts they hold and whether their public JSON needs 「本番に反映」
 * (`GET /admin/api/drafts`). Every other item shows its name alone rather
 * than a wrong or stale number, since nothing here can count it.
 */

import type { DraftsResponse } from './sidebar-drafts';

export interface NavItem {
  page: string;
  name: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const SIDEBAR_GROUPS: readonly NavGroup[] = [
  {
    label: 'やること',
    items: [{ page: 'inbox-collect', name: '収集の失敗' }],
  },
  {
    label: 'データ',
    items: [
      { page: 'snaps', name: '統計' },
      { page: 'subscribers', name: '登録者数の節目' },
      { page: 'footprints', name: 'あしあと' },
      { page: 'channels', name: 'メンバー' },
      { page: 'videos', name: '配信・動画' },
      { page: 'sets', name: 'ジェネット楽曲一覧' },
    ],
  },
  {
    label: '運用',
    items: [
      { page: 'history', name: '版の履歴' },
      { page: 'source-whitelist', name: '出典ホワイトリスト' },
    ],
  },
];

const DRAFTS_OF: Readonly<Record<string, keyof DraftsResponse>> = {
  subscribers: 'milestones',
  footprints: 'footprints',
  sets: 'genet',
};

export interface NavBadge {
  /** The number beside the name, or null for none - 0 included. */
  count: number | null;
  /** Whether the number is drawn in the colour of something to do, as 収集の失敗's and the drafts' are (#285). */
  due: boolean;
  /** Whether the triangle that says the public JSON needs 「本番に反映」 is drawn. */
  needsPublish: boolean;
}

/** What `page`'s item shows beside its name. A count or a data that could not be read shows nothing. */
export function badgeFor(page: string, collectFailures: number | null, drafts: DraftsResponse | null): NavBadge {
  if (page === 'inbox-collect') {
    return {
      count: collectFailures !== null && collectFailures > 0 ? collectFailures : null,
      due: true,
      needsPublish: false,
    };
  }

  const key = DRAFTS_OF[page];
  const data = key === undefined ? null : (drafts?.[key] ?? null);

  if (data === null) return { count: null, due: false, needsPublish: false };

  return { count: data.drafts > 0 ? data.drafts : null, due: true, needsPublish: data.needsPublish };
}

export const SIDEBAR_TEXT = {
  needsPublish: '本番に未反映の変更あり',
} as const;

/** The group a page id sits in, for the topbar's breadcrumb - '' for an id no group lists. */
export function pageGroup(page: string): string {
  return SIDEBAR_GROUPS.find((group) => group.items.some((i) => i.page === page))?.label ?? '';
}

/** The sidebar's own name for a page id, for the topbar's breadcrumb - '' for an id no group lists. */
export function pageTitle(page: string): string {
  for (const group of SIDEBAR_GROUPS) {
    const item = group.items.find((i) => i.page === page);

    if (item !== undefined) return item.name;
  }

  return '';
}
