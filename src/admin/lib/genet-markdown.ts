/**
 * The Markdown convention ジェネット楽曲一覧's own fields share (#141,
 * #144): every write box gets the same 4 insert buttons (Wikipedia / 英語版 /
 * 配信の時刻 / URL), regardless of which entity or field it belongs to - a
 * tune's title, a performance's description, all the same shape. Rendering
 * this Markdown back is `src/components/genet/MarkDown.vue`'s own job (the
 * public site's real renderer, reused here for the preview rather than a
 * second copy of its link-scheme mapping); this file is only what the 4
 * buttons themselves write.
 */

export type MdLinkKind = 'wiki' | 'wikien' | 'yt' | 'url';

/** The fixed-shape Markdown one of the 4 insert buttons writes - `target` is a bare article name/video-id-and-seconds for wiki/wikien/yt, or the full URL itself for url. */
export function mdSnippet(kind: MdLinkKind, label: string, target: string): string {
  const href = kind === 'url' ? target : `${kind}:${target}`;

  return `[${label}](${href})`;
}

/** `snippet` spliced into `text` at `[start, end)`, with the cursor left just after it - the plain-value half of "insert at the caret", so it is testable without a real `<textarea>`. */
export function insertAt(text: string, start: number, end: number, snippet: string): { text: string; cursor: number } {
  const next = text.slice(0, start) + snippet + text.slice(end);

  return { text: next, cursor: start + snippet.length };
}

/** Seconds as `配信の時刻` picker's own clock reading - `h:mm:ss` past the first hour, `m:ss` before it. */
export function clock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** A `yt:` link's own target (`<videoId>` or `<videoId>?t=<seconds>`), split back into its id and offset - the read side of what `mdSnippet('yt', ...)` writes. */
export function ytParts(target: string): { videoId: string; seconds: number } {
  const match = /^([^?]+)(?:\?t=(\d+))?/.exec(target);

  return { videoId: match?.[1] ?? '', seconds: match?.[2] !== undefined ? Number(match[2]) : 0 };
}
