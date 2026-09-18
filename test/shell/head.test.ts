/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
