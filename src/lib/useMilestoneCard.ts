import { nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';

/**
 * Which milestone's card is open on one chart, and the keyboard around it.
 *
 * One card at a time. Opening moves focus into the card, so a screen reader
 * reads it out; Escape or the close button hands focus back to the point
 * that opened it. Pressing anywhere outside the card or its point closes it
 * without moving focus, which is what a pointer user expects.
 */
export function useMilestoneCard() {
  const openId = ref<number | null>(null);
  const prefix = useId();
  let opener: HTMLElement | null = null;

  /** The id the card for `milestoneId` carries, for `aria-controls`. */
  const cardId = (milestoneId: number) => `${prefix}-milestone-${milestoneId}`;

  function close(returnFocus: boolean) {
    if (openId.value === null) return;

    openId.value = null;

    if (returnFocus) opener?.focus();

    opener = null;
  }

  async function toggle(milestoneId: number, event: Event) {
    if (openId.value === milestoneId) {
      close(false);

      return;
    }

    opener = event.currentTarget as HTMLElement | null;
    openId.value = milestoneId;
    await nextTick();
    document.getElementById(cardId(milestoneId))?.focus();
  }

  function onPointerDown(event: PointerEvent) {
    if (openId.value === null) return;

    const target = event.target as Node | null;

    if (target === null) return;
    if (opener?.contains(target)) return;
    if (document.getElementById(cardId(openId.value))?.contains(target)) return;

    close(false);
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && openId.value !== null) close(true);
  }

  onMounted(() => {
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
  });

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('keydown', onKeyDown);
  });

  return { openId, cardId, toggle, close };
}
