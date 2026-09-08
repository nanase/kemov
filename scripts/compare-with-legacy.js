/**
 * Runs #66's comparison: what the collector says about each video, against
 * what the system it replaces says about the same video.
 *
 * Usage: node scripts/compare-with-legacy.js [api-base-url] [output-directory]
 *
 * The address defaults to the one #70 gave the API and can be overridden, so
 * that the same comparison can be pointed at a deployment that is not the
 * live one.
 *
 * Both sides are read over public HTTP. Nothing here needs Cloudflare
 * credentials: `GET /api/channels/:id/videos` returns every judgement column
 * with no filter on availability, so the rows the site never shows - the
 * deleted, the private - are in the answer too, and those are the rows this
 * comparison is mostly about.
 *
 * Nothing is committed. The output is what both systems held at the moment
 * they were read, and both are still writing.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadChannels } from './channels.js';
import { compareAll, summarise } from './compare-rules.js';

/**
 * Where the old system publishes one channel's videos.
 *
 * The same base src/config.ts names as videoUriBase, repeated for the reason
 * build-video-migration-sql.js gives: this runs under bare node, and #72
 * removes both spellings at once.
 */
const LEGACY_VIDEO_URI_BASE = 'https://d1zvseiqyto6c5.cloudfront.net/kemov/stats/video/';

/** Where the API answers, unless the caller names somewhere else. */
const API_BASE = 'https://kemov.nanase.cc';

/** How long one request may take, headers and body together. */
const FETCH_TIMEOUT_MS = 30_000;

/** The largest page the API serves. Fewer requests, same answer. */
const PAGE_SIZE = 200;

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });

  if (!response.ok) throw new Error(`${url} responded ${response.status}`);

  return response.json();
}

async function fetchLegacy(channelId) {
  const records = await getJson(`${LEGACY_VIDEO_URI_BASE}${channelId}.json`);

  if (!Array.isArray(records)) throw new Error(`legacy ${channelId} is not an array of videos`);

  return records;
}

/**
 * One channel's videos from the API, following the cursor to the end.
 *
 * The loop stops on a page that names no next cursor, and on one that comes
 * back empty. Neither covers a cursor the API hands back a second time: the
 * pages would keep arriving, full and identical, and the count would climb
 * until the process ran out of memory. The per-request deadline does not
 * catch it either, because every one of those requests answers promptly.
 *
 * A cursor encodes the last row's published_at and video_id and the next
 * query asks for rows strictly before it, so repeating one would be a fault
 * in the API rather than a shape it produces. That is the reason to stop
 * loudly rather than to cope: a comparison that silently counted a page twice
 * would report differences that are not there.
 */
async function fetchCurrent(base, channelId) {
  const videos = [];
  const seen = new Set();
  let cursor;

  for (;;) {
    const url = new URL(`${base}/api/channels/${channelId}/videos`);

    url.searchParams.set('limit', String(PAGE_SIZE));

    if (cursor !== undefined) url.searchParams.set('cursor', cursor);

    const page = await getJson(url);
    const items = page.videos ?? [];

    videos.push(...items);
    cursor = page.nextCursor ?? undefined;

    if (cursor === undefined || items.length === 0) break;
    if (seen.has(cursor)) throw new Error(`${channelId} paged back to a cursor it had already followed`);

    seen.add(cursor);
  }

  return videos;
}

function report(lines) {
  console.log(lines.join('\n'));
}

async function main() {
  const [base = API_BASE, outputDirectory] = process.argv.slice(2);

  const channels = loadChannels();
  const legacy = [];
  const current = [];

  for (const channel of channels) {
    const channelId = channel.channel_id;
    const [oldSide, newSide] = await Promise.all([fetchLegacy(channelId), fetchCurrent(base, channelId)]);

    legacy.push(...oldSide);
    current.push(...newSide);
    report([`${channelId} ${channel.name}: legacy ${oldSide.length}, current ${newSide.length}`]);
  }

  const result = compareAll(legacy, current);

  report([
    '',
    `legacy videos:     ${legacy.length}`,
    `current videos:    ${current.length}`,
    `compared:          ${result.compared}`,
    `only in legacy:    ${result.onlyOld.length}`,
    `only in current:   ${result.onlyNew.length}`,
    `differences:       ${result.differences.length}`,
    `unexplained:       ${result.unexplained.length}`,
    '',
    'differences by field and reason:',
  ]);

  for (const { field, reason, count } of summarise(result.differences)) {
    report([`  ${String(count).padStart(6)}  ${field.padEnd(22)} ${reason}`]);
  }

  if (outputDirectory !== undefined) {
    mkdirSync(outputDirectory, { recursive: true });

    // Ids and titles of deleted and private videos are in here, which is why
    // the caller has to name a directory and why that directory must not be
    // inside the repository.
    writeFileSync(join(outputDirectory, 'differences.json'), JSON.stringify(result.differences, null, 2));
    writeFileSync(join(outputDirectory, 'unexplained.json'), JSON.stringify(result.unexplained, null, 2));
    report(['', `written to ${outputDirectory}`]);
  }

  // An unexplained difference is the one outcome that is not a finding but a
  // question, so the run says so in its exit code as well as its output.
  if (result.unexplained.length > 0) process.exitCode = 1;
}

await main();
