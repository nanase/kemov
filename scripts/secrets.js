/**
 * Working out which of the worker's runtime values are secrets, and which of
 * those Cloudflare is missing.
 *
 * This is JavaScript rather than TypeScript for the same reason channels.js
 * is: it runs under bare node in a workflow step, before anything is built.
 *
 * Nothing here ever sees a secret value. `wrangler secret list` returns names
 * and types only, and that is all this file reads or prints.
 */

import { readFileSync } from 'node:fs';

/** The interface that names everything the worker is handed at runtime. */
export const envPath = 'worker/src/lib/env.ts';

/** The file that names the bindings, relative to the repository root. */
export const wranglerPath = 'wrangler.toml';

/** The `Env` interface body, or null when the file does not declare one. */
function envBody(source) {
  const start = source.indexOf('export interface Env {');

  if (start === -1) {
    return null;
  }

  // The closing brace of a top-level declaration is the first one at column 0.
  const end = source.indexOf('\n}', start);

  return end === -1 ? null : source.slice(start, end);
}

/** `source` with block and line comments removed. */
function withoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Every member name `Env` declares, bindings and secrets alike.
 *
 * The members are read with a regular expression rather than a TypeScript
 * parser. env.ts is a single flat interface of `NAME: Type;` lines, and a
 * parser would be a compile step in front of a file this shape.
 */
export function declaredNames(envSource) {
  const body = envBody(withoutComments(envSource));

  if (body === null) {
    throw new Error(`${envPath}: no "export interface Env" to read`);
  }

  return [...body.matchAll(/^\s*(\w+)\??\s*:/gm)].map(([, name]) => name);
}

/**
 * Every name wrangler.toml supplies: the bindings of every resource, and the
 * plain variables under [vars].
 *
 * `binding = "..."` is how D1, KV and R2 alike name themselves, so one pattern
 * covers each kind that exists and each kind that might.
 */
export function boundNames(wranglerSource) {
  const names = [];
  let inVars = false;

  for (const line of wranglerSource.split('\n')) {
    const table = line.match(/^\s*\[+([^\]]+)\]+/);

    if (table !== null) {
      inVars = table[1] === 'vars';
      continue;
    }

    const binding = line.match(/^\s*binding\s*=\s*"([^"]*)"/);

    if (binding !== null) {
      names.push(binding[1]);
    } else if (inVars) {
      const entry = line.match(/^\s*(\w+)\s*=/);

      if (entry !== null) {
        names.push(entry[1]);
      }
    }
  }

  return names;
}

/**
 * The members of `Env` that must come from `wrangler secret put`.
 *
 * A secret is defined by absence: it is a name the worker is handed that
 * wrangler.toml does not supply. Deciding by the declared type instead would
 * call every [vars] entry a secret, because both arrive as strings.
 */
export function secretNames(envSource, wranglerSource) {
  const bound = new Set(boundNames(wranglerSource));

  return declaredNames(envSource).filter((name) => !bound.has(name));
}

/** The same, read from the files themselves. */
export function loadSecretNames() {
  return secretNames(readFileSync(envPath, 'utf8'), readFileSync(wranglerPath, 'utf8'));
}

/**
 * The names in `expected` that `listed` does not have.
 *
 * `listed` is the JSON `wrangler secret list` prints: an array of `{ name,
 * type }`. A secret Cloudflare holds but the worker never reads is not a
 * problem, so the comparison only runs one way.
 */
export function missingSecrets(expected, listed) {
  if (!Array.isArray(listed)) {
    throw new Error('the secret list is not an array');
  }

  const registered = new Set(listed.map((entry) => entry?.name));

  return expected.filter((name) => !registered.has(name));
}
