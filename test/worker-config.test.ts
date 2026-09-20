/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import viteConfig from '../vite.config';
import { THEMED_PAGE_PATHS } from '../worker/src/lib/themed-pages';

const root = resolve(import.meta.dirname, '..');
const srcDir = resolve(root, 'src');

/** The paths `run_worker_first` in wrangler.toml lists. */
function runWorkerFirst(): string[] {
  const toml = readFileSync(resolve(root, 'wrangler.toml'), 'utf8').replace(/^\s*#.*$/gm, '');
  const list = toml.match(/^run_worker_first\s*=\s*\[([^\]]*)\]/m);

  if (list === null) throw new Error('wrangler.toml has no run_worker_first list');

  return [...list[1]!.matchAll(/"([^"]*)"/g)].map((m) => m[1]!);
}

/** The address each page vite builds is served at, by the page's `input` name. */
function builtPages(): Map<string, string> {
  const input = viteConfig.build!.rollupOptions!.input as Record<string, string>;

  return new Map(
    Object.entries(input).map(([name, file]) => {
      const directory = relative(srcDir, file)
        .replaceAll('\\', '/')
        .replace(/index\.html$/, '');

      return [name, `/${directory}`];
    }),
  );
}

// The two lists are one decision written twice, because wrangler.toml cannot
// import from the worker. A path in only one of them is a page that is not
// themed, or a path that wakes the worker for nothing.
describe("the pages the worker writes the reader's theme into (#182)", () => {
  test('are the same in wrangler.toml as in the worker', () => {
    expect([...runWorkerFirst()].sort()).toEqual([...THEMED_PAGE_PATHS].sort());
  });

  // A page added to vite without being listed would flash for a reader who
  // chose a theme, and nothing would say so. /admin/ is the one page that is
  // light only and has no meta to write.
  test('are every page vite builds, except the admin site', () => {
    const pages = builtPages();

    pages.delete('admin');

    expect([...pages.values()].sort()).toEqual([...THEMED_PAGE_PATHS].sort());
  });

  // What run_worker_first must never be: a way to send every asset through
  // the worker, which is paid for per request.
  test('name exact HTML paths, never a pattern', () => {
    for (const path of runWorkerFirst()) {
      expect(path).toMatch(/^\/([\w-]+\/)*$/);
    }
  });
});
