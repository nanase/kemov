/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { destinationOf } from '@/stats/detail/destination';

const CHANNEL_ID = 'UCabcdefghijklmnopqrstuv';

describe('destinationOf', () => {
  test('sends a channel ID to that member', () => {
    expect(destinationOf(`#/${CHANNEL_ID}`)).toBe(`/members/${CHANNEL_ID}`);
  });

  // The old router matched `/:channelId` and nothing after it named another
  // member, so what follows the first segment is ignored rather than refused.
  test('reads only the first segment', () => {
    expect(destinationOf(`#/${CHANNEL_ID}/`)).toBe(`/members/${CHANNEL_ID}`);
    expect(destinationOf(`#/${CHANNEL_ID}?a=b`)).toBe(`/members/${CHANNEL_ID}`);
  });

  test('accepts the URL-safe characters a channel ID can hold', () => {
    expect(destinationOf('#/UC-_-_-_-_-_-_-_-_-_-_-_')).toBe('/members/UC-_-_-_-_-_-_-_-_-_-_-_');
  });

  test('sends a fragment with no channel to the list', () => {
    expect(destinationOf('')).toBe('/members/');
    expect(destinationOf('#')).toBe('/members/');
    expect(destinationOf('#/')).toBe('/members/');
  });

  // The failure this guards: a fragment that is not an ID, sent on as it is,
  // opens whatever page the text names.
  test.each([
    ['too short', '#/UCabcdefghijklmnopqrstu'],
    ['too long', '#/UCabcdefghijklmnopqrstuvw'],
    ['not starting with UC', '#/XXabcdefghijklmnopqrstuv'],
    ['lower-case prefix', '#/ucabcdefghijklmnopqrstuv'],
    ['a path', '#/../admin/footprints'],
    ['an encoded slash', '#/UCabcdefghijklm%2Fpqrstuv'],
    ['no leading slash', `#${CHANNEL_ID}`],
  ])('sends %s to the list', (_, hash) => {
    expect(destinationOf(hash)).toBe('/members/');
  });
});

describe("the redirect page's background before the script runs", () => {
  const dir = resolve(import.meta.dirname, '../../../src');
  const page = readFileSync(resolve(dir, 'stats/detail/index.html'), 'utf8');
  const tokens = readFileSync(resolve(dir, 'shell/tokens.css'), 'utf8');

  const backgrounds = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].map((m) => m[1]!.toLowerCase());

  // The page skips head.html, so nothing else keeps these in step with the
  // rest of the site.
  test('matches the site background for light, a dark OS and a chosen dark', () => {
    const [light, darkByOs, darkByChoice] = backgrounds(tokens, /--k-bg:\s*(#[0-9a-f]+);/gi);

    expect(backgrounds(page, /background-color:\s*(#[0-9a-f]+);/gi)).toEqual([light, darkByOs, darkByChoice]);
  });
});
