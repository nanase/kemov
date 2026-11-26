/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { HELP_SECTIONS, helpUrl } from '@/admin/lib/help';

/**
 * The screens link to headings of docs/guides/admin.md by their text, so a
 * heading renamed there would leave a link that opens the top of the page.
 * GitHub's slug of a heading with no spaces or punctuation is the text itself.
 */
const guide = readFileSync(resolve(import.meta.dirname, '../../../docs/guides/admin.md'), 'utf8');
const headings = guide
  .split('\n')
  .filter((line) => /^#{2,3} /.test(line))
  .map((line) => line.replace(/^#+ /, ''));

describe('HELP_SECTIONS', () => {
  it.each(Object.entries(HELP_SECTIONS))('%s links to a heading of the guide', (_, heading) => {
    expect(headings).toContain(heading);
    expect(heading).not.toMatch(/[\s・、。（）「」]/);
  });
});

describe('helpUrl', () => {
  it('points at the guide on GitHub with the heading as the anchor', () => {
    expect(decodeURIComponent(helpUrl('videos'))).toBe(
      'https://github.com/nanase/kemov/blob/main/docs/guides/admin.md#配信と動画の上書き',
    );
  });
});
