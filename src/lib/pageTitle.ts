import { unescapeHtml } from '@nanase/alnilam/string';

/**
 * `<title>` for one member's or one video's own page - built to match
 * `worker/src/pages/index.ts`'s `titleFor` exactly, character for character.
 *
 * That function runs in the worker, ahead of `/members/<id>` and
 * `/videos/<id>` ever reaching a browser, and only there: `worker/tsconfig.json`
 * shares no lib, global or path alias with this tree on purpose, since the
 * worker runs on workerd and this runs on nothing but a browser. A fresh
 * request gets its title from the worker, but picking a different member or
 * video inside an already-open page does not ask the worker again - nothing
 * short of a reload would - so the page has to build the same string itself.
 * These two functions are that string, kept in the one place on this side of
 * the boundary, so a page never assembles it inline and risks drifting from
 * the worker's own copy. `unescapeHtml` is the same function
 * `src/components/genet/MarkDown.vue` already uses for the same reason the
 * worker does: a stored name or title can carry `&quot;`/`&amp;`/`&#39;` as
 * literal text rather than the characters they stand for.
 *
 * Changing either string means changing `titleFor` too, by hand - test cases
 * here are copied from `worker/test/pages.test.ts`'s own, so a mismatch
 * shows up as a failing assertion on both sides rather than only one.
 */
export function memberPageTitle(name: string): string {
  return `${unescapeHtml(name)} - けもV メンバー`;
}

export function videoPageTitle(title: string): string {
  return `${unescapeHtml(title)} - けもV 配信・動画`;
}
