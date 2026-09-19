import { placeSpans, yAt, LANE_STEP, type Anchor, type Span } from '@/footprints/spans';

/**
 * The bands beside the road that mark something running over several days.
 *
 * Where a day falls on the timeline depends on how many rows the months
 * around it happen to hold, so the ends are interpolated between the rows
 * that are on screen. What matters here is that a band reaches the right
 * place and that two overlapping ones never sit on top of one another.
 */

const anchors: Anchor[] = [
  { at: 0, y: 0 },
  { at: 100, y: 50 },
  { at: 200, y: 400 },
];

const span = (over: Partial<Span> = {}): Span => ({ key: 'e:1', title: 'ある催し', from: 0, to: 100, y: 0, ...over });

describe('yAt', () => {
  test('lands on a row it was given', () => {
    expect(yAt(anchors, 0)).toEqual(0);
    expect(yAt(anchors, 100)).toEqual(50);
    expect(yAt(anchors, 200)).toEqual(400);
  });

  // The rows are not evenly spaced: a month of one event and a month of forty
  // streams take very different amounts of the page.
  test('reads between two rows at the spacing those rows actually have', () => {
    expect(yAt(anchors, 50)).toEqual(25);
    expect(yAt(anchors, 150)).toEqual(225);
  });

  // Something still running when the road ends has to stop somewhere, and the
  // end of the road says "at least this far" rather than guessing off-screen.
  test('stops at the nearest end when the day is outside the rows drawn', () => {
    expect(yAt(anchors, -500)).toEqual(0);
    expect(yAt(anchors, 9999)).toEqual(400);
  });

  test('gives back nothing to draw when there are no rows', () => {
    expect(yAt([], 100)).toEqual(0);
  });
});

describe('placeSpans', () => {
  test('reaches from its own row to where it ended', () => {
    const [placed] = placeSpans([span({ from: 0, to: 100, y: 0 })], anchors);

    expect(placed).toMatchObject({ lane: 0, top: 0, height: 50, upwards: false });
  });

  // Two things that ran at the same time, drawn in one column, would read as
  // one longer thing.
  test('moves a band that overlaps another into a column of its own', () => {
    const placed = placeSpans(
      [
        span({ key: 'e:1', from: 0, to: 150, y: 0 }),
        span({ key: 'e:2', from: 50, to: 200, y: 25 }),
        span({ key: 'e:3', from: 100, to: 200, y: 50 }),
      ],
      anchors,
    );

    expect(placed.map((entry) => entry.lane)).toEqual([0, 1, 2]);
  });

  test('gives a column back once the thing in it has finished', () => {
    const placed = placeSpans(
      [span({ key: 'e:1', from: 0, to: 50, y: 0 }), span({ key: 'e:2', from: 100, to: 200, y: 50 })],
      anchors,
    );

    expect(placed.map((entry) => entry.lane)).toEqual([0, 0]);
  });

  test('orders them by when they started, whatever order they arrive in', () => {
    const placed = placeSpans(
      [span({ key: 'e:2', from: 100, to: 200, y: 50 }), span({ key: 'e:1', from: 0, to: 50, y: 0 })],
      anchors,
    );

    expect(placed.map((entry) => entry.key)).toEqual(['e:1', 'e:2']);
  });

  // Newest first turns the road upside down, and the band with it.
  test('knows when a band runs upwards', () => {
    const [placed] = placeSpans([span({ from: 100, to: 0, y: 50 })], anchors);

    expect(placed).toMatchObject({ top: 0, height: 50, upwards: true });
  });

  test('draws a band for a single day rather than nothing at all', () => {
    const [placed] = placeSpans([span({ from: 100, to: 100, y: 50 })], anchors);

    expect(placed!.height).toBeGreaterThanOrEqual(6);
  });

  test('keeps the columns 7px apart, as #140 asks', () => {
    expect(LANE_STEP).toEqual(7);
  });
});
