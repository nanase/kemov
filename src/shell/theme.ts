/**
 * The reader's colour theme: follow the OS, or force light or dark.
 *
 * `system` is never stored. It is the absence of a stored value, so the
 * script in head.html and ThemeToggle agree on it without either having to
 * name it.
 */
export type ThemeSetting = 'system' | 'light' | 'dark';

/** The localStorage key head.html reads before the first paint. */
export const THEME_STORAGE_KEY = 'kemov-theme';

/** What a stored value or a `data-theme` attribute means. */
export function parseThemeSetting(value: string | null | undefined): ThemeSetting {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** The setting one press of ThemeToggle moves to: system → light → dark → system. */
export function nextThemeSetting(setting: ThemeSetting): ThemeSetting {
  switch (setting) {
    case 'system':
      return 'light';
    case 'light':
      return 'dark';
    case 'dark':
      return 'system';
  }
}
