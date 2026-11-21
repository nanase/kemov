import { ref, type Ref } from 'vue';

/**
 * The whole list's count, for 「12 / 40 件」 (list-count.ts), for a list the
 * worker filters: a filtered answer cannot say how many rows there are in
 * all. An unfiltered load gives it for free; while a filter is on, the
 * whole list is read once more, and again only after `invalidate` - a row
 * was added or deleted - rather than on every keystroke in a search box.
 */
export function useListTotal(readTotal: () => Promise<number>): {
  total: Ref<number | null>;
  update: (shown: number, filtered: boolean) => void;
  invalidate: () => void;
} {
  const total = ref<number | null>(null);
  let stale = true;
  let generation = 0;

  /** Called after each load of the list, with what it showed. */
  function update(shown: number, filtered: boolean): void {
    if (!filtered) {
      generation++;
      total.value = shown;
      stale = false;
      return;
    }

    if (!stale && total.value !== null) return;

    stale = false;

    const asked = ++generation;

    readTotal().then(
      (count) => {
        if (asked === generation) total.value = count;
      },
      () => {
        if (asked !== generation) return;

        total.value = null;
        stale = true;
      },
    );
  }

  function invalidate(): void {
    stale = true;
  }

  return { total, update, invalidate };
}
