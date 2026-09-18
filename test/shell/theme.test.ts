import { nextThemeSetting, parseThemeSetting } from '@/shell/theme';

describe('parseThemeSetting', () => {
  test.each([
    ['light', 'light'],
    ['dark', 'dark'],
    [null, 'system'],
    [undefined, 'system'],
    ['', 'system'],
    ['system', 'system'],
    ['Dark', 'system'],
  ])('%s means %s', (value, expected) => {
    expect(parseThemeSetting(value)).toBe(expected);
  });
});

describe('nextThemeSetting', () => {
  test('three presses go system → light → dark and back to system', () => {
    const first = nextThemeSetting('system');
    const second = nextThemeSetting(first);
    const third = nextThemeSetting(second);
    expect([first, second, third]).toEqual(['light', 'dark', 'system']);
  });
});
