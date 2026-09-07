import { boundNames, declaredNames, loadSecretNames, missingSecrets, secretNames } from '../secrets.js';

/** An `Env` interface with `members` between the braces. */
function env(members) {
  return `import type { Something } from './something';\n\nexport interface Env {\n${members}\n}\n`;
}

/** A wrangler.toml with `body` after the usual preamble. */
function wrangler(body) {
  return `name = "kemov"\nmain = "worker/src/index.ts"\n\n${body}\n`;
}

describe('declaredNames', () => {
  test('reads the members in the order they are written', () => {
    expect(declaredNames(env('  DB: D1Database;\n  YOUTUBE_API_KEY: string;'))).toEqual(['DB', 'YOUTUBE_API_KEY']);
  });

  test('ignores what a doc comment says', () => {
    const source = env('  /** D1. The DECOY: string; in here is not a member. */\n  DB: D1Database;');

    expect(declaredNames(source)).toEqual(['DB']);
  });

  test('ignores a line comment', () => {
    expect(declaredNames(env('  // DECOY: string;\n  DB: D1Database;'))).toEqual(['DB']);
  });

  test('reads an optional member', () => {
    expect(declaredNames(env('  YOUTUBE_API_KEY?: string;'))).toEqual(['YOUTUBE_API_KEY']);
  });

  test('reads nothing from an empty interface', () => {
    expect(declaredNames(env(''))).toEqual([]);
  });

  test('refuses a file that declares no Env', () => {
    expect(() => declaredNames('export interface Other {\n  DB: D1Database;\n}\n')).toThrow(/interface Env/);
  });
});

describe('boundNames', () => {
  test('reads the binding of every resource, whatever its kind', () => {
    const source = wrangler(
      '[[d1_databases]]\nbinding = "DB"\ndatabase_name = "kemov"\n\n[[kv_namespaces]]\nbinding = "CACHE"',
    );

    expect(boundNames(source)).toEqual(['DB', 'CACHE']);
  });

  test('reads the plain variables under [vars]', () => {
    expect(boundNames(wrangler('[vars]\nAPI_BASE = "https://example.test"'))).toEqual(['API_BASE']);
  });

  test('stops reading [vars] at the next table', () => {
    const source = wrangler('[vars]\nAPI_BASE = "https://example.test"\n\n[triggers]\ncrons = ["* * * * *"]');

    expect(boundNames(source)).toEqual(['API_BASE']);
  });

  test('reads nothing from a file that binds nothing', () => {
    expect(boundNames(wrangler('[triggers]\ncrons = []'))).toEqual([]);
  });
});

describe('secretNames', () => {
  test('keeps a member wrangler.toml does not supply', () => {
    const source = env('  DB: D1Database;\n  YOUTUBE_API_KEY: string;');

    expect(secretNames(source, wrangler('[[d1_databases]]\nbinding = "DB"'))).toEqual(['YOUTUBE_API_KEY']);
  });

  test('drops a [vars] entry, which is a string but not a secret', () => {
    const source = env('  API_BASE: string;\n  YOUTUBE_API_KEY: string;');
    const toml = wrangler('[vars]\nAPI_BASE = "https://example.test"');

    expect(secretNames(source, toml)).toEqual(['YOUTUBE_API_KEY']);
  });

  test('finds none when wrangler.toml supplies everything', () => {
    expect(secretNames(env('  DB: D1Database;'), wrangler('[[d1_databases]]\nbinding = "DB"'))).toEqual([]);
  });
});

describe('missingSecrets', () => {
  test('names what Cloudflare does not hold', () => {
    expect(missingSecrets(['YOUTUBE_API_KEY'], [])).toEqual(['YOUTUBE_API_KEY']);
  });

  test('finds none when every one is registered', () => {
    const listed = [{ name: 'YOUTUBE_API_KEY', type: 'secret_text' }];

    expect(missingSecrets(['YOUTUBE_API_KEY'], listed)).toEqual([]);
  });

  test('says nothing about a secret Cloudflare holds and the worker never reads', () => {
    const listed = [
      { name: 'YOUTUBE_API_KEY', type: 'secret_text' },
      { name: 'LEFT_OVER', type: 'secret_text' },
    ];

    expect(missingSecrets(['YOUTUBE_API_KEY'], listed)).toEqual([]);
  });

  test('refuses a list that is not a list', () => {
    expect(() => missingSecrets([], { name: 'YOUTUBE_API_KEY' })).toThrow(/not an array/);
  });
});

describe('loadSecretNames', () => {
  // The files themselves, so that a change to either shape is caught here
  // rather than by a deploy that quietly checks nothing.
  test('reads the repository down to the one secret it has', () => {
    expect(loadSecretNames()).toEqual(['YOUTUBE_API_KEY']);
  });
});
