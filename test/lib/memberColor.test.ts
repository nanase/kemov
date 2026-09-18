import { memberAccent, memberColor, toHsl } from '@/lib/memberColor';

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
