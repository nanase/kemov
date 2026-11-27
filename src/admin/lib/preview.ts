import { useStoredChoice } from '../../lib/useStoredChoice';

/**
 * Whether the プレビュー beside an edit panel is open. Closed until opened:
 * it is wanted now and then, not on every row. One value for every screen,
 * kept in this browser, so a reader who works with it open finds it open.
 */
export const previewOpen = useStoredChoice('kemov-admin-preview', [false, true], false);

/**
 * Which public reads the previews may still use (lib/public-data.ts). Kept
 * here rather than there, so a page that publishes can say so without
 * loading the public site's API client.
 */
let generation = 0;

/** The current generation; a read kept from an older one is read again. */
export function publicDataGeneration(): number {
  return generation;
}

/** Something the public pages read has changed: the next preview reads it again. */
export function forgetPublicData(): void {
  generation += 1;
}

/** The published JSON's field names, as the edit panel calls them. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  date_precision: '日付の精度',
  start_date: '日付',
  starts_at: '開始の時刻',
  end_date: '終わりの日',
  kind: '種類',
  title: 'タイトル',
  video_id: '動画 ID',
  url: '出典の URL',
  channel_id: 'メンバー',
  reached_date: '達成日',
  subscriber_count: '登録者数',
  announced_by: '公表者',
  published_at: '公開日時',
  platform: 'プラットフォーム',
  video_type: '種別',
  style: '場面の種類',
  start_seconds: '秒',
  person_id: '人物',
};

/** What to say when the public page could not read a field. */
export function unreadableField(field: string): string {
  return `「${FIELD_LABELS[field] ?? field}」の形式が正しくありません`;
}
