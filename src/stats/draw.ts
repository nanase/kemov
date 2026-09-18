/**
 * Turning the page's numbers into the shapes and words it draws.
 *
 * Geometry is returned as plain numbers and path strings so it can be checked
 * without rendering anything. Every scale here is taken inside one series:
 * nothing in this file ever sees two members at once, which is how #134's
 * rule against comparing them is kept while drawing.
 */

export interface Hsl {
  hue: number;
  saturation: number;
  lightness: number;
}

export function toHsl(hex: string): Hsl {
  const value = hex.replace('#', '');
  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;

  if (max === min) return { hue: 0, saturation: 0, lightness };

  const chroma = max - min;
  const saturation = lightness > 0.5 ? chroma / (2 - max - min) : chroma / (max + min);
  const hue =
    max === red
      ? (green - blue) / chroma + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / chroma + 2
        : (red - green) / chroma + 4;

  return { hue: Math.round(hue * 60), saturation, lightness };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * A member's own colour, moved to a lightness that reads against the page.
 *
 * The hue is left alone - it is what tells eleven members apart - and only
 * the lightness is pulled into a band that has enough contrast with the
 * background. Saturation is raised to a floor rather than lowered, so a pale
 * colour does not arrive as grey.
 */
export function memberColor(hex: string, dark: boolean, alpha = 1): string {
  const { hue, saturation, lightness } = toHsl(hex);
  const s = clamp(Math.max(saturation, dark ? 0.42 : 0.46), 0, 0.92);
  const l = dark ? clamp(lightness, 0.6, 0.78) : clamp(lightness, 0.28, 0.42);
  const percent = (v: number) => `${Math.round(v * 100)}%`;

  return `hsl(${hue} ${percent(s)} ${percent(l)}${alpha < 1 ? ` / ${alpha}` : ''})`;
}

/**
 * The same colour, darker or lighter, for the month being pointed at.
 *
 * The page's accent green is not used for this: against a member's own colour
 * it reads as a different thing entirely rather than as the same bar, brought
 * forward.
 */
export function memberAccent(hex: string, dark: boolean): string {
  const { hue, saturation, lightness } = toHsl(hex);
  const s = clamp(Math.max(saturation, 0.5) * 1.15, 0, 0.95);
  const l = dark ? clamp(lightness * 1.2, 0.74, 0.9) : clamp(lightness * 0.72, 0.14, 0.26);

  return `hsl(${hue} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

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
    const points = values
      .map((value, index) => ({ value, index }))
      .filter((point): point is { value: number; index: number } => point.value !== null)
      .map(({ value, index }) => `${(index + 0.5).toFixed(3)},${scale(value).toFixed(2)}`);

    // One reading cannot be a line. Its area still draws, as a single column,
    // so the panel does not look broken while the history fills up (#125).
    const line = points.length > 1 ? `M${points.join(' L')}` : '';
    const area =
      points.length > 0
        ? `M${points[0]!.split(',')[0]},${HEIGHT} L${points.join(' L')} L${points.at(-1)!.split(',')[0]},${HEIGHT} Z`
        : '';

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

/**
 * The year marks under the chart, with the ones that would collide dropped.
 *
 * The two ends always carry their own month, so the axis says what it spans
 * even at a width where every year mark in between has to go.
 */
export interface AxisMark {
  /** Where it sits, as a percentage of the width. */
  left: number;
  label: string;
  edge?: 'left' | 'right';
}

export function axisMarks(months: readonly string[], widthPx: number): AxisMark[] {
  if (months.length === 0) return [];

  const marks: AxisMark[] = [{ left: 0, label: months[0]!, edge: 'left' }];
  const gap = Math.max(13, (54 / Math.max(widthPx, 1)) * 100);
  let last = 0;

  months.forEach((month, index) => {
    if (index === 0 || index === months.length - 1 || !month.endsWith('-01')) return;

    const left = ((index + 0.5) / months.length) * 100;

    if (left < gap || left > 100 - gap || left < last + gap) return;

    marks.push({ left, label: `${month.slice(0, 4)}年` });
    last = left;
  });

  if (months.length > 1) marks.push({ left: 100, label: months.at(-1)!, edge: 'right' });

  return marks;
}

const NUMBER = new Intl.NumberFormat('ja-JP');
const NUMBER_1 = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

/** Every absent number on this page is one em dash, so a hole is never a zero. */
export const DASH = '—';

export function formatCount(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) return DASH;

  return decimals > 0 ? NUMBER_1.format(value) : NUMBER.format(Math.round(value));
}

/** A change, with its sign. The minus is the typographic one, to match the plus's width. */
export function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return DASH;
  if (value === 0) return '0';

  return value > 0 ? `+${NUMBER.format(value)}` : `−${NUMBER.format(Math.abs(value))}`;
}

export function changeSign(value: number | null | undefined): 'pos' | 'neg' | 'zero' {
  if (value === null || value === undefined || value === 0) return 'zero';

  return value > 0 ? 'pos' : 'neg';
}

/** `2026-09` as `2026年9月`, which is how the page says a month out loud. */
export function monthLabel(month: string): string {
  return `${Number(month.slice(0, 4))}年${Number(month.slice(5, 7))}月`;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** A stream's length as `H:MM`, which is how long it ran rather than when. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null) return DASH;

  return `${Math.floor(seconds / 3600)}:${pad2(Math.floor((seconds % 3600) / 60))}`;
}

/** An amount of airtime, in hours and minutes. */
export function formatMinutes(minutes: number): string {
  const whole = Math.round(minutes);

  if (whole <= 0) return '0 分';
  if (whole < 60) return `${whole} 分`;

  const rest = whole % 60;

  return rest === 0
    ? `${formatCount(Math.floor(whole / 60))} 時間`
    : `${formatCount(Math.floor(whole / 60))} 時間 ${rest} 分`;
}

export const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** Which part of the day a heatmap cell covers, named by the step it was cut with. */
export function slotLabel(slot: number, stepMinutes: number): string {
  const from = slot * stepMinutes;
  const clock = (minutes: number) => `${pad2(Math.floor(minutes / 60) % 24)}:${pad2(minutes % 60)}`;

  return stepMinutes === 60 ? `${pad2(from / 60)} 時台` : `${clock(from)}–${clock(from + stepMinutes)}`;
}
