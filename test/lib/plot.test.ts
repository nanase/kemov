import { plotOf } from '@/lib/plot';

/**
 * Where a series' bars and its line go.
 *
 * Shared by the small charts on more than one page: every scale here is taken
 * inside the series handed in, which is what keeps a chart from saying
 * anything about a member it was not given (#134, #136).
 */

describe('plotOf', () => {
  test('gives a bar per month that has one', () => {
    const plot = plotOf([null, 4, 0, 2], 'flow');

    expect(plot.bars.map((bar) => bar.index)).toEqual([1, 3]);
    expect(plot.width).toEqual(4);
  });

  // Each row is scaled inside itself (#134): the tallest bar fills the row
  // whatever the numbers are, so no two members can be read against each other.
  test('scales to the series own largest value', () => {
    const small = plotOf([1, 2], 'flow');
    const large = plotOf([1000, 2000], 'flow');

    expect(small.bars[1]!.height).toBeCloseTo(large.bars[1]!.height);
  });

  test('puts a negative bar under the baseline', () => {
    const plot = plotOf([10, -5], 'flow');

    expect(plot.bars[0]!.y).toBeLessThan(plot.baseline);
    expect(plot.bars[1]!.y).toEqual(plot.baseline);
  });

  test('draws a line and its area for a level', () => {
    const plot = plotOf([100, 120, 150], 'level');

    expect(plot.line.startsWith('M')).toBe(true);
    expect(plot.area.endsWith('Z')).toBe(true);
  });

  // The subscriber history starts with one reading (#125). It has to draw
  // something rather than throw - and something with an area, because a shape
  // between one x and the same x is invisible however solid its fill.
  test('draws a single reading as a column, not as a line of no width', () => {
    const plot = plotOf([null, null, 1000], 'level');
    const xs = [...plot.area.matchAll(/[ML](-?[\d.]+),/g)].map(([, x]) => Number(x));

    expect(plot.line).toEqual('');
    expect(plot.area).not.toEqual('');
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.1);
  });

  // A month nobody read is a hole, so the line stops at it and starts again
  // after it rather than crossing the gap as if the count had been read.
  test('breaks the line at a month with no reading', () => {
    const plot = plotOf([100, 120, null, 150, 160], 'level');

    expect(plot.line.match(/M/g)).toHaveLength(2);
    expect(plot.area.match(/Z/g)).toHaveLength(2);
  });

  test('draws nothing at all for a series with no readings', () => {
    const plot = plotOf([null, null], 'level');

    expect(plot.line).toEqual('');
    expect(plot.area).toEqual('');
    expect(plot.bars).toEqual([]);
  });

  test('survives an empty series', () => {
    expect(plotOf([], 'flow')).toMatchObject({ width: 1, bars: [] });
  });
});
