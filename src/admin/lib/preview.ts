import { useStoredChoice } from '../../lib/useStoredChoice';

/**
 * Whether the プレビュー beside an edit panel is open. Closed until opened:
 * it is wanted now and then, not on every row. One value for every screen,
 * kept in this browser, so a reader who works with it open finds it open.
 */
export const previewOpen = useStoredChoice('kemov-admin-preview', [false, true], false);

/** Where a change shows once saved, for the line under a preview. */
export const PREVIEW_NOTES = {
  published: '保存したあと「公開」で「いま公開する」を押すまで、公開ページは変わりません',
  live: '保存すると、そのまま公開ページに出ます',
} as const;

/** The published JSON's field names, as the edit panel calls them. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  date_precision: '日付の細かさ',
  start_date: '日付',
  starts_at: '開始の時刻',
  end_date: '終わりの日',
  kind: '種類',
  title: '題',
  video_id: '動画 ID',
  url: '出典の URL',
  channel_id: 'メンバー',
  reached_date: '達成の日',
  subscriber_count: '人数',
  announced_by: '誰の公表か',
};

/** What to say when the public page could not read a field. */
export function unreadableField(field: string): string {
  return `「${FIELD_LABELS[field] ?? field}」が、公開ページで読めない形です`;
}
