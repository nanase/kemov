import { memberAccent, memberColor, memberInk, toHsl } from '@/lib/memberColor';

/**
 * A member's colour, put on a page without losing who it belongs to.
 *
 * Shared by the statistics page and the member page, which use it for
 * different things but must never disagree about which hue belongs to whom.
 */

describe('memberColor', () => {
  // The hue is what tells eleven members apart, so it survives the move.
  test('keeps the hue and moves the lightness into the readable band', () => {
    const hex = '#F38E0A';
    const { hue } = toHsl(hex);

    expect(memberColor(hex, false)).toEqual(`hsl(${hue} 92% 42%)`);
    expect(memberColor(hex, true)).toEqual(`hsl(${hue} 92% 60%)`);
  });

  test('raises a washed-out colour to the saturation floor rather than lowering it', () => {
    expect(memberColor('#9a9490', false)).toMatch(/^hsl\(\d+ 46% /);
    expect(memberColor('#9a9490', true)).toMatch(/^hsl\(\d+ 42% /);
  });

  test('carries an alpha when one is asked for', () => {
    expect(memberColor('#F38E0A', false, 0.09)).toMatch(/ \/ 0\.09\)$/);
  });

  test('the month being pointed at is the same hue, not the page accent', () => {
    const hex = '#F38E0A';

    expect(memberAccent(hex, false)).toMatch(new RegExp(`^hsl\\(${toHsl(hex).hue} `));
    expect(memberAccent(hex, false)).not.toEqual(memberColor(hex, false));
  });

  test('reads a grey with no hue at all', () => {
    expect(toHsl('#808080')).toMatchObject({ hue: 0, saturation: 0 });
  });
});

/**
 * A set of colours to test against: the 11 key colours as they stood in
 * channels.yml in 2026-09, copied here when that file was retired (#211).
 * They are values as of that date, not a reading of what the members' colours
 * are now: the admin site edits the members, and nothing keeps this list in
 * step with it. What the test needs is a spread as wide as the real one, so
 * the list is worth changing only if a colour outside that spread is added.
 */
const MEMBER_COLORS = [
  '#F38E0A',
  '#EB5B5B',
  '#F98E7C',
  '#FED690',
  '#363241',
  '#FF6833',
  '#DD7278',
  '#FD933F',
  '#B0E4F9',
  '#8FC579',
  '#FAB6DD',
];

/** The grounds the pages draw on, from src/shell/tokens.css. */
const GROUNDS = { light: ['#e9eeec', '#ffffff'], dark: ['#0e0f10', '#16181a'] };

function parseHsl(value: string): [number, number, number] {
  const [, hue, saturation, lightness] = /^hsl\((\d+) (\d+)% (\d+)%/.exec(value) ?? [];

  return [Number(hue), Number(saturation) / 100, Number(lightness) / 100];
}

function hslToRgb([hue, saturation, lightness]: [number, number, number]): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const second = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const base = lightness - chroma / 2;
  const [red, green, blue] = (
    [
      [chroma, second, 0],
      [second, chroma, 0],
      [0, chroma, second],
      [0, second, chroma],
      [second, 0, chroma],
      [chroma, 0, second],
    ] as [number, number, number][]
  )[Math.min(5, Math.floor(hue / 60))]!;

  return [red + base, green + base, blue + base];
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');

  return [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255) as [number, number, number];
}

function luminance(rgb: [number, number, number]): number {
  const [red, green, blue] = rgb.map((part) => (part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4));

  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (high! + 0.05) / (low! + 0.05);
}

describe('memberInk', () => {
  test('keeps the hue and only pulls the lightness in', () => {
    const hex = '#FED690';
    const { hue } = toHsl(hex);

    expect(memberInk(hex, false)).toEqual(`hsl(${hue} 92% 32%)`);
    expect(memberInk(hex, true)).toEqual(`hsl(${hue} 92% 78%)`);
  });

  // The band is narrower than memberColor's at both ends: the palest member
  // comes down in the dark theme as well as in the light one.
  test('pulls a colour that is paler than the band down to its top', () => {
    expect(memberInk('#B0E4F9', true)).toMatch(/ 80%\)$/);
    expect(memberColor('#B0E4F9', true)).toMatch(/ 78%\)$/);
  });

  test('carries an alpha when one is asked for', () => {
    expect(memberInk('#F38E0A', false, 0.14)).toMatch(/ \/ 0\.14\)$/);
  });

  // The member page fills buttons and draws marks in this colour, so every
  // member has to clear 3:1 against both grounds - which four of the eleven
  // do not at memberColor's wider band.
  test('every member clears the non-text contrast floor on both grounds', () => {
    expect(MEMBER_COLORS).toHaveLength(11);

    for (const hex of MEMBER_COLORS) {
      for (const [dark, grounds] of [
        [false, GROUNDS.light],
        [true, GROUNDS.dark],
      ] as const) {
        for (const ground of grounds) {
          const ratio = contrast(hslToRgb(parseHsl(memberInk(hex, dark))), hexToRgb(ground));

          expect({ hex, ground, ratio: ratio >= 3 }).toEqual({ hex, ground, ratio: true });
        }
      }
    }
  });

  test('white text on the light theme ink reads, and the dark theme ink takes dark text', () => {
    for (const hex of MEMBER_COLORS) {
      expect(contrast(hslToRgb(parseHsl(memberInk(hex, false))), hexToRgb('#ffffff'))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(hslToRgb(parseHsl(memberInk(hex, true))), hexToRgb('#0e0f10'))).toBeGreaterThanOrEqual(4.5);
    }
  });
});
