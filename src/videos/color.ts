/**
 * A channel's own colour, moved to a lightness that reads against the page.
 *
 * Written to match `/stats/`'s `src/stats/draw.ts` (#161, not yet on main)
 * exactly - same function, same clamps - so that when #161 merges and Task3
 * moves the page-independent parts into `src/lib/`, the two call sites can be
 * pointed at one copy rather than reconciled by hand. Do not tune this
 * page's own values without checking `/stats/` still agrees.
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
 * A channel's own colour, moved to a lightness that reads against the page.
 *
 * The hue is left alone - it is what tells the members apart - and only the
 * lightness is pulled into a band that has enough contrast with the
 * background. Saturation is raised to a floor rather than lowered, so a pale
 * colour does not arrive as grey. #135's own rule: colour is for telling
 * people apart, never for size or amount, so nothing here scales with a
 * value.
 */
export function memberColor(hex: string, dark: boolean, alpha = 1): string {
  const { hue, saturation, lightness } = toHsl(hex);
  const s = clamp(Math.max(saturation, dark ? 0.42 : 0.46), 0, 0.92);
  const l = dark ? clamp(lightness, 0.6, 0.78) : clamp(lightness, 0.28, 0.42);
  const percent = (v: number) => `${Math.round(v * 100)}%`;

  return `hsl(${hue} ${percent(s)} ${percent(l)}${alpha < 1 ? ` / ${alpha}` : ''})`;
}
