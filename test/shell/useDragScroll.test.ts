import {
  DRAG_THRESHOLD,
  EDGE_FADE,
  draggedScrollLeft,
  edgeFades,
  overflows,
  passesDragThreshold,
  revealScrollLeft,
} from '@/shell/useDragScroll';

describe('passesDragThreshold', () => {
  test.each([
    [0, false],
    [DRAG_THRESHOLD, false],
    [-DRAG_THRESHOLD, false],
    [DRAG_THRESHOLD + 1, true],
    [-(DRAG_THRESHOLD + 1), true],
    [DRAG_THRESHOLD + 0.5, true],
  ])('a move of %d px is a drag: %s', (dx, expected) => {
    expect(passesDragThreshold(dx)).toBe(expected);
  });
});

describe('draggedScrollLeft', () => {
  test('moving the mouse left scrolls the band right', () => {
    expect(draggedScrollLeft(40, -160)).toBe(200);
  });

  test('moving the mouse right scrolls the band left', () => {
    expect(draggedScrollLeft(200, 160)).toBe(40);
  });
});

describe('overflows', () => {
  test('only when the content is wider than the band', () => {
    expect(overflows({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toBe(false);
    expect(overflows({ scrollLeft: 0, scrollWidth: 301, clientWidth: 300 })).toBe(true);
  });
});

describe('edgeFades', () => {
  test('no fade when everything fits', () => {
    expect(edgeFades({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 })).toEqual({ left: false, right: false });
  });

  test('only the right fade at the start', () => {
    expect(edgeFades({ scrollLeft: 0, scrollWidth: 600, clientWidth: 300 })).toEqual({ left: false, right: true });
  });

  test('both fades in the middle', () => {
    expect(edgeFades({ scrollLeft: 150, scrollWidth: 600, clientWidth: 300 })).toEqual({ left: true, right: true });
  });

  test('only the left fade at the end', () => {
    expect(edgeFades({ scrollLeft: 300, scrollWidth: 600, clientWidth: 300 })).toEqual({ left: true, right: false });
  });

  test('a fractional position within 1px of an end counts as that end', () => {
    expect(edgeFades({ scrollLeft: 0.5, scrollWidth: 600, clientWidth: 300 }).left).toBe(false);
    expect(edgeFades({ scrollLeft: 299.5, scrollWidth: 600, clientWidth: 300 }).right).toBe(false);
  });
});

describe('revealScrollLeft', () => {
  const view = { left: 100, right: 400 };

  test('leaves an item already clear of both fades where it is', () => {
    expect(revealScrollLeft({ left: 200, right: 300 }, view, 50, EDGE_FADE)).toBe(50);
  });

  test('scrolls right until an item under the right fade clears it', () => {
    // The item ends 20px past the band; it must end EDGE_FADE px inside it.
    expect(revealScrollLeft({ left: 350, right: 420 }, view, 50, EDGE_FADE)).toBe(50 + 20 + EDGE_FADE);
  });

  test('scrolls left until an item under the left fade clears it', () => {
    expect(revealScrollLeft({ left: 110, right: 180 }, view, 50, EDGE_FADE)).toBe(50 - (EDGE_FADE - 10));
  });

  test('an item exactly at the inset stays', () => {
    expect(revealScrollLeft({ left: 100 + EDGE_FADE, right: 400 - EDGE_FADE }, view, 0, EDGE_FADE)).toBe(0);
  });
});
