import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

export type SheetName = '' | 'prog' | 'song';

/**
 * The widest the page can be while the program and the song stack over the
 * list. It is the `max-width` of the `@container` rule in MusicApp.vue that
 * does the stacking, and the container it measures is the shell's own box.
 */
export const SHEET_MAX_WIDTH = 719;

/** The shell box the stacking rule measures, matched from the page's own section. */
const SHELL = '.site-shell';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Whether a shell this wide stacks the sheets over the list instead of laying them beside it. */
export function stacksSheets(width: number): boolean {
  return width <= SHEET_MAX_WIDTH;
}

/**
 * Where Tab should land so that it never leaves the dialog: the far end when
 * it would step past one end (or start from outside), `null` to let the
 * browser take the next element itself. `index` is the focused element's place
 * among the dialog's focusable ones, or -1 when focus is outside them.
 */
export function tabWrapTarget(count: number, index: number, backwards: boolean): number | null {
  if (count === 0) return null;

  if (backwards) return index <= 0 ? count - 1 : null;

  return index === -1 || index === count - 1 ? 0 : null;
}

export interface SheetDialogOptions {
  sheet: Readonly<Ref<SheetName>>;
  /** Any element inside the shell; the shell is found from it. */
  root: Readonly<Ref<HTMLElement | null>>;
  panels: Readonly<Record<'prog' | 'song', Readonly<Ref<HTMLElement | null>>>>;
  /** Closes the front sheet, one step. */
  close: () => void;
  /** True while a dialog above the sheet is open and holds the keyboard. */
  suspended: () => boolean;
}

/**
 * The keyboard and screen-reader side of the sheets that stack over the list
 * on a narrow page, in the manner of `useDialogFocus.ts` (footprints) - which
 * is bound to a component that mounts and unmounts, where a sheet is only
 * shown and hidden.
 *
 * Only the front sheet is the dialog: `modal` names it (or is empty when
 * nothing stacks), and everything else on the page, the sheet beneath
 * included, is what it hides from a screen reader. Focus moves into it when
 * it opens and goes back to what opened the first one when the last one
 * closes; Tab stays inside it, and Escape closes it.
 */
export function useSheetDialog({ sheet, root, panels, close, suspended }: SheetDialogOptions) {
  const narrow = ref(false);
  const modal = computed<SheetName>(() => (narrow.value ? sheet.value : ''));

  let observer: ResizeObserver | undefined;
  let opener: HTMLElement | null = null;

  function focusable(panel: HTMLElement): HTMLElement[] {
    return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || modal.value === '' || suspended()) return;

    if (event.key === 'Escape') {
      close();
      return;
    }

    const panel = panels[modal.value].value;

    if (event.key !== 'Tab' || panel === null) return;

    const items = focusable(panel);

    // Nothing to cycle to but the panel itself, which is focusable
    // (tabindex="-1") so that this has somewhere to keep focus.
    if (items.length === 0) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }

    const target = tabWrapTarget(items.length, items.indexOf(document.activeElement as HTMLElement), event.shiftKey);

    if (target !== null) {
      event.preventDefault();
      items[target]!.focus();
    }
  }

  onMounted(() => {
    const shell = root.value?.closest(SHELL);

    if (shell) {
      observer = new ResizeObserver((entries) => {
        narrow.value = stacksSheets(entries[entries.length - 1]!.contentRect.width);
      });
      observer.observe(shell);
    }

    document.addEventListener('keydown', onKeydown);
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    document.removeEventListener('keydown', onKeydown);
  });

  // After the DOM update, so the panel about to take focus is shown, and the
  // element that opened the first sheet is still the one that has focus.
  watch(
    sheet,
    (now, before) => {
      if (!narrow.value) {
        opener = null;
        return;
      }

      if (now === '') {
        opener?.focus({ preventScroll: true });
        opener = null;
        return;
      }

      if (before === '') opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

      panels[now].value?.focus({ preventScroll: true });
    },
    { flush: 'post' },
  );

  return { modal };
}
