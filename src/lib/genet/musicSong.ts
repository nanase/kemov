/**
 * What the 楽曲 panel of ジェネット楽曲一覧 draws from a tune, kept apart from
 * `src/genet/music/SongDetail.vue` so the admin site's preview draws a tune
 * being edited with the same code the public page uses.
 */
import { unescapeHtml } from '@nanase/alnilam/string';

import { videoTimeText } from './musicFormat';
import { expandLink, lexMarkdown, parseYoutubeHref } from './musicMarkdown';
import { highlightRanges, type SearchTerm } from './musicSearch';
import type { GenetAttributePerson, GenetPerformance, GenetPerson, GenetStream } from './musicTypes';

/** Where the embedded player is: one video, from one second. */
export interface SongPlay {
  videoId: string;
  seconds: number;
}

/** `text` with `&<>"'` escaped, for HTML built as a string. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * `source`'s Markdown as HTML, with what `terms` match marked. Given `times`,
 * a `yt:` link is followed by a button that plays from its second, pressed
 * while it is what plays; the panel's click handler reads `data-vid` and
 * `data-at` off it.
 */
export function markdownHtml(
  source: string | null,
  terms: readonly SearchTerm[],
  times?: { playing: SongPlay | null },
): string {
  if (!source) return '';

  const highlight = (text: string) => highlightRanges(text, terms, escapeHtml);

  return lexMarkdown(source)
    .map((token) => {
      if (token.type === 'br') return '<br>';
      if (token.type === 'text') return highlight(token.text);

      const url = expandLink(token.href);

      if (!url) return highlight(token.text);

      let html = `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${highlight(token.text)}</a>`;
      const yt = parseYoutubeHref(token.href);

      if (yt && times) {
        const on = times.playing?.videoId === yt.videoId && times.playing?.seconds === yt.seconds;
        html += ` <button type="button" class="tbtn" data-vid="${escapeHtml(yt.videoId)}" data-at="${yt.seconds}" aria-pressed="${on}" aria-label="${videoTimeText(yt.seconds)} から聴く" title="${videoTimeText(yt.seconds)} から聴く">${videoTimeText(yt.seconds)}</button>`;
      }

      return html;
    })
    .join('');
}

/** An attribute's people as one line: each one's name, and their note in brackets. */
export function creditText(credited: readonly GenetAttributePerson[], people: readonly GenetPerson[]): string {
  return credited
    .map(
      (p) =>
        unescapeHtml(people.find((pp) => pp.person_id === p.person_id)?.name ?? '') +
        (p.note ? `（${unescapeHtml(p.note)}）` : ''),
    )
    .join('、');
}

/** What an occurrence needs of its stream: the row's date and title, and whether it performs the tune. */
export type OccurrenceSource = Pick<GenetStream, 'video_id' | 'title' | 'short_title' | 'published_at'> & {
  performances: readonly Pick<GenetPerformance, 'tune_id'>[];
};

export interface TuneOccurrence {
  stream: Pick<GenetStream, 'video_id' | 'title' | 'short_title' | 'published_at'>;
  isCurrent: boolean;
}

/** Every stream in `streams` that performs `tuneId`, once each and in the order given, the one shown now marked. */
export function tuneOccurrences(
  streams: readonly OccurrenceSource[],
  tuneId: number,
  currentVideoId: string | null,
): TuneOccurrence[] {
  return streams
    .filter((stream) => stream.performances.some((p) => p.tune_id === tuneId))
    .map((stream) => ({ stream, isCurrent: stream.video_id === currentVideoId }));
}
