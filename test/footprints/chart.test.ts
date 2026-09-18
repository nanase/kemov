import {
  chartLane,
  chartLayout,
  chartTime,
  dragged,
  scrollForStrip,
  stripWindow,
  visibleMonths,
} from '@/footprints/chart';

/**
 * The large trajectory's measurements.
 *
 * The record is longer than any screen at the closer zooms, so what matters
 * here is that the track is as long as the zoom says, that only the part on
 * screen is asked for, and that dragging the strip keeps hold of the day it
 * was grabbed by.
 */

const MONTHS = 65;

describe('chartLayout', () => {
  test('fits the whole record on screen at the widest zoom', () => {
    const layout = chartLayout(900, 12, MONTHS, 'all', 600);

    expect(layout.track).toEqual(layout.view);
  });

  test('keeps a year across the screen at the middle zoom', () => {
    const layout = chartLayout(900, 12, MONTHS, 'year', 600);

    expect(layout.track / layout.view).toBeCloseTo(MONTHS / 12, 5);
  });

  test('keeps a month across the screen at the closest zoom', () => {
    const layout = chartLayout(900, 12, MONTHS, 'month', 600);

    expect(layout.track / layout.view).toBeCloseTo(MONTHS, 5);
  });

  // A record shorter than the window has nowhere to scroll to either.
  test('never makes the track shorter than the screen', () => {
    const layout = chartLayout(900, 12, 6, 'year', 600);

    expect(layout.track).toEqual(layout.view);
  });

  test('drops the names when there is no room for them', () => {
    expect(chartLayout(900, 12, MONTHS, 'all', 600).labels).toBeGreaterThan(0);
    expect(chartLayout(420, 12, MONTHS, 'all', 600).labels).toEqual(0);
  });

  test('packs the rows closer as members are added, within limits', () => {
    const few = chartLayout(900, 4, MONTHS, 'all', 600);
    const many = chartLayout(900, 30, MONTHS, 'all', 600);

    expect(many.laneHeight).toBeLessThan(few.laneHeight);
    expect(many.laneHeight).toBeGreaterThanOrEqual(16);
    expect(few.laneHeight).toBeLessThanOrEqual(30);
  });

  test('puts each lane below the last', () => {
    const layout = chartLayout(900, 12, MONTHS, 'all', 600);

    expect(chartLane(layout, 1) - chartLane(layout, 0)).toEqual(layout.laneHeight);
  });

  test('spreads the months evenly along the track', () => {
    const layout = chartLayout(900, 12, MONTHS, 'year', 600);

    expect(chartTime(layout, 0, MONTHS)).toEqual(0);
    expect(chartTime(layout, MONTHS, MONTHS)).toEqual(layout.track);
  });
});

describe('visibleMonths', () => {
  // Only the part on screen is drawn: a month-wide zoom over five years is a
  // track tens of thousands of pixels long.
  test('asks for the months on screen and a little either side', () => {
    const layout = chartLayout(900, 12, MONTHS, 'month', 600);
    const seen = visibleMonths(layout, 0, MONTHS);

    expect(seen.from).toEqual(0);
    expect(seen.to).toBeLessThan(5);
  });

  test('follows the scroll along the track', () => {
    const layout = chartLayout(900, 12, MONTHS, 'month', 600);
    const seen = visibleMonths(layout, layout.track / 2, MONTHS);

    expect(seen.from).toBeGreaterThan(MONTHS / 2 - 4);
    expect(seen.to).toBeLessThan(MONTHS / 2 + 5);
  });

  test('never asks for a month outside the record', () => {
    const layout = chartLayout(900, 12, MONTHS, 'year', 600);
    const seen = visibleMonths(layout, layout.track, MONTHS);

    expect(seen.to).toEqual(MONTHS);
  });
});

describe('the strip below the chart', () => {
  const layout = chartLayout(900, 12, MONTHS, 'year', 600);

  test('shows the whole record, with the visible slice as a window', () => {
    const start = stripWindow(layout, 0);

    expect(start.from).toEqual(0);
    expect(start.width).toBeCloseTo((layout.view / layout.track) * layout.view, 5);
  });

  test('moves the window along as the chart is scrolled', () => {
    expect(stripWindow(layout, layout.track / 2).from).toBeCloseTo(layout.view / 2, 5);
  });

  // Without the offset the window jumps its own left edge to the pointer the
  // moment it is touched, which reads as the chart being pushed rather than
  // held.
  test('keeps the point it was grabbed by under the pointer', () => {
    const scroll = layout.track / 3;
    const grabbed = stripWindow(layout, scroll).width / 2;
    const pointer = stripWindow(layout, scroll).from + grabbed;

    expect(scrollForStrip(layout, pointer, grabbed)).toBeCloseTo(scroll, 3);
  });

  test('stops at both ends of the record', () => {
    expect(scrollForStrip(layout, -500, 0)).toEqual(0);
    expect(scrollForStrip(layout, 5000, 0)).toEqual(layout.track - layout.view);
  });
});

describe('telling a drag from a tap', () => {
  test('lets a mouse move 5px and a finger 10 before it counts as a drag', () => {
    const from = { x: 100, y: 100 };

    expect(dragged(from, { x: 104, y: 100 }, 'mouse')).toBe(false);
    expect(dragged(from, { x: 106, y: 100 }, 'mouse')).toBe(true);
    expect(dragged(from, { x: 108, y: 100 }, 'touch')).toBe(false);
    expect(dragged(from, { x: 111, y: 100 }, 'touch')).toBe(true);
  });

  test('counts a move in either direction', () => {
    expect(dragged({ x: 100, y: 100 }, { x: 100, y: 120 }, 'mouse')).toBe(true);
  });
});
