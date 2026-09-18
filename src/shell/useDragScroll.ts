import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

/**
 * Horizontal scrolling for SiteNav's band of links when they do not fit.
 *
 * Touch and pen are left to the browser's own scrolling. A mouse has no such
 * gesture, so a press followed by a horizontal move drags the band. A press
 * released without moving past the threshold stays an ordinary click.
 */

/** How far a mouse must move, in px, before a press becomes a drag. */
export const DRAG_THRESHOLD = 5;

/** The width, in px, of the fade over an edge the band continues past. */
export const EDGE_FADE = 28;

/**
 * Extra room, in px, the first render leaves past the fade when it scrolls
 * the current page into view, so the item does not sit flush against it.
 */
const INITIAL_REVEAL_MARGIN = 8;

export function passesDragThreshold(dx: number): boolean {
  return Math.abs(dx) > DRAG_THRESHOLD;
}

/** The scroll position a drag that started at `startLeft` has reached after moving `dx`. */
export function draggedScrollLeft(startLeft: number, dx: number): number {
  return startLeft - dx;
}

export interface ScrollMetrics {
  scrollLeft: number;
  scrollWidth: number;
  clientWidth: number;
}

export function overflows({ scrollWidth, clientWidth }: ScrollMetrics): boolean {
  return scrollWidth > clientWidth;
}

/**
 * Which edges the band continues past. The 1px tolerance absorbs the
 * fractional scroll positions browsers report at either end.
 */
export function edgeFades({ scrollLeft, scrollWidth, clientWidth }: ScrollMetrics): { left: boolean; right: boolean } {
  return {
    left: scrollLeft > 1,
    right: scrollWidth - clientWidth - scrollLeft > 1,
  };
}

export interface Span {
  left: number;
  right: number;
}

/**
 * The scroll position that brings `item` clear of the band's edges by
 * `inset`, or `scrollLeft` unchanged if it already is. Both spans are in the
 * same coordinates, such as those of getBoundingClientRect.
 */
export function revealScrollLeft(item: Span, view: Span, scrollLeft: number, inset: number): number {
  if (item.left < view.left + inset) return scrollLeft - (view.left + inset - item.left);
  if (item.right > view.right - inset) return scrollLeft + (item.right - (view.right - inset));
  return scrollLeft;
}

function spanOf(element: Element): Span {
  const { left, right } = element.getBoundingClientRect();
  return { left, right };
}

export function useDragScroll(scroller: Ref<HTMLElement | null>) {
  const fadeLeft = ref(false);
  const fadeRight = ref(false);
  const dragging = ref(false);

  let drag: { pointerId: number; x: number; startLeft: number; moving: boolean } | null = null;
  let swallowClick = false;
  let resizeObserver: ResizeObserver | undefined;

  function updateFades() {
    const el = scroller.value;
    if (!el) return;
    const fades = edgeFades(el);
    fadeLeft.value = fades.left;
    fadeRight.value = fades.right;
  }

  function reveal(item: Element, inset: number) {
    const el = scroller.value;
    if (!el) return;
    el.scrollLeft = revealScrollLeft(spanOf(item), spanOf(el), el.scrollLeft, inset);
  }

  /** Scrolls the link marked as the current page into view from the start of the band. */
  function revealCurrent() {
    const el = scroller.value;
    if (!el) return;
    el.scrollLeft = 0;
    const current = el.querySelector('[aria-current="page"]');
    if (current && overflows(el)) reveal(current, EDGE_FADE + INITIAL_REVEAL_MARGIN);
    updateFades();
  }

  function onPointerDown(event: PointerEvent) {
    swallowClick = false;
    const el = scroller.value;
    if (!el || event.pointerType !== 'mouse' || event.button !== 0 || !overflows(el)) return;
    drag = { pointerId: event.pointerId, x: event.clientX, startLeft: el.scrollLeft, moving: false };
  }

  function onPointerMove(event: PointerEvent) {
    const el = scroller.value;
    if (!el || !drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    if (!drag.moving) {
      if (!passesDragThreshold(dx)) return;
      drag.moving = true;
      dragging.value = true;
      el.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    el.scrollLeft = draggedScrollLeft(drag.startLeft, dx);
  }

  function onPointerEnd(event: PointerEvent) {
    const el = scroller.value;
    if (!el || !drag || event.pointerId !== drag.pointerId) return;
    if (drag.moving) {
      swallowClick = true;
      dragging.value = false;
      if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
    }
    drag = null;
  }

  // Registered for the capture phase so the click a drag ends with is dropped
  // before it reaches a link. A click from the keyboard (detail 0) did not
  // come from that drag and goes through.
  function onClick(event: MouseEvent) {
    if (!swallowClick) return;
    swallowClick = false;
    if (event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
  }

  function onDragStart(event: DragEvent) {
    event.preventDefault();
  }

  function onFocusIn(event: FocusEvent) {
    const link = (event.target as Element | null)?.closest('a');
    if (link) reveal(link, EDGE_FADE);
  }

  onMounted(() => {
    const el = scroller.value;
    if (!el) return;
    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('click', onClick, true);
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('focusin', onFocusIn);
    el.addEventListener('scroll', updateFades, { passive: true });
    resizeObserver = new ResizeObserver(updateFades);
    resizeObserver.observe(el);

    revealCurrent();
    // Murecho arrives after the first render and widens the links. Reveal
    // again once it has, unless the reader has already moved the band.
    const revealedLeft = el.scrollLeft;
    document.fonts?.ready.then(() => {
      if (scroller.value === el && el.scrollLeft === revealedLeft) revealCurrent();
    });
  });

  onBeforeUnmount(() => {
    const el = scroller.value;
    resizeObserver?.disconnect();
    if (!el) return;
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerEnd);
    el.removeEventListener('pointercancel', onPointerEnd);
    el.removeEventListener('click', onClick, true);
    el.removeEventListener('dragstart', onDragStart);
    el.removeEventListener('focusin', onFocusIn);
    el.removeEventListener('scroll', updateFades);
  });

  return { fadeLeft, fadeRight, dragging, revealCurrent };
}
