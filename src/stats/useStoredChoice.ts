import { ref, watch, type Ref } from 'vue';

/**
 * A choice the reader made, kept in localStorage for next time.
 *
 * What is stored is `String(value)` and nothing more: `subscriberCount`, `60`,
 * `true`. That is the form these keys were first written in, so a reader's
 * earlier choice carries over. It is also why no JSON is involved.
 *
 * The store hands back whatever is in it, not what the page can draw: an id an
 * older version offered, a hand edit, an empty string. A value counts only if
 * it is one of `allowed`, and anything else starts the reader off at
 * `fallback`, the way parseThemeSetting reads the theme.
 *
 * Reading and writing both go through try/catch. A private window, storage
 * switched off and a full quota all throw, and in each the page still runs on
 * `fallback` and holds what the reader picks until they leave it.
 *
 * Another tab's change is not followed. What this page keeps only decides
 * where a reader starts, so a screen already open is not switched under them.
 */
export function useStoredChoice<T extends string | number | boolean>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): Ref<T> {
  const choice = ref(readChoice(key, allowed, fallback)) as Ref<T>;

  // Sync, so that a choice made just before the page is left is still kept.
  watch(choice, (value) => writeChoice(key, value), { flush: 'sync' });

  return choice;
}

function readChoice<T extends string | number | boolean>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const raw = localStorage.getItem(key);

    return allowed.find((value) => String(value) === raw) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeChoice(key: string, value: string | number | boolean): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // The choice holds until the page is left, and is not there next time.
  }
}
