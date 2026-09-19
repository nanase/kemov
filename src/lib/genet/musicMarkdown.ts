/**
 * The small Markdown this page's data carries (#139, #144's genet music
 * page) - a hand-rolled lexer matching the confirmed mock's own (`lex`/
 * `plain`/`expand`/`md`), not `marked`: the only syntax in this data is
 * `\`-escapes, newlines and `[text](href)` links (`wiki:`/`wikien:`/`yt:`/a
 * bare `https://` URL). `unescapeHtml` decodes `&quot;`/`&amp;`/`&#39;` left
 * in the data, the same treatment `src/components/genet/MarkDown.vue`
 * already gives the old page's own Markdown.
 */
import { unescapeHtml } from '@nanase/alnilam/string';

export type MdToken = { type: 'text'; text: string } | { type: 'br' } | { type: 'link'; text: string; href: string };

/** `source`, split into text/br/link tokens. Text is already entity-decoded; nothing here is HTML-escaped yet. */
export function lexMarkdown(source: string): MdToken[] {
  const tokens: MdToken[] = [];
  let buffer = '';
  let i = 0;

  function flush(): void {
    if (buffer !== '') {
      tokens.push({ type: 'text', text: unescapeHtml(buffer) });
      buffer = '';
    }
  }

  while (i < source.length) {
    const ch = source.charAt(i);

    if (ch === '\\' && i + 1 < source.length) {
      buffer += source.charAt(i + 1);
      i += 2;
      continue;
    }

    if (ch === '\n') {
      flush();
      tokens.push({ type: 'br' });
      i += 1;
      continue;
    }

    if (ch === '[') {
      const closeBracket = source.indexOf('](', i);

      if (closeBracket > i) {
        // The href can itself contain parens (a Wikipedia URL sometimes
        // does), so the close paren is found by depth rather than by the
        // first `)`.
        let k = closeBracket + 2;
        let depth = 1;

        while (k < source.length && depth > 0) {
          if (source.charAt(k) === '(') depth += 1;
          else if (source.charAt(k) === ')') depth -= 1;
          k += 1;
        }

        if (depth === 0) {
          flush();
          tokens.push({
            type: 'link',
            text: plainText(source.slice(i + 1, closeBracket)),
            href: source.slice(closeBracket + 2, k - 1),
          });
          i = k;
          continue;
        }
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();

  return tokens;
}

/** `source` with its Markdown stripped, entities decoded - a link's own label, or a whole field read as plain text. */
export function plainText(source: string): string {
  return lexMarkdown(source)
    .map((t) => (t.type === 'br' ? ' ' : t.type === 'text' ? t.text : t.text))
    .join('');
}

/** A link's `href` resolved to a real URL, or null when it names no scheme this page reads (never happens in practice, but a save could carry anything). */
export function expandLink(href: string): string | null {
  const wiki = /^wiki:(.*)$/.exec(href);

  if (wiki) return `https://ja.wikipedia.org/wiki/${wiki[1]}`;

  const wikien = /^wikien:(.*)$/.exec(href);

  if (wikien) return `https://en.wikipedia.org/wiki/${wikien[1]}`;

  const yt = /^yt:([^?]+)(?:\?(.*))?$/.exec(href);

  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}${yt[2] ? `&${yt[2]}` : ''}`;

  if (/^https?:\/\//.test(href)) return href;

  return null;
}

/** A `yt:<videoId>` or `yt:<videoId>?t=<seconds>` href, split back into its parts - the read side of what a 配信の時刻 insert writes. */
export function parseYoutubeHref(href: string): { videoId: string; seconds: number } | null {
  const m = /^yt:([^?]+)(?:\?t=(\d+))?/.exec(href);

  if (!m) return null;

  return { videoId: m[1]!, seconds: m[2] !== undefined ? Number(m[2]) : 0 };
}
