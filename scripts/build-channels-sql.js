/**
 * Writes the upsert that seeds the `channel` table from channels.yml.
 *
 * Usage: node scripts/build-channels-sql.js <output.sql>
 *
 * The deploy writes to a scratch path and hands the file to
 * `wrangler d1 execute`. Nothing commits the output: the SQL is what
 * channels.yml says at the moment of the deploy, and a copy in the repository
 * would be one more thing that can disagree with it.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { channelsPath, channelsToSql, loadChannels } from './channels.js';

const [output] = process.argv.slice(2);

if (output === undefined) {
  console.error('usage: node scripts/build-channels-sql.js <output.sql>');
  process.exit(2);
}

try {
  const channels = loadChannels();

  // Both callers write somewhere scratch that may not exist yet: a runner's
  // temporary directory, or .wrangler/ in a fresh checkout.
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, channelsToSql(channels), 'utf8');
  console.log(`${output}: ${channels.length} channels from ${channelsPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
