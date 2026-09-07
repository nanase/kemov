/**
 * Fails the build when a secret the worker reads is not registered.
 *
 * A missing secret does not stop a deploy: wrangler resolves the bindings in
 * wrangler.toml and never looks at the secrets, so the workflow stays green
 * and the jobs fail one at a time in the database instead. #89 is what that
 * cost. This step is the check nobody was doing.
 *
 * It takes the output of `wrangler secret list` as a file rather than running
 * wrangler itself, so that the step holding the Cloudflare token and the step
 * making the judgement are separate.
 *
 * Usage: node scripts/check-secrets.js <path to the secret list JSON>
 */

import { readFileSync } from 'node:fs';
import { loadSecretNames, missingSecrets } from './secrets.js';

const listPath = process.argv[2];

if (listPath === undefined) {
  console.error('usage: node scripts/check-secrets.js <path to the secret list JSON>');
  process.exitCode = 1;
} else {
  try {
    const expected = loadSecretNames();
    const missing = missingSecrets(expected, JSON.parse(readFileSync(listPath, 'utf8')));

    if (missing.length > 0) {
      console.error(`not registered: ${missing.join(', ')}`);
      console.error('set each one with `yarn wrangler secret put <name>`; see "Worker Secrets" in the README.');
      process.exitCode = 1;
    } else {
      console.log(`${expected.length} declared secrets, all registered`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
