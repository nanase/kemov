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
  let reading = false;
  let generation = 0;

  /** Called after each load of the list, with what it showed. */
  function update(shown: number, filtered: boolean): void {
    if (!filtered) {
      generation++;
      reading = false;
      total.value = shown;
      stale = false;
      return;
    }

    // One read at a time: a search box typed into while the first read is
    // on its way would otherwise start one per keystroke.
    if (reading || (!stale && total.value !== null)) return;

    read();
  }

  function read(): void {
    stale = false;
    reading = true;

    const asked = ++generation;

    readTotal().then(
      (count) => {
        if (asked !== generation) return;

        reading = false;
        total.value = count;

        // Invalidated while this read was on its way: a row was added or
        // deleted after the worker counted, so this count may be one off.
        // The load that followed the change found this read running and
        // left it to it, so the replacement is started here.
        if (stale) read();
      },
      () => {
        if (asked !== generation) return;

        reading = false;
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
