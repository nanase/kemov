/**
 * Reading, validating and seeding channels.yml.
 *
 * This is JavaScript rather than TypeScript on purpose. It runs under bare
 * node in a CI step and in the deploy, both before anything is built, so
 * keeping it plain means there is no toolchain between the file and the run.
 */

import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { literal, quote } from './sql.js';

/** The master file, relative to the repository root. */
export const channelsPath = 'channels.yml';

/**
 * The fields every entry carries. `activity_end_date` is here rather than in
 * the optional list because it is state, not an attribute: writing `null`
 * says the streamer is active, and leaving the key out would say the same
 * thing without anybody having decided it.
 */
const requiredFields = ['channel_id', 'name', 'fullname', 'color', 'activity_start_date', 'activity_end_date'];

/**
 * Fields an entry may leave out. `globalname` and `twitter` are nullable
 * columns; `twitch` is not a column at all, and `channelsToSql` says why it is
 * carried anyway.
 */
const optionalFields = ['globalname', 'twitter', 'twitch'];

/** The four colours, in the order the site uses them. */
const colorFields = ['key', 'sub', 'light', 'back'];

/** A YouTube channel id: `UC` and 22 characters of base64url. */
const channelIdPattern = /^UC[\w-]{22}$/;

/** `#RRGGBB`, either case: the site emits the value into CSS as it is written here. */
const colorPattern = /^#[0-9A-Fa-f]{6}$/;

/** An X handle, without the `@`: letters, digits and underscore, up to 15. */
const twitterPattern = /^\w{1,15}$/;

/** A Twitch login: letters, digits and underscore, 4 to 25. */
const twitchPattern = /^\w{4,25}$/;

/** Shape only. `isRealDate` decides whether the numbers name a day. */
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether `value` is a date that exists. The pattern above admits 2023-02-29
 * and 2025-04-31; a round trip through Date does not.
 */
function isRealDate(value) {
  return datePattern.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
}

/** Whether `value` is a string with something in it. */
function isFilledString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

/** Whether `value` is a plain mapping rather than a list, a scalar or null. */
function isMapping(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Reports every problem with one entry's `color` mapping through `report`. */
function checkColor(color, report) {
  if (!isMapping(color)) {
    report('color must be a mapping of key, sub, light and back');
    return;
  }

  for (const field of colorFields) {
    if (!(field in color)) {
      report(`color.${field} is missing`);
    } else if (!isFilledString(color[field]) || !colorPattern.test(color[field])) {
      report(`color.${field} must be #RRGGBB, not ${JSON.stringify(color[field])}`);
    }
  }

  for (const field of Object.keys(color)) {
    if (!colorFields.includes(field)) {
      report(`color.${field} is not a colour this file has`);
    }
  }
}

/**
 * Reports every problem with one entry through `report`.
 *
 * Which entry it is belongs to the caller: `findProblems` knows the position
 * and can name an entry that has no usable id.
 */
function checkEntry(entry, report) {
  if (!isMapping(entry)) {
    report('entry must be a mapping');
    return;
  }

  for (const field of requiredFields) {
    if (!(field in entry)) {
      report(`${field} is missing`);
    }
  }

  for (const field of Object.keys(entry)) {
    if (!requiredFields.includes(field) && !optionalFields.includes(field)) {
      report(`${field} is not a field this file has`);
    }
  }

  if ('channel_id' in entry && !channelIdPattern.test(entry.channel_id)) {
    report(`channel_id must be a YouTube channel id, not ${JSON.stringify(entry.channel_id)}`);
  }

  for (const field of ['name', 'fullname']) {
    if (field in entry && !isFilledString(entry[field])) {
      report(`${field} must be a non-empty string, not ${JSON.stringify(entry[field])}`);
    }
  }

  if ('globalname' in entry && !isFilledString(entry.globalname)) {
    report(`globalname must be a non-empty string or be left out, not ${JSON.stringify(entry.globalname)}`);
  }

  if ('twitter' in entry && !twitterPattern.test(entry.twitter)) {
    report(`twitter must be a handle without the @, not ${JSON.stringify(entry.twitter)}`);
  }

  if ('twitch' in entry && !twitchPattern.test(entry.twitch)) {
    report(`twitch must be a Twitch login, not ${JSON.stringify(entry.twitch)}`);
  }

  if ('color' in entry) {
    checkColor(entry.color, report);
  }

  // Quoting matters here: an unquoted 2021-04-26 arrives as a Date, and the
  // column wants the text.
  if ('activity_start_date' in entry && !isRealDate(entry.activity_start_date)) {
    report(`activity_start_date must be a quoted YYYY-MM-DD date, not ${JSON.stringify(entry.activity_start_date)}`);
  }

  if ('activity_end_date' in entry && entry.activity_end_date !== null && !isRealDate(entry.activity_end_date)) {
    report(
      `activity_end_date must be a quoted YYYY-MM-DD date or null, not ${JSON.stringify(entry.activity_end_date)}`,
    );
  }

  if (isRealDate(entry.activity_start_date) && isRealDate(entry.activity_end_date)) {
    if (entry.activity_end_date < entry.activity_start_date) {
      report(`activity_end_date ${entry.activity_end_date} is before activity_start_date ${entry.activity_start_date}`);
    }
  }
}

/**
 * Everything wrong with `channels`, as one message per problem.
 *
 * Every problem is collected rather than thrown at the first one, so a person
 * fixing the file sees the whole list instead of one round trip per mistake.
 */
export function findProblems(channels) {
  if (!Array.isArray(channels)) {
    return ['the file must hold a list of channels'];
  }

  if (channels.length === 0) {
    return ['the file must hold at least one channel'];
  }

  const problems = [];
  const seenAt = new Map();

  channels.forEach((entry, index) => {
    // The channel id names the entry once it is known to be one; until then
    // the position is all there is to point at.
    const where = isMapping(entry) && isFilledString(entry.channel_id) ? entry.channel_id : `entry ${index + 1}`;

    checkEntry(entry, (problem) => problems.push(`${where}: ${problem}`));

    if (!isMapping(entry)) {
      return;
    }

    if (isFilledString(entry.channel_id)) {
      const first = seenAt.get(entry.channel_id);

      if (first === undefined) {
        seenAt.set(entry.channel_id, index + 1);
      } else {
        problems.push(`${where}: appears twice, at entry ${first} and entry ${index + 1}`);
      }
    }
  });

  return problems;
}

/** The channels in `path`, or a throw naming every problem with the file. */
export function loadChannels(path = channelsPath) {
  const channels = load(readFileSync(path, 'utf8'));
  const problems = findProblems(channels);

  if (problems.length > 0) {
    throw new Error(
      [`${path} has ${problems.length} problem(s):`, ...problems.map((problem) => `  - ${problem}`)].join('\n'),
    );
  }

  return channels;
}

/**
 * The statement that brings the `channel` table up to date with `channels`.
 *
 * The columns listed are the ones channels.yml masters, and the update names
 * them one by one. `custom_url`, `thumbnail_url` and `fetched_at` belong to
 * the collector and are therefore absent: a `REPLACE`, or an update that
 * mentioned them, would blank what the last collection fetched. Nothing here
 * deletes either. A row dropped from the YAML stays in the table, because the
 * snapshots and videos pointing at it are the history.
 *
 * `twitch` is absent for a different reason, which channels.yml gives: no
 * column holds it, and the file carries it anyway.
 *
 * `display_order` has no field of its own in an entry. The file's own
 * ordering is the order the site shows streamers in - see the comment at the
 * top of channels.yml - so this writes each entry's position in the array
 * rather than reading a column back out of it.
 */
export function channelsToSql(channels) {
  const columns = [
    'channel_id',
    'name',
    'fullname',
    'globalname',
    'twitter',
    'color_key',
    'color_sub',
    'color_light',
    'color_back',
    'activity_start_date',
    'activity_end_date',
    'display_order',
  ];

  const rows = channels.map((channel, index) =>
    [
      quote(channel.channel_id),
      quote(channel.name),
      quote(channel.fullname),
      quote(channel.globalname),
      quote(channel.twitter),
      quote(channel.color.key),
      quote(channel.color.sub),
      quote(channel.color.light),
      quote(channel.color.back),
      quote(channel.activity_start_date),
      quote(channel.activity_end_date),
      literal(index),
    ].join(', '),
  );

  // Everything but the primary key, which is what the conflict is on.
  const updates = columns
    .filter((column) => column !== 'channel_id')
    .map((column) => `  ${column} = excluded.${column}`);

  return [
    `-- Generated from ${channelsPath} by scripts/build-channels-sql.js. Do not edit.`,
    `INSERT INTO channel (${columns.join(', ')})`,
    'VALUES',
    `${rows.map((row) => `  (${row})`).join(',\n')}`,
    'ON CONFLICT (channel_id) DO UPDATE SET',
    `${updates.join(',\n')};`,
    '',
  ].join('\n');
}
