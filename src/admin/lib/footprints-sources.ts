import { getJson } from './api';
import { judgeSources, type SourceMark, type SourcesJudgement } from './source-check';
import type { SourceWhitelistEntry } from './source-whitelist';

/**
 * How the あしあと screens show whether an event's sources are enough
 * (#277's decisions 2a and 2b, #282). The judgement itself is
 * source-check.ts's, which the worker uses for the public JSON as well.
 */

export const SOURCE_TEXT = {
  whitelist: 'ホワイトリスト',
  enough: '出典は足りています',
  shortTitle: '出典が足りません',
  shortChip: '出典不足',
  shortOnly: '出典不足だけ',
} as const;

/** The chip beside one source, or null for a URL that names no host. */
export function markLabel(mark: SourceMark): string | null {
  if (mark.kind === 'whitelist') return SOURCE_TEXT.whitelist;
  if (mark.kind === 'none') return null;

  return mark.sameSite ? `${mark.host}（同じサイト）` : mark.host;
}

/** What the sources panel says when they are not enough. `onlyHost` is `SourcesJudgement`'s. */
export function shortfallMessage(onlyHost: string | null): string {
  const now = onlyHost === null ? 'いまは出典がありません。' : `いまは ${onlyHost} の出典しかありません。`;

  return `ホワイトリストに載った出典を 1 つ足すか、別のサイトの出典を足してください。${now}足りないまま公開すると、年表に「出典の確認待ち」と出ます。`;
}

/** `judgeSources` for an event's or a form's sources. */
export function judgeEventSources(
  event: { sources: readonly { url: string }[] },
  whitelist: readonly string[],
): SourcesJudgement {
  return judgeSources(
    event.sources.map((source) => source.url),
    whitelist,
  );
}

/**
 * Whether `event` is short of sources. False while the whitelist is not known
 * (`null`): a row is not called short on a list that could not be read.
 */
export function isShortOfSources(
  event: { sources: readonly { url: string }[] },
  whitelist: readonly string[] | null,
): boolean {
  return whitelist !== null && !judgeEventSources(event, whitelist).enough;
}

/** The whitelist's prefixes, as `GET /admin/api/source-whitelist` lists them. */
export async function readWhitelistPrefixes(): Promise<string[]> {
  const body = await getJson<{ sourceWhitelist: SourceWhitelistEntry[] }>('/source-whitelist');

  return body.sourceWhitelist.map((entry) => entry.prefix);
}
