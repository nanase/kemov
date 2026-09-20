import {
  THEME_COOKIE_NAME,
  THEME_STORAGE_KEY,
  colorSchemeContent,
  nextThemeSetting,
  parseThemeSetting,
  themeCookie,
  themeFromCookieHeader,
} from '@/shell/theme';

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

describe('themeCookie', () => {
  test('keeps light and dark for a year, for the whole site', () => {
    expect(themeCookie('dark')).toBe('kemov-theme=dark; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
    expect(themeCookie('light')).toBe('kemov-theme=light; Max-Age=31536000; Path=/; SameSite=Lax; Secure');
  });

  // `system` is the absence of a setting, so it is the absence of a cookie.
  test('drops the cookie for system', () => {
    expect(themeCookie('system')).toBe('kemov-theme=; Max-Age=0; Path=/; SameSite=Lax; Secure');
  });

  // A script writes it, so HttpOnly would make the write fail. See themeCookie.
  test('is not HttpOnly, and holds nothing but the setting', () => {
    for (const setting of ['light', 'dark', 'system'] as const) {
      expect(themeCookie(setting)).not.toMatch(/HttpOnly/i);
    }
  });

  test('is named the way the localStorage key is', () => {
    expect(THEME_COOKIE_NAME).toBe(THEME_STORAGE_KEY);
  });
});

describe('themeFromCookieHeader', () => {
  test.each([
    ['kemov-theme=light', 'light'],
    ['kemov-theme=dark', 'dark'],
    ['a=1; kemov-theme=dark; b=2', 'dark'],
    ['a=1;kemov-theme=light', 'light'],
    ['kemov-theme=dark; kemov-theme=light', 'dark'],
    [null, 'system'],
    [undefined, 'system'],
    ['', 'system'],
    ['a=1', 'system'],
    ['kemov-theme=', 'system'],
    ['kemov-theme=system', 'system'],
    ['kemov-theme=Dark', 'system'],
    ['kemov-theme=darker', 'system'],
    ['x-kemov-theme=dark', 'system'],
    ['a=kemov-theme=dark', 'system'],
  ])('%s means %s', (header, expected) => {
    expect(themeFromCookieHeader(header)).toBe(expected);
  });

  // What ThemeToggle writes is what the worker reads.
  test.each(['light', 'dark'] as const)('reads back what themeCookie writes for %s', (setting) => {
    expect(themeFromCookieHeader(themeCookie(setting).split(';')[0])).toBe(setting);
  });
});

describe('colorSchemeContent', () => {
  test.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'light dark'],
  ] as const)('%s is %s', (setting, expected) => {
    expect(colorSchemeContent(setting)).toBe(expected);
  });
});
