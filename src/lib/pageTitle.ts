import { unescapeHtml } from '@nanase/alnilam/string';

/**
 * `<title>` for one member's or one video's own page.
 *
 * `worker/src/pages/index.ts`'s `titleFor` imports these two functions
 * directly and uses them for the very same request - `/members/<id>` and
 * `/videos/<id>`'s first response, built in the worker before either page
 * ever reaches a browser. Picking a different member or video inside an
 * already-open page does not ask the worker again - nothing short of a
 * reload would - so the page builds the same string itself for that case,
 * calling the same two functions again. There is one definition, not two
 * kept in sync: `worker/tsconfig.json` documents that the worker shares no
 * lib, global or path alias with this tree, since it runs on workerd rather
 * than a browser, but this file needs none of that - it is plain string
 * handling, so a relative import across that boundary is enough. See the
 * import in `worker/src/pages/index.ts` for the reasoning on that side.
 * `unescapeHtml` is the same function `src/components/genet/MarkDown.vue`
 * already uses for the same reason: a stored name or title can carry
 * `&quot;`/`&amp;`/`&#39;` as literal text rather than the characters they
 * stand for.
 *
 * Test cases here mirror `worker/test/pages.test.ts`'s own expectations, so a
 * change that breaks the worker's built page shows up here too.
 */
export function memberPageTitle(name: string): string {
  return `${unescapeHtml(name)} - けもV メンバー`;
}

export function videoPageTitle(title: string): string {
  return `${unescapeHtml(title)} - けもV 配信・動画`;
}
