/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { THEME_STORAGE_KEY, colorSchemeContent, themeCookie } from '@/shell/theme';

// Read from disk rather than imported with ?raw: vitest empties CSS imports,
// ?raw included, unless its css option is turned on.
const read = (name: string) => readFileSync(resolve(import.meta.dirname, '../../src/shell', name), 'utf8');
const head = read('head.html');
const tokens = read('tokens.css');
const genet = read('palette-genet.css');

/** Every `--k-bg` value in a stylesheet, in order: light, dark for the OS, dark by choice. */
function tokenBackgrounds(css: string): string[] {
  return [...css.matchAll(/--k-bg:\s*(#[0-9a-f]+);/gi)].map((m) => m[1]!.toLowerCase());
}

/** The `background-color` head.html's inline style gives each selector. */
function headBackgrounds(): Map<string, string> {
  const style = head.match(/<style>([\s\S]*?)<\/style>/)![1]!.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [...style.matchAll(/([^{}]+)\{\s*background-color:\s*(#[0-9a-f]+);\s*\}/gi)];
  return new Map(rules.map((m) => [m[1]!.replace(/\s+/g, ' ').trim(), m[2]!.toLowerCase()]));
}

describe("head.html's background before the stylesheets arrive", () => {
  const inline = headBackgrounds();

  test('matches tokens.css for the site', () => {
    const [light, darkByOs, darkByChoice] = tokenBackgrounds(tokens);
    expect(inline.get('html')).toBe(light);
    expect(inline.get("html:not([data-theme='light'])")).toBe(darkByOs);
    expect(inline.get("html[data-theme='dark']")).toBe(darkByChoice);
  });

  test('matches palette-genet.css for ジェネット楽曲一覧', () => {
    const [light, darkByOs, darkByChoice] = tokenBackgrounds(genet);
    expect(inline.get("html[data-palette='genet']")).toBe(light);
    expect(inline.get("html[data-palette='genet']:not([data-theme='light'])")).toBe(darkByOs);
    expect(inline.get("html[data-palette='genet'][data-theme='dark']")).toBe(darkByChoice);
  });

  test('covers exactly those six cases', () => {
    expect(inline.size).toBe(6);
  });
});

describe("head.html's colour scheme", () => {
  test('says the page suits either, which is the setting of a reader who follows the OS', () => {
    expect(head).toContain(`<meta name="color-scheme" content="${colorSchemeContent('system')}" />`);
  });
});

describe("head.html's script before the first paint", () => {
  const script = head.match(/<script>([\s\S]*?)<\/script>/)![1]!;

  /** Runs the script in a page whose storage and cookie are as given, and returns what it left behind. */
  function run(stored: string | null, cookie: string) {
    const written: string[] = [];
    const root = { dataset: {} as Record<string, string>, style: { colorScheme: '' } };
    const document = {
      documentElement: root,
      get cookie() {
        return cookie;
      },
      set cookie(value: string) {
        written.push(value);
      },
    };
    const localStorage = { getItem: (key: string) => (key === THEME_STORAGE_KEY ? stored : null) };

    runInNewContext(script, { document, localStorage });

    return { written, theme: root.dataset.theme, colorScheme: root.style.colorScheme };
  }

  // The script cannot import themeCookie, so this is what keeps the copy in it
  // writing the cookie the worker reads.
  test.each(['light', 'dark'] as const)('hands a stored %s to the cookie exactly as themeCookie writes it', (theme) => {
    const result = run(theme, '');

    expect(result.written).toEqual([themeCookie(theme)]);
    expect(result.theme).toBe(theme);
    expect(result.colorScheme).toBe(theme);
  });

  test('writes nothing when the cookie already agrees', () => {
    expect(run('dark', `a=1; ${THEME_STORAGE_KEY}=dark`).written).toEqual([]);
  });

  test('corrects a cookie that disagrees', () => {
    expect(run('light', `${THEME_STORAGE_KEY}=dark`).written).toEqual([themeCookie('light')]);
  });

  test.each([null, 'system', 'Dark', ''])('leaves a stored %s, and the cookie, alone', (stored) => {
    expect(run(stored, `${THEME_STORAGE_KEY}=dark`)).toEqual({ written: [], theme: undefined, colorScheme: '' });
  });
});
