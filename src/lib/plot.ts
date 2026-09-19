/**
 * Where a series' bars and its line go, as plain numbers and path strings.
 *
 * Shared by the small charts on more than one page - and returned rather than
 * drawn, so that what a chart says can be checked without rendering it. Every
 * scale is taken inside the one series handed in: nothing here ever sees two
 * members at once, which is how the rule against comparing them (#134, #136)
 * is kept while drawing.
 */

export interface Bar {
  /** Where the month sits on the shared axis, in months from its start. */
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
}

export interface Plot {
  /** The width of the drawing, in the same units the bars are placed in. */
  width: number;
  height: number;
  bars: Bar[];
  /** The line and the area under it, for a series that is a level rather than a flow. */
  line: string;
  area: string;
  /** Where zero sits, which is the foot of the bars and the line's baseline. */
  baseline: number;
  top: number;
  bottom: number;
}

/** How wide a single reading's column is, in slots. */
const COLUMN = 0.8;

const HEIGHT = 100;

/**
 * Where each month's bar or point goes.
 *
 * Nulls are holes rather than zeros: a month before a member's debut, or one
 * whose subscriber count was never read, has no bar and no point. The scale
 * runs from the series' own smallest value - or zero, whichever is lower - to
 * its own largest, so a quiet member fills the same height as a busy one.
 */
export function plotOf(values: readonly (number | null)[], kind: 'flow' | 'level', barWidth = 0.76): Plot {
  const known = values.filter((v): v is number => v !== null);
  const top = Math.max(1, ...known);
  const bottom = Math.min(0, ...known);
  const span = top - bottom || 1;
  const width = Math.max(1, values.length);
  const scale = (value: number) => ((top - value) / span) * (HEIGHT - 3);
  const baseline = scale(0);

  if (kind === 'level') {
    // Months that were read, in unbroken runs. A month with no reading breaks
    // the run rather than being skipped over: a line drawn straight across the
    // gap would put a reading where there is none.
    const runs: { x: string; y: string }[][] = [];
    let run: { x: string; y: string }[] = [];

    values.forEach((value, index) => {
      if (value === null) {
        if (run.length > 0) runs.push(run);
        run = [];

        return;
      }

      run.push({ x: (index + 0.5).toFixed(3), y: scale(value).toFixed(2) });
    });

    if (run.length > 0) runs.push(run);

    const path = (points: readonly { x: string; y: string }[]) => points.map((p) => `${p.x},${p.y}`).join(' L');

    // One reading cannot be a line, so it is drawn as a column of its own: a
    // shape between one x and the same x has no area at all, and the panel
    // would look broken rather than early while the history fills up (#125).
    const line = runs
      .filter((points) => points.length > 1)
      .map((points) => `M${path(points)}`)
      .join(' ');
    const area = runs
      .map((points) => {
        if (points.length > 1) {
          return `M${points[0]!.x},${HEIGHT} L${path(points)} L${points.at(-1)!.x},${HEIGHT} Z`;
        }

        const only = points[0]!;
        const left = (Number(only.x) - COLUMN / 2).toFixed(3);
        const right = (Number(only.x) + COLUMN / 2).toFixed(3);

        return `M${left},${HEIGHT} L${left},${only.y} L${right},${only.y} L${right},${HEIGHT} Z`;
      })
      .join(' ');

    return { width, height: HEIGHT, bars: [], line, area, baseline: HEIGHT, top, bottom };
  }

  const bars = values.flatMap<Bar>((value, index) => {
    if (value === null || value === 0) return [];

    const height = Math.max(0.8, (Math.abs(value) / span) * (HEIGHT - 3));

    return [
      {
        index,
        x: index + (1 - barWidth) / 2,
        y: value > 0 ? baseline - height : baseline,
        width: barWidth,
        height,
        value,
      },
    ];
  });

  return { width, height: HEIGHT, bars, line: '', area: '', baseline, top, bottom };
}
