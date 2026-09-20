/**
 * The reader's colour theme: follow the OS, or force light or dark.
 *
 * `system` is never stored. It is the absence of a stored value, so the
 * script in head.html and ThemeToggle agree on it without either having to
 * name it.
 *
 * The setting is kept twice. localStorage is what the page's own scripts read.
 * The cookie exists for the worker: the browser fixes the colour it paints a
 * page's canvas with, from the `color-scheme` meta, before any script in the
 * page can run, so only a server that knows the setting can put the right
 * value in that meta (worker/src/lib/theme.ts).
 */
export type ThemeSetting = 'system' | 'light' | 'dark';

/** The localStorage key head.html reads before the first paint. */
export const THEME_STORAGE_KEY = 'kemov-theme';

/**
 * The cookie's name, the same as the localStorage key.
 *
 * One name for both means a reader who clears the site's data loses both, and
 * head.html can name the setting once. The inline script in head.html cannot
 * import this, so test/shell/head.test.ts holds its copy to it.
 */
export const THEME_COOKIE_NAME = THEME_STORAGE_KEY;

/** A year. Chrome refuses more than 400 days, so this is the longest that is not clamped. */
const THEME_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

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

/**
 * The `document.cookie` assignment that keeps a setting, or drops it for `system`.
 *
 * The value is `light` or `dark` and nothing else, so the cookie identifies no
 * one. It is not `HttpOnly` because a script writes it: HttpOnly hides a
 * cookie from scripts and refuses their writes to it too. What that leaves
 * open is a script reading it, and a script that could has the same
 * localStorage to read.
 */
export function themeCookie(setting: ThemeSetting): string {
  const attributes = 'Path=/; SameSite=Lax; Secure';

  return setting === 'system'
    ? `${THEME_COOKIE_NAME}=; Max-Age=0; ${attributes}`
    : `${THEME_COOKIE_NAME}=${setting}; Max-Age=${THEME_COOKIE_MAX_AGE_SECONDS}; ${attributes}`;
}

/** The setting a request's `Cookie` header carries. No header, no cookie and a value that is not one of ours all mean `system`. */
export function themeFromCookieHeader(header: string | null | undefined): ThemeSetting {
  const prefix = `${THEME_COOKIE_NAME}=`;

  for (const pair of (header ?? '').split(';')) {
    const trimmed = pair.trim();

    if (trimmed.startsWith(prefix)) return parseThemeSetting(trimmed.slice(prefix.length));
  }

  return 'system';
}

/**
 * The `content` of the `color-scheme` meta for a setting.
 *
 * `light dark` says the page can be either, which makes the browser paint a
 * dark canvas under a dark OS. A reader who chose `light` has to be told
 * `light` there, or the page starts dark and turns light once its stylesheet
 * arrives. head.html ships the `system` value.
 */
export function colorSchemeContent(setting: ThemeSetting): string {
  return setting === 'system' ? 'light dark' : setting;
}
