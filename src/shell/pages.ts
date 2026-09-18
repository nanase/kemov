export type PageId = 'footprints' | 'stats' | 'members' | 'videos' | 'genet';

export interface NavItem {
  /** Matched against SiteNav's `current` to mark the page being read. */
  id: string;
  label: string;
  href: string;
}

/** The site's pages, in the order the navigation lists them. */
export const SITE_PAGES: readonly NavItem[] = [
  { id: 'footprints', label: 'あしあと', href: '/' },
  { id: 'stats', label: '統計', href: '/stats/' },
  { id: 'members', label: 'メンバー', href: '/members/' },
  { id: 'videos', label: '配信・動画', href: '/videos/' },
  { id: 'genet', label: 'ジェネット楽曲一覧', href: '/genet/music/' },
];
