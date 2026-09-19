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

/**
 * The key the site's older pages read for the same choice - not this
 * shell's own `THEME_STORAGE_KEY`, but `@nanase/alnilam`'s own Vuetify theme
 * helper (see `node_modules/@nanase/alnilam/src/lib/theme.ts`'s
 * `VuetifyColorSchemeName`), which `src/header.html` (the older pages' own
 * head, not this shell's `head.html`) falls back to the OS for when it is
 * unset. Every value this shell can set (`'light'`/`'dark'`, or removed for
 * `'system'`) already means the same thing to that helper, so nothing here
 * translates between the two - see `ThemeToggle.vue`'s own write.
 *
 * A reader who explicitly picks a theme on a new page and then opens
 * `/genet/music/`, `/stats/ranking/` or `/stats/detail/` used to land on
 * whatever the OS preferred instead, mismatched and often white against a
 * dark choice. This bridges the choice to the older pages until they are
 * gone - `/genet/music/` (#167) has no dark theme of its own regardless, so
 * this does not reach it, but `/stats/ranking/` and `/stats/detail/` (#161's
 * own replacement) read this key already. Remove this export, the write in
 * `ThemeToggle.vue`, and this comment together with whichever PR removes the
 * last page that still reads it.
 */
export const LEGACY_VUETIFY_THEME_KEY = 'vuetify-color-scheme';

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
