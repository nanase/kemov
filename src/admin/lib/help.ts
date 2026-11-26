/**
 * Where each screen's explanations live (#300): the screens carry only a
 * link, and the words themselves are in docs/guides/admin.md. The anchors are
 * GitHub's slugs of that file's headings, so renaming a heading there means
 * renaming it here.
 */

const HELP_PAGE = 'https://github.com/nanase/kemov/blob/main/docs/guides/admin.md';

export const HELP_SECTIONS = {
  common: '共通',
  footprints: 'あしあと',
  subscribers: '登録者数の節目',
  members: 'メンバー',
  videos: '配信と動画の上書き',
  snaps: '統計',
  sourceWhitelist: '出典ホワイトリスト',
  collect: '収集の失敗',
} as const;

export type HelpSection = keyof typeof HELP_SECTIONS;

export const HELP_TEXT = 'ヘルプ';

export function helpUrl(section: HelpSection): string {
  return `${HELP_PAGE}#${encodeURIComponent(HELP_SECTIONS[section])}`;
}
