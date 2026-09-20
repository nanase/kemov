import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

import { relayChannelIconURL, relayVideoThumbnailURL } from '@/lib/relay';
import type { ThumbnailSize } from '@/lib/youtube';

describe('relayVideoThumbnailURL', () => {
  test('defaults to the size the lists draw', () => {
    expect(relayVideoThumbnailURL('dQw4w9WgXcQ')).toBe('/api/image/video/dQw4w9WgXcQ?size=mqdefault');
  });

  // The relay's `size` is i.ytimg.com's own file name. The record panel asks
  // for sd and the lightbox for max on purpose; every size the site can name
  // has to reach the relay under a name it accepts.
  test.each<[ThumbnailSize, string]>([
    ['default', 'default'],
    ['mq', 'mqdefault'],
    ['hq', 'hqdefault'],
    ['sd', 'sddefault'],
    ['max', 'maxresdefault'],
  ])('size %s is asked for as %s', (size, name) => {
    expect(relayVideoThumbnailURL('dQw4w9WgXcQ', size)).toBe(`/api/image/video/dQw4w9WgXcQ?size=${name}`);
  });

  test('never names YouTube: the browser talks only to this site', () => {
    expect(relayVideoThumbnailURL('dQw4w9WgXcQ', 'max')).not.toMatch(/ytimg|youtube/);
  });
});

describe('relayChannelIconURL', () => {
  test('defaults to 88, the size the pages drew before the relay', () => {
    expect(relayChannelIconURL('UCaaa')).toBe('/api/image/channel/UCaaa?size=88');
  });

  test('passes an explicit size on', () => {
    expect(relayChannelIconURL('UCaaa', 176)).toBe('/api/image/channel/UCaaa?size=176');
  });
});

/**
 * The pages that draw a picture must ask the relay for it, and none of them
 * may name YouTube's image hosts again. A page added or edited later that
 * builds an `i.ytimg.com` address itself would look right in review - the
 * picture loads - and put that page back in front of the 429 this was for.
 *
 * The old pages under src/components, src/stats/detail and src/stats/ranking
 * are left out: they are being removed, not converted (#144).
 */
describe('the pages that draw pictures', () => {
  const root = resolve(import.meta.dirname, '../../src');
  const PAGES = ['footprints', 'genet', 'members', 'stats/parts', 'videos', 'parts'];

  function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);

      if (statSync(path).isDirectory()) return sources(path);

      return /\.(vue|ts)$/.test(name) ? [path] : [];
    });
  }

  const files = PAGES.flatMap((page) => sources(join(root, page)));

  test('there are files to look at', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test.each(files.map((file) => [relative(root, file).replaceAll('\\', '/'), file]))(
    '%s builds no YouTube image address of its own',
    (_name, file) => {
      const text = readFileSync(file, 'utf-8');

      expect(text).not.toMatch(/ytimg\.com|ggpht\.com|googleusercontent\.com/);
      expect(text).not.toMatch(/\bgetThumbnailURL\b/);
    },
  );
});
