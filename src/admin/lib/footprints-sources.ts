import { ref, type Ref } from 'vue';
import { getJson } from './api';
import { judgeSources, sourceUrlProblem, type SourceMark, type SourcesJudgement } from './source-check';
import type { SourceWhitelistEntry } from './source-whitelist';

/**
 * How the あしあと screens show whether an event's sources are enough
 * (#277's decisions 2a and 2b, #282). The judgement itself is
 * source-check.ts's, which the worker uses for the public JSON as well.
 */

export const SOURCE_TEXT = {
  whitelist: 'ホワイトリスト',
  enough: '出典の条件を満たしています',
  shortTitle: '出典不足',
  shortBody: 'ホワイトリストの出典か別のサイトの出典が必要です',
  shortChip: '出典不足',
  shortOnly: '出典不足のみ',
  whitelistUnreadable: '出典ホワイトリストの読み込みに失敗しました',
} as const;

/** The chip beside one source, or null for a URL that names no host. */
export function markLabel(mark: SourceMark): string | null {
  if (mark.kind === 'whitelist') return SOURCE_TEXT.whitelist;
  if (mark.kind === 'none') return null;

  return mark.sameSite ? `${mark.host}（同じサイト）` : mark.host;
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

/**
 * Whether `event` is short of sources whatever the whitelist says: none of
 * its sources is one a save accepts, so none can count. What the preview
 * still knows while the whitelist cannot be read.
 */
export function shortWhateverTheWhitelist(event: { sources: readonly { url: string }[] }): boolean {
  return !event.sources.some((source) => sourceUrlProblem(source.url) === null);
}

/** The whitelist's prefixes, as `GET /admin/api/source-whitelist` lists them. */
async function readWhitelistPrefixes(): Promise<string[]> {
  const body = await getJson<{ sourceWhitelist: SourceWhitelistEntry[] }>('/source-whitelist');

  return body.sourceWhitelist.map((entry) => entry.prefix);
}

/**
 * The whitelist for a screen that judges sources. `whitelist` stays null both
 * while it is on its way and when it could not be read; `failed` tells the
 * two apart, so the sources panel can say it could not be read.
 */
export function useWhitelist(): {
  whitelist: Ref<string[] | null>;
  failed: Ref<boolean>;
  load: () => Promise<void>;
} {
  const whitelist = ref<string[] | null>(null);
  const failed = ref(false);

  async function load(): Promise<void> {
    try {
      whitelist.value = await readWhitelistPrefixes();
      failed.value = false;
    } catch {
      whitelist.value = null;
      failed.value = true;
    }
  }

  return { whitelist, failed, load };
}
