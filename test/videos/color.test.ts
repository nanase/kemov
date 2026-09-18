import { memberColor, toHsl } from '@/videos/color';

/**
 * Kept in lockstep with `/stats/`'s `test/stats/draw.test.ts` (#161, not yet
 * on main): the same function, the same expectations, so a future merge into
 * one shared copy is a move, not a reconciliation.
 */

describe('memberColor', () => {
  // The hue is what tells the eleven members apart, so it survives the move.
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

  test('reads a grey with no hue at all', () => {
    expect(toHsl('#808080')).toMatchObject({ hue: 0, saturation: 0 });
  });
});
