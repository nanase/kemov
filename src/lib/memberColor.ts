/**
 * A member's own colour, put on a page without losing who it belongs to.
 *
 * Shared by every page that draws a member: the hue is the one thing that
 * tells eleven people apart, so it is never touched, and only the lightness
 * moves into a band that reads against the ground it lands on. What a page
 * may use the colour *for* is decided by that page - the statistics page
 * shades a member's own chart with it, the member page keeps it to a ring
 * round a picture and a dot beside a name (#136).
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
 * The same colour, moved far enough to carry marks and text on its own.
 *
 * `memberColor` above is tuned for a colour used beside the page's own accent,
 * where it only has to be recognisable. A page that puts the member's colour
 * *in place of* the accent asks more of it: a ring, a chart's marks, a filled
 * button with words on it. Four of the eleven do not reach 3:1 against the
 * page's ground at that band - the palest sits at 2.56:1 - so this one is
 * pulled to a narrower, darker band.
 *
 * Measured against the grounds the pages use, over all eleven members, the
 * worst case is 4.15:1 on the light ground, 4.87:1 for white text on the
 * colour, 5.46:1 on the dark ground and 4.86:1 for the dark theme's ink on
 * the colour. The hue is still untouched: it is what tells eleven people
 * apart, and darkening is a change of lightness only.
 */
export function memberInk(hex: string, dark: boolean, alpha = 1): string {
  const { hue, saturation, lightness } = toHsl(hex);
  const s = clamp(Math.max(saturation, dark ? 0.42 : 0.46), 0, 0.92);
  const l = dark ? clamp(lightness, 0.64, 0.8) : clamp(lightness, 0.26, 0.32);
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
