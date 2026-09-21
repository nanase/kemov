/**
 * The 状態 chip and the words about the two publish steps (#185), shared by
 * あしあと and ジェネット楽曲一覧. Publishing is two steps: 「公開待ちにする」
 * on a row changes its `status`, and only 「いま公開する」 on the 公開 screen
 * writes the public JSON. `status` alone cannot tell the two apart - it does
 * not change in the second step - so a chip built from it says 公開 for a row
 * the public site does not have yet.
 */

export interface PublishMark {
  label: string;
  /** Doubles as the chip's CSS class, so a tone without a rule in shell.css draws as the plain chip. */
  tone: 'draft' | 'review' | 'waiting' | 'published' | 'unknown';
}

/**
 * The chip for a row whose `status` is `status`.
 *
 * `waiting` is whether the row's latest revision is newer than the last
 * 「いま公開する」 (`isWaiting` in footprints-publish.ts and genet-publish.ts
 * answer it), or null when that could not be read. Only a `published` row
 * splits on it. A null is its own label rather than 公開: the pending list
 * failing to load must not read as "the public site has it".
 *
 * The filter stays on `status`, which is what the database can query, so the
 * filter's options are not this chip's labels.
 */
export function publishMarkFor(status: string, waiting: boolean | null): PublishMark {
  if (status === 'published') {
    if (waiting === null) return { label: '公開（未確認）', tone: 'unknown' };

    return waiting ? { label: '公開待ち', tone: 'waiting' } : { label: '公開', tone: 'published' };
  }

  return status === 'review' ? { label: '確認中', tone: 'review' } : { label: '下書き', tone: 'draft' };
}

export const PUBLISH_QUEUED_TOAST = '公開待ちにしました。「公開」画面で「いま公開する」を押すと本番に反映されます';

export const WITHDRAW_QUEUED_TOAST = '下書きに戻しました。「公開」画面で「いま公開する」を押すと本番から消えます';

export interface PublishNotice {
  title: string;
  body: string;
}

/**
 * What a row's own screen says while the row is waiting for 「いま公開する」.
 * The toast above is gone in a moment; this stays until the second step is
 * done, wherever the row is opened from. A row that is not `published` is
 * waiting to be taken off the public site.
 */
export function waitingNoticeFor(status: string): PublishNotice {
  return status === 'published'
    ? { title: '公開待ち', body: '本番にはまだ出ていません。「公開」で「いま公開する」を押すと反映されます' }
    : {
        title: '取り下げはまだ反映されていません',
        body: '「公開」画面で「いま公開する」を押すと本番から消えます',
      };
}

/** What a row's own screen says when it changed after it was published. */
export const CHANGED_NOTICE: PublishNotice = {
  title: '公開後の変更があります',
  body: '本番に出ているのは変更前の内容です。「公開待ちにする」を押すと、いまの内容が公開待ちに入ります。',
};

/** Why a row on the 公開 screen's 「公開後に変更があった行」 list stays there after 「いま公開する」. */
export const CHANGED_ROWS_HINT =
  '「いま公開する」を押してもこの行は変わりません。行の画面で「公開待ちにする」を押すと、いまの内容が公開待ちに入ります。';
