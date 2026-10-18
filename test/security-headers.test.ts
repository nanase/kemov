/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/** The rules public/_headers sets: path pattern to header name to value. */
function headerRules(): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;

  for (const line of readFileSync(resolve(root, 'public', '_headers'), 'utf8').split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;

    if (!/^\s/.test(line)) {
      current = new Map();
      rules.set(line.trim(), current);
      continue;
    }

    const colon = line.indexOf(':');

    current?.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }

  return rules;
}

/** A policy's directives by name, each as its list of sources. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(';').map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);

      return [name!, sources];
    }),
  );
}

/** The `sha256-` source an inline script's text is allowed by. */
function hashSource(text: string): string {
  return `'sha256-${createHash('sha256').update(text).digest('base64')}'`;
}

/**
 * The classic inline scripts the pages carry, as the text a browser hashes.
 *
 * `src/shell/head.html` is injected into every public page, so it stands for
 * them; the pages' own HTML is read as well in case one grows a script of its
 * own. A module script is not listed: vite moves it into a hashed file, which
 * `'self'` allows.
 */
function inlineScripts(): string[] {
  const files = [
    'src/shell/head.html',
    'src/index.html',
    'src/stats/index.html',
    'src/stats/detail/index.html',
    'src/members/index.html',
    'src/videos/index.html',
    'src/genet/music/index.html',
    'src/admin/index.html',
  ];

  return files.flatMap((file) =>
    [...readFileSync(resolve(root, file), 'utf8').matchAll(/<script(?<attributes>[^>]*)>(?<text>[\s\S]*?)<\/script>/g)]
      .filter(({ groups }) => !/\b(src|type)=/.test(groups!.attributes!))
      .map(({ groups }) => groups!.text!),
  );
}

describe('the security headers (public/_headers)', () => {
  const rules = headerRules();
  const all = rules.get('/*');

  // Cloudflare joins the values of every rule a path matches. A second rule
  // for /admin/* would add a second policy, and a response obeys all of
  // them, so the one rule is the policy for both sites.
  test('are one rule for every path, which the worker passes through to its own pages', () => {
    expect([...rules.keys()]).toEqual(['/*']);
  });

  test('forbid framing, in both headers a browser reads', () => {
    expect(all?.get('x-frame-options')).toBe('DENY');
    expect(directives(all?.get('content-security-policy') ?? '').get('frame-ancestors')).toEqual(["'none'"]);
  });

  test('close the directives that do not fall back to default-src', () => {
    const policy = directives(all?.get('content-security-policy') ?? '');

    expect(policy.get('default-src')).toEqual(["'self'"]);
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'self'"]);
    expect(policy.get('form-action')).toEqual(["'self'"]);
  });

  test('never allow an inline or evaluated script', () => {
    const scripts = directives(all?.get('content-security-policy') ?? '').get('script-src') ?? [];

    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  // The inline script is allowed by the hash of its text, so a change to it
  // that leaves the hash behind would stop it running on every page.
  test('allow exactly the inline scripts the pages carry, by hash', () => {
    const scripts = directives(all?.get('content-security-policy') ?? '').get('script-src') ?? [];
    const hashes = scripts.filter((source) => source.startsWith("'sha256-"));
    const expected = [...new Set(inlineScripts().map(hashSource))];

    expect(expected.length).toBeGreaterThan(0);
    expect([...hashes].sort()).toEqual(expected.sort());
  });

  // The few hosts the pages reach, and nothing wider: the player's embed, the
  // only frame, from the cookie-less host getEmbedURL builds.
  test('allow the YouTube embed and no other origin', () => {
    const policy = directives(all?.get('content-security-policy') ?? '');

    expect(policy.get('frame-src')).toEqual(['https://www.youtube-nocookie.com']);

    for (const [name, sources] of policy) {
      if (name === 'frame-src') continue;

      expect(sources.filter((source) => /^(https?:|\/\/|\*)/.test(source))).toEqual([]);
    }
  });
});
