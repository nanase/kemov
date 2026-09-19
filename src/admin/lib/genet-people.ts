/**
 * Pure logic for ジェネット楽曲一覧's people (#141, #144) - `genet_person`,
 * shared across every tune that credits them. Kept apart from SetsPage.vue
 * so it can be tested without touching the DOM, the same split every other
 * admin screen's own lib file uses.
 */

/** `present()`'s own shape in `worker/src/admin/genet-people.ts`. */
export interface GenetPerson {
  personId: number;
  name: string;
  link: string | null;
  memo: string | null;
}

const LINK_PREFIXES = ['wiki:', 'wikien:', 'https://'] as const;

export type PersonFieldKey = 'name' | 'link' | 'memo';

const FIELD_MARKERS: [RegExp, PersonFieldKey][] = [
  [/^name /, 'name'],
  [/^link /, 'link'],
  [/^memo /, 'memo'],
];

/** Which field a save's 400 message is about, or null when it names none this screen tracks. */
export function fieldForSaveError(message: string): PersonFieldKey | null {
  for (const [pattern, field] of FIELD_MARKERS) {
    if (pattern.test(message)) return field;
  }

  return null;
}

/** `link` must start with one of these, or be null - the same check the worker itself makes. */
export function linkIsWellFormed(link: string): boolean {
  return LINK_PREFIXES.some((prefix) => link.startsWith(prefix));
}
