/**
 * Writes the one-off SQL that seeds `video` from the system this replaces.
 *
 * Usage: node scripts/build-video-migration-sql.js <output-directory>
 *
 * One file per channel, named after the channel, plus a manifest naming the
 * order to run them in. A channel goes in whole or not at all - see
 * convertChannel in ./legacy-videos.js - so one file is one channel and a file
 * that fails can be re-run on its own.
 *
 * Nothing commits the output. It is what the old system holds at the moment it
 * is read, and it is still writing: the measured spread of fetched_at reaches
 * the present day and grows daily. A copy in the repository would be a
 * snapshot claiming to be the source.
 *
 * The files are handed to `wrangler d1 execute --file`, which needs Cloudflare
 * credentials for --remote. Ask the user to run that; this script only reads
 * public URLs and writes files.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { channelsPath, loadChannels } from './channels.js';
import { convertChannel, rowsToSql } from './legacy-videos.js';

/**
 * Where the old system publishes one channel's videos.
 *
 * The same base src/config.ts names as videoUriBase, repeated rather than
 * imported: that file is TypeScript the front end builds, and #70 replaces its
 * reader. Repeating it keeps this script runnable by bare node, and #72 - which
 * removes the old system - is where both spellings go at once.
 */
const VIDEO_URI_BASE = 'https://d1zvseiqyto6c5.cloudfront.net/kemov/stats/video/';

/**
 * How long one channel's file may take to arrive, headers and body together.
 *
 * The largest measured is half a megabyte, so this is not a limit any healthy
 * response comes near. It is here for the unhealthy one: without a deadline a
 * stalled connection waits for ever, and a script that has stopped looks
 * exactly like a script that is still working. Every other way this can fail
 * says so and stops - a bad status, a body that is not an array, a record that
 * cannot become a row - and a hang is the only one that would not.
 */
const FETCH_TIMEOUT_MS = 30_000;

async function fetchChannel(channelId) {
  const url = `${VIDEO_URI_BASE}${channelId}.json`;
  // One signal for the whole exchange. It stays armed while the body is read,
  // so a response that begins and then stalls is caught as well as one that
  // never begins.
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

  if (!response.ok) throw new Error(`${url} responded ${response.status}`);

  const records = await response.json();

  if (!Array.isArray(records)) throw new Error(`${url} is not an array of videos`);

  return { url, records };
}

async function main() {
  const [output] = process.argv.slice(2);

  if (output === undefined) {
    console.error('usage: node scripts/build-video-migration-sql.js <output-directory>');
    process.exit(2);
  }

  const channels = loadChannels();

  mkdirSync(output, { recursive: true });

  let read = 0;
  let written = 0;
  const skipped = [];
  const files = [];

  for (const { channel_id: channelId } of channels) {
    const { url, records } = await fetchChannel(channelId);
    const converted = convertChannel(records, channelId);
    const file = `${channelId}.sql`;

    writeFileSync(join(output, file), rowsToSql(converted.rows, channelId, url), 'utf8');

    read += converted.read;
    written += converted.rows.length;
    skipped.push(...converted.skipped);
    files.push(file);

    console.log(`${file}: read ${converted.read}, ${converted.rows.length} rows, ${converted.skipped.length} skipped`);
  }

  writeFileSync(join(output, 'manifest.txt'), `${files.join('\n')}\n`, 'utf8');

  // The count is reported rather than checked against a number written here.
  // The old system is still collecting, so any figure in this file would be
  // wrong by the time it ran. What has to hold is that every record read
  // became a row or a skip, which is arithmetic rather than a constant.
  console.log('');
  console.log(`channels:  ${channels.length} from ${channelsPath}`);
  console.log(`read:      ${read}`);
  console.log(`rows:      ${written}`);
  console.log(`skipped:   ${skipped.length}`);

  for (const [reason, count] of countByReason(skipped)) console.log(`  ${reason}: ${count}`);

  if (read !== written + skipped.length) {
    throw new Error(`read ${read} but produced ${written} rows and ${skipped.length} skips`);
  }
}

function countByReason(skipped) {
  const counts = new Map();

  for (const { reason } of skipped) counts.set(reason, (counts.get(reason) ?? 0) + 1);

  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
