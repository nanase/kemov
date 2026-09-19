import { onBeforeUnmount, onMounted, type Ref } from 'vue';

/**
 * The focus behaviour every footprints dialog needs, on top of whatever
 * `Escape`/arrow-key handling each one already has of its own: Tab cycles
 * between the dialog's own focusable elements without ever reaching whatever
 * is behind it, the dialog starts focused, and closing returns focus to
 * whichever element opened it rather than leaving it on the page's body.
 *
 * `RecordDialog`/`TrailDialog`/`PanelDialog` each hold more than the one
 * button `VideoLightbox.vue` (`src/videos/parts/VideoLightbox.vue`) traps Tab
 * on, so cycling between the first and last focusable element is what this
 * does instead of pinning focus to a single one. Escape stays each dialog's
 * own concern - `RecordDialog` also reads arrow keys on the same listener,
 * so folding Escape in here would split one dialog's keyboard handling
 * across two places for no reason.
 */
export function useDialogFocus(card: Readonly<Ref<HTMLElement | null>>): void {
  let opener: HTMLElement | null = null;

  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /** The dialog's own focusable elements, in tab order, skipping hidden ones. */
  function focusable(): HTMLElement[] {
    if (card.value === null) return [];

    return [...card.value.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.offsetParent !== null);
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Tab') return;

    const items = focusable();

    // Nothing to cycle to but the dialog itself, so Tab stays put rather than
    // leaving it - `card` itself is focusable (`tabindex="-1"`) precisely so
    // this has somewhere to keep focus.
    if (items.length === 0) {
      event.preventDefault();
      card.value?.focus();
      return;
    }

    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    const outside = !items.includes(active as HTMLElement);

    if (event.shiftKey ? active === first || outside : active === last || outside) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  onMounted(() => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.addEventListener('keydown', onKeydown);
    card.value?.focus();
  });

  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onKeydown);
    opener?.focus({ preventScroll: true });
  });
}
