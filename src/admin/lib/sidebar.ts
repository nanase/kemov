/**
 * The sidebar's 3 groups and their order (#141, #144's handoff) - the same
 * order and names as the public site's own nav. Every destination is listed
 * even though only `footprints` and `publish` have a real screen this task;
 * the rest answer through `PlaceholderPage.vue` until a later task builds
 * them.
 *
 * `count` is left undefined everywhere but `publish`: #144's handoff is
 * explicit that only `GET /admin/api/footprints/pending` is countable today,
 * and every other item shows its name alone rather than a wrong or stale
 * number.
 */
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
    items: [
      { page: 'inbox-review', name: '確認待ち' },
      { page: 'inbox-source', name: '出典の確認待ち' },
      { page: 'inbox-collect', name: '収集の失敗' },
      { page: 'inbox-publish', name: '公開待ち' },
    ],
  },
  {
    label: 'データ',
    items: [
      { page: 'snaps', name: '統計' },
      { page: 'footprints', name: 'あしあと' },
      { page: 'channels', name: 'メンバー' },
      { page: 'videos', name: '配信・動画' },
      { page: 'sets', name: 'ジェネット楽曲一覧' },
    ],
  },
  {
    label: '運用',
    items: [
      { page: 'publish', name: '公開' },
      { page: 'history', name: '版の履歴' },
    ],
  },
];

export interface FootprintsPending {
  pending: unknown[];
  changed: unknown[];
}

/** `公開` badge: how many footprints entities `GET /admin/api/footprints/pending` says need attention. */
export function publishBadgeCount(pending: FootprintsPending): number {
  return pending.pending.length + pending.changed.length;
}

/** The sidebar's own name for a page id, for the topbar's breadcrumb - '' for an id no group lists. */
export function pageTitle(page: string): string {
  for (const group of SIDEBAR_GROUPS) {
    const item = group.items.find((i) => i.page === page);

    if (item !== undefined) return item.name;
  }

  return '';
}
