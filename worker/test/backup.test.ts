import { env } from 'cloudflare:test';
import { runBackup } from '../src/collector/backup';
import {
  BACKED_UP_TABLES,
  backupKey,
  BYTES_PER_STATEMENT,
  dateFromKey,
  dayBounds,
  dayOf,
  daysBetween,
  daysPresent,
  latestDay,
  literal,
  MAX_DAYS_PER_RUN,
  missingDays,
  nextDay,
  previousDay,
  quote,
  ROWS_PER_STATEMENT,
  toSql,
} from '../src/lib/backup';

// #111's condition is being able to restore, not being able to export, so the
// test that matters is the round trip: write D1 out, empty it, put the files
// back, and compare. It runs on the D1 the deploy gets - pool-workers gives
// the real thing - so the SQL these files carry has to be SQL that database
// accepts, not SQL a mock would take.

/** Everything in a table, in a stable order, for comparing before with after. */
async function rowsOf(table: string, order: string): Promise<unknown[]> {
  const { results } = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all();

  return results;
}

/**
 * What a restore does: run the statements one file holds.
 *
 * A rough stand-in for what `wrangler d1 execute --file` does with the same
 * file. It drops the header comments and splits on the semicolon that ends a
 * statement, which is enough for files this shape and is not a general SQL
 * parser - a value containing a line that began with `--` would defeat it.
 * The real splitter is wrangler's, and #111 checks that one separately by
 * restoring into a D1 of its own.
 */
async function applyFile(sql: string): Promise<void> {
  const statements = sql
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .join('\n')
    .split(';\n')
    .map((statement) => statement.trim())
    .filter((statement) => statement !== '');

  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

/**
 * A stored channel, with every column filled.
 *
 * Unlike the collectors' own tests, these fill every column rather than the
 * few a job reads: what is being tested is that a column survives the round
 * trip, and a column left at its default would survive it either way.
 */
async function insertChannel(channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel (channel_id, name, fullname, globalname, twitter, color_key, color_sub,
                          color_light, color_back, activity_start_date, activity_end_date,
                          custom_url, thumbnail_url, fetched_at, display_order, twitch)
     VALUES (?1, 'あ', 'あの人', NULL, 'aaa', '#000000', '#111111', '#222222', '#333333',
             '2021-04-01', NULL, '@aaa', 'https://example.invalid/a.jpg', '2026-09-08T00:00:00Z', 3, 'aaa_twitch')`,
  )
    .bind(channelId)
    .run();
}

/**
 * A stored video, carrying an apostrophe, a NULL and a zero.
 *
 * Each is a way a generated literal can be wrong: the quoting, the four-letter
 * word for the absence, and a falsy number written as the empty string.
 */
async function insertVideo(videoId: string, channelId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO video (video_id, channel_id, title, published_at, availability, live_broadcast_content,
                        type, duration_seconds, view_count, like_count, comment_count,
                        chat_message_count, chat_unique_user_count,
                        scheduled_start_time, actual_start_time, actual_end_time, fetched_at)
     VALUES (?1, ?2, 'it''s a title', '2026-09-01T00:00:00Z', 'public', 'none',
             'video', 0, 0, NULL, 3, NULL, NULL, NULL, NULL, NULL, '2026-09-08T00:00:00Z')`,
  )
    .bind(videoId, channelId)
    .run();
}

async function insertSnapshot(channelId: string, fetchedAt: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
     VALUES (?1, ?2, 100, 200, 3)`,
  )
    .bind(channelId, fetchedAt)
    .run();
}

/**
 * One row of every table #144 added to `BACKED_UP_TABLES`, wired together so
 * every foreign key among them is satisfied. Depends on `seed`'s `channel`
 * ('UCaaa') and `video` ('vid1') rows.
 *
 * `revision` gets three rows on the same days as `insertSnapshot`'s, so the
 * round trip below exercises its day-at-a-time write the same way it already
 * does for `channel_snapshot`.
 */
async function seedAdminTables(): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO channel_snapshot_exclusion (channel_id, fetched_at, reason) VALUES ('UCaaa', '2026-09-06T00:00:00Z', 'test')`,
  ).run();
  await env.DB.prepare(`INSERT INTO video_override (video_id, title) VALUES ('vid1', 'overridden title')`).run();

  await env.DB.prepare(
    `INSERT INTO footprints_event (date_precision, start_date, kind, title)
     VALUES ('day', '2026-01-01', 'other', 'イベント')`,
  ).run();
  const event = await env.DB.prepare('SELECT event_id FROM footprints_event').first<{ event_id: number }>();
  const eventId = event!.event_id;

  await env.DB.prepare('INSERT INTO footprints_event_member (event_id, channel_id) VALUES (?1, ?2)')
    .bind(eventId, 'UCaaa')
    .run();
  await env.DB.prepare(
    "INSERT INTO footprints_event_source (event_id, position, url, title) VALUES (?1, 1, 'https://example.invalid', NULL)",
  )
    .bind(eventId)
    .run();

  await env.DB.prepare("INSERT INTO genet_person (name) VALUES ('作曲家')").run();
  const person = await env.DB.prepare('SELECT person_id FROM genet_person').first<{ person_id: number }>();
  const personId = person!.person_id;

  await env.DB.prepare("INSERT INTO genet_tune (title) VALUES ('曲名')").run();
  const tune = await env.DB.prepare('SELECT tune_id FROM genet_tune').first<{ tune_id: number }>();
  const tuneId = tune!.tune_id;

  await env.DB.prepare("INSERT INTO genet_tune_attribute (tune_id, position, name) VALUES (?1, 1, '作曲')")
    .bind(tuneId)
    .run();
  await env.DB.prepare(
    'INSERT INTO genet_tune_attribute_person (tune_id, attribute_position, position, person_id) VALUES (?1, 1, 1, ?2)',
  )
    .bind(tuneId, personId)
    .run();
  await env.DB.prepare(
    "INSERT INTO genet_tune_video (tune_id, position, video_id, title) VALUES (?1, 1, 'tvid1', '関連動画')",
  )
    .bind(tuneId)
    .run();
  await env.DB.prepare(
    "INSERT INTO genet_tune_score (tune_id, position, url, title) VALUES (?1, 1, 'https://example.invalid/score', '楽譜')",
  )
    .bind(tuneId)
    .run();

  await env.DB.prepare(
    `INSERT INTO genet_stream (video_id, video_type, title, published_at)
     VALUES ('gvid1', 'video', '配信', '2026-09-01T00:00:00Z')`,
  ).run();
  await env.DB.prepare('INSERT INTO genet_performance (video_id, position, tune_id) VALUES (?1, 1, ?2)')
    .bind('gvid1', tuneId)
    .run();
  await env.DB.prepare(
    "INSERT INTO genet_scene (video_id, position, scene_position, style, scene_video_id) VALUES (?1, 1, 1, 'play', ?1)",
  )
    .bind('gvid1')
    .run();

  let revisionId = 0;

  for (const createdAt of ['2026-09-06T00:00:00Z', '2026-09-06T00:10:00Z', '2026-09-07T00:00:00Z']) {
    const revision = await env.DB.prepare(
      "INSERT INTO revision (entity, entity_key, action, body, created_at) VALUES ('channel', 'UCaaa', 'save', '{}', ?1) RETURNING revision_id",
    )
      .bind(createdAt)
      .first<{ revision_id: number }>();

    revisionId = revision!.revision_id;
  }

  await env.DB.prepare(
    "INSERT INTO publication (target, last_revision_id, object_key, byte_length) VALUES ('footprints', ?1, 'footprints/events.json', 10)",
  )
    .bind(revisionId)
    .run();
}

/**
 * Two snapshot days, so that a run has a finished day and an unfinished one,
 * plus one row of every table #144 added to `BACKED_UP_TABLES`.
 */
async function seed(): Promise<void> {
  await insertChannel('UCaaa');
  await insertVideo('vid1', 'UCaaa');

  for (const fetchedAt of ['2026-09-06T00:00:00Z', '2026-09-06T00:10:00Z', '2026-09-07T00:00:00Z']) {
    await insertSnapshot('UCaaa', fetchedAt);
  }

  await seedAdminTables();
}

async function clearEverything(): Promise<void> {
  // `publication` and `revision` each carry a trigger refusing a DELETE
  // (append-only, see migrations/0005_add_revision_and_publication.sql), so
  // the DELETE loop below would be refused for them. Dropped here and put
  // back from its own sqlite_master text afterward - not retyped - so this
  // cannot drift from whatever the migration defines. What it protects in
  // production, a row surviving until this file's tests are done, is not
  // weakened: the trigger is gone only for the moment this function runs.
  const triggers = await env.DB.prepare(
    `SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('publication', 'revision')`,
  ).all<{ name: string; sql: string }>();

  for (const trigger of triggers.results) {
    await env.DB.prepare(`DROP TRIGGER ${trigger.name}`).run();
  }

  // Children before parents: the foreign keys refuse it in any other order.
  for (const table of [
    'chat_author',
    'collect_task',
    'genet_scene',
    'genet_performance',
    'genet_tune_video',
    'genet_tune_score',
    'genet_tune_attribute_person',
    'genet_tune_attribute',
    'genet_stream',
    'genet_tune',
    'genet_person',
    'footprints_event_source',
    'footprints_event_member',
    'footprints_event',
    'channel_snapshot_exclusion',
    'video_override',
    'publication',
    'revision',
    'channel_snapshot',
    'video',
    'channel',
  ]) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }

  for (const trigger of triggers.results) {
    await env.DB.prepare(trigger.sql).run();
  }
}

async function clearBucket(): Promise<void> {
  const listed = await env.BACKUP.list();

  await Promise.all(listed.objects.map((object) => env.BACKUP.delete(object.key)));
}

beforeEach(async () => {
  await clearEverything();
  await clearBucket();
});

describe('runBackup', () => {
  test('writes every table it carries', async () => {
    await seed();

    await runBackup(env, new Date('2026-09-08T00:20:00Z'));

    const keys = (await env.BACKUP.list()).objects.map((object) => object.key).sort();

    expect(keys).toEqual([
      backupKey('channel', '2026-09-08'),
      backupKey('channel_snapshot', '2026-09-06'),
      backupKey('channel_snapshot', '2026-09-07'),
      backupKey('channel_snapshot_exclusion', '2026-09-08'),
      backupKey('footprints_event', '2026-09-08'),
      backupKey('footprints_event_member', '2026-09-08'),
      backupKey('footprints_event_source', '2026-09-08'),
      backupKey('genet_performance', '2026-09-08'),
      backupKey('genet_person', '2026-09-08'),
      backupKey('genet_scene', '2026-09-08'),
      backupKey('genet_stream', '2026-09-08'),
      backupKey('genet_tune', '2026-09-08'),
      backupKey('genet_tune_attribute', '2026-09-08'),
      backupKey('genet_tune_attribute_person', '2026-09-08'),
      backupKey('genet_tune_score', '2026-09-08'),
      backupKey('genet_tune_video', '2026-09-08'),
      backupKey('publication', '2026-09-08'),
      backupKey('revision', '2026-09-06'),
      backupKey('revision', '2026-09-07'),
      backupKey('video', '2026-09-08'),
      backupKey('video_override', '2026-09-08'),
    ]);
  });

  // The whole point of the issue. Everything else here is a detail of it.
  // Covers every table in BACKED_UP_TABLES, #144's additions included, rather
  // than naming a few by hand: a table left out of this loop by mistake would
  // be a table this test could not have caught missing a column.
  test('restores a database that has been emptied', async () => {
    await seed();

    const before = new Map(
      await Promise.all(
        BACKED_UP_TABLES.map(
          async (table) => [table.name, await rowsOf(table.name, table.conflict.join(', '))] as const,
        ),
      ),
    );

    await runBackup(env, new Date('2026-09-08T00:20:00Z'));

    const files = await Promise.all(
      (await env.BACKUP.list()).objects.map(async (object) => ({
        key: object.key,
        sql: await (await env.BACKUP.get(object.key))!.text(),
      })),
    );

    await clearEverything();
    expect(await rowsOf('channel', 'channel_id')).toEqual([]);

    // The order BACKED_UP_TABLES is written in, which is the order the
    // foreign keys require. A restore that applied a child before its parent
    // would be refused, so the order is part of what is being tested.
    for (const table of BACKED_UP_TABLES) {
      for (const file of files.filter((candidate) => candidate.key.startsWith(`${table.name}/`))) {
        await applyFile(file.sql);
      }
    }

    for (const table of BACKED_UP_TABLES) {
      expect(await rowsOf(table.name, table.conflict.join(', '))).toEqual(before.get(table.name));
    }
  });

  // A restore is not a calm operation, and whoever runs it should not have to
  // remember which files they have already applied.
  test('applying a file twice changes nothing', async () => {
    await seed();
    await runBackup(env, new Date('2026-09-08T00:20:00Z'));

    const sql = await (await env.BACKUP.get(backupKey('video', '2026-09-08')))!.text();
    const before = await rowsOf('video', 'video_id');

    await applyFile(sql);
    await applyFile(sql);

    expect(await rowsOf('video', 'video_id')).toEqual(before);
  });

  // Today is still being written to. A day's file is written once and never
  // revisited, so writing today's would freeze a partial day for good.
  test('does not write the day that is still running', async () => {
    await seed();

    await runBackup(env, new Date('2026-09-07T23:50:00Z'));

    const keys = (await env.BACKUP.list({ prefix: 'channel_snapshot/' })).objects.map((object) => object.key);

    expect(keys).toEqual([backupKey('channel_snapshot', '2026-09-06')]);
  });

  test('leaves a day it has already written alone', async () => {
    await seed();
    await env.BACKUP.put(backupKey('channel_snapshot', '2026-09-06'), '-- written earlier\n');

    await runBackup(env, new Date('2026-09-08T00:20:00Z'));

    const kept = await (await env.BACKUP.get(backupKey('channel_snapshot', '2026-09-06')))!.text();

    expect(kept).toEqual('-- written earlier\n');
  });

  test('replaces the whole-table files each run', async () => {
    await seed();
    await runBackup(env, new Date('2026-09-08T00:20:00Z'));

    await env.DB.prepare("UPDATE video SET title = 'renamed'").run();
    await runBackup(env, new Date('2026-09-08T00:20:00Z'));

    const sql = await (await env.BACKUP.get(backupKey('video', '2026-09-08')))!.text();

    expect(sql).toContain('renamed');
  });

  // One table failing is not a reason to write none of the others: a backup
  // carrying two tables of three is worth more than no backup, and the next
  // run writes the third.
  test('writes the tables it can when one fails', async () => {
    await seed();

    const put = env.BACKUP.put.bind(env.BACKUP);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(env.BACKUP, 'put').mockImplementation(async (...args: Parameters<R2Bucket['put']>) => {
      if (String(args[0]).startsWith('video/')) throw new Error('R2 said no');

      return put(...args);
    });

    await runBackup(env, new Date('2026-09-08T00:20:00Z'));

    const keys = (await env.BACKUP.list()).objects.map((object) => object.key);

    expect(keys).toContain(backupKey('channel', '2026-09-08'));
    expect(keys).toContain(backupKey('channel_snapshot', '2026-09-06'));
    expect(error).toHaveBeenCalledWith('backup: video failed', expect.any(Error));

    vi.restoreAllMocks();
  });

  // D1 answers each page as its own query with no snapshot across them, so
  // the reading has to page by the key. A day holds 1,584 rows in production,
  // which is already more than one page.
  test('reads a day that is longer than one page', async () => {
    await insertChannel('UCaaa');

    const total = 1_050;
    const values = Array.from(
      { length: total },
      (_, index) =>
        `('UCaaa', '2026-09-07T${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}:00Z', ${index}, 200, 3)`,
    );

    await env.DB.prepare(
      `INSERT INTO channel_snapshot (channel_id, fetched_at, subscriber_count, view_count, video_count)
       VALUES ${values.join(', ')}`,
    ).run();

    await runBackup(env, new Date('2026-09-08T00:20:00Z'));

    const sql = await (await env.BACKUP.get(backupKey('channel_snapshot', '2026-09-07')))!.text();

    expect(sql).toContain(`-- ${total} rows of channel_snapshot`);
    // The first row, one either side of the page boundary, and the last.
    for (const subscriberCount of [0, 999, 1_000, total - 1]) {
      expect(sql).toContain(`, ${subscriberCount}, 200, 3)`);
    }
  });

  test('writes nothing for a database with no snapshots', async () => {
    await runBackup(env, new Date('2026-09-08T00:20:00Z'));

    const keys = (await env.BACKUP.list({ prefix: 'channel_snapshot/' })).objects;

    expect(keys).toEqual([]);
  });
});

// This is what channel.display_order and channel.twitch were missing from
// (2026-09-18): both are columns D1 has always had, so nothing above would
// have failed to seed or restore them - it is only a value nobody set that
// happened to match the column's own default. Comparing the two lists of
// names directly is what actually catches a table gaining a column
// BACKED_UP_TABLES was not told about.
describe('BACKED_UP_TABLES columns', () => {
  test('names every column D1 has for each table, and no other', async () => {
    for (const table of BACKED_UP_TABLES) {
      const { results } = await env.DB.prepare('SELECT name FROM pragma_table_info(?1)').bind(table.name).all<{
        name: string;
      }>();

      expect(new Set(table.columns), table.name).toEqual(new Set(results.map((row) => row.name)));
    }
  });
});

describe('quote', () => {
  test('doubles an apostrophe rather than ending the string', () => {
    expect(quote("it's")).toEqual("'it''s'");
  });

  test('writes the absence as NULL rather than as the word', () => {
    expect(quote(null)).toEqual('NULL');
    expect(quote(undefined)).toEqual('NULL');
    expect(quote('NULL')).toEqual("'NULL'");
  });
});

describe('literal', () => {
  // The tables are STRICT, so a count written as '12' is text offered to an
  // INTEGER column.
  test('leaves a number unquoted', () => {
    expect(literal(12)).toEqual('12');
  });

  // Falsy, and the one a `value || ...` would turn into the empty string.
  test('writes zero as zero', () => {
    expect(literal(0)).toEqual('0');
  });

  test('quotes a number that arrived as text', () => {
    expect(literal('12')).toEqual("'12'");
  });
});

describe('dayOf', () => {
  test('takes the date off an instant', () => {
    expect(dayOf('2026-09-07T23:59:59Z')).toEqual('2026-09-07');
  });
});

describe('nextDay', () => {
  test('names the day after', () => {
    expect(nextDay('2026-09-07')).toEqual('2026-09-08');
  });

  test('crosses the end of a month', () => {
    expect(nextDay('2026-09-30')).toEqual('2026-10-01');
  });

  test('crosses the end of a year', () => {
    expect(nextDay('2026-12-31')).toEqual('2027-01-01');
  });

  // February 2028 has 29 days, and a day-of-month arithmetic that did not
  // know it would name the 29th twice or skip it.
  test('crosses a leap day', () => {
    expect(nextDay('2028-02-28')).toEqual('2028-02-29');
  });
});

describe('previousDay', () => {
  test('names the day before', () => {
    expect(previousDay('2026-09-07')).toEqual('2026-09-06');
  });

  test('crosses the start of a month', () => {
    expect(previousDay('2026-10-01')).toEqual('2026-09-30');
  });

  test('crosses the start of a year', () => {
    expect(previousDay('2027-01-01')).toEqual('2026-12-31');
  });

  test('crosses a leap day', () => {
    expect(previousDay('2028-03-01')).toEqual('2028-02-29');
  });
});

describe('toSql', () => {
  const video = BACKED_UP_TABLES.find((table) => table.name === 'video')!;

  /** A row whose title is `titleBytes` bytes of ASCII, the rest kept small. */
  function videoRow(index: number, titleBytes: number): Record<string, unknown> {
    return Object.fromEntries(
      video.columns.map((column) => [
        column,
        column === 'video_id' ? `v${index}` : column === 'title' ? 'x'.repeat(titleBytes) : null,
      ]),
    );
  }

  const bytesOf = (text: string) => new TextEncoder().encode(text).length;

  /** Just the statements, without the header comments toSql writes above them. */
  const statementsOf = (sql: string) =>
    sql
      .split('\n')
      .filter((line) => !line.startsWith('--'))
      .join('\n')
      .split(';\n')
      .map((statement) => statement.trim())
      .filter((statement) => statement !== '');

  test('names at most ROWS_PER_STATEMENT rows in one statement', () => {
    const sql = toSql(
      video,
      Array.from({ length: ROWS_PER_STATEMENT + 1 }, (_, index) => videoRow(index, 10)),
      'note',
    );

    expect(statementsOf(sql)).toHaveLength(2);
  });

  // D1 refuses a statement over 100,000 bytes. Production reaches 74% of that
  // with 200 rows of video, and 87% over the same rows grouped another way,
  // so how close a batch gets is not something the row cap controls.
  test('splits before the byte cap even when the row cap is not reached', () => {
    const rows = Array.from({ length: ROWS_PER_STATEMENT }, (_, index) => videoRow(index, 1_000));
    const statements = statementsOf(toSql(video, rows, 'note'));

    expect(statements.length).toBeGreaterThan(1);

    for (const statement of statements) {
      expect(bytesOf(statement)).toBeLessThanOrEqual(BYTES_PER_STATEMENT);
    }
  });

  test('keeps every row when it splits', () => {
    const rows = Array.from({ length: ROWS_PER_STATEMENT }, (_, index) => videoRow(index, 1_000));
    const sql = toSql(video, rows, 'note');

    for (const row of rows) {
      expect(sql).toContain(`('${String(row.video_id)}',`);
    }
  });

  // Nothing here can split one row, so the alternative is a file carrying a
  // statement D1 will refuse - which looks like a backup, and stops a restore
  // partway through. Failing leaves yesterday's file, which works.
  test('refuses a row too large to fit in any statement', () => {
    expect(() => toSql(video, [videoRow(1, BYTES_PER_STATEMENT + 1_000)], 'note')).toThrowError(/one row of video/);
  });

  test('names the row it refused, so it can be found', () => {
    expect(() => toSql(video, [videoRow(7, BYTES_PER_STATEMENT + 1_000)], 'note')).toThrowError(/\(v7\)/);
  });

  // The row after it is what a batch's first tuple actually costs: no
  // separator, because there is nothing before it to separate it from.
  test('does not charge the first tuple of a batch for a separator', () => {
    const rows = Array.from({ length: ROWS_PER_STATEMENT }, (_, index) => videoRow(index, 1_000));

    for (const statement of statementsOf(toSql(video, rows, 'note'))) {
      expect(bytesOf(statement)).toBeLessThanOrEqual(BYTES_PER_STATEMENT);
    }
  });

  test('writes no statement for a table with no rows', () => {
    expect(statementsOf(toSql(video, [], 'note'))).toEqual([]);
  });
});

describe('missingDays', () => {
  test('names the days R2 does not have, oldest first', () => {
    expect(missingDays('2026-09-06', '2026-09-09', new Set(['2026-09-07']))).toEqual([
      '2026-09-06',
      '2026-09-08',
      '2026-09-09',
    ]);
  });

  // Nothing has run for a fortnight is a state this has to survive. Reading a
  // fortnight of snapshots in one invocation is how it would fail to.
  test('stops at the cap so that a long gap closes over several runs', () => {
    expect(missingDays('2026-01-01', '2026-12-31', new Set())).toHaveLength(MAX_DAYS_PER_RUN);
  });

  test('has nothing to do when every day is there', () => {
    expect(missingDays('2026-09-06', '2026-09-07', new Set(['2026-09-06', '2026-09-07']))).toEqual([]);
  });
});

describe('dayBounds', () => {
  // Half open: the instant midnight names belongs to the day that starts, not
  // to the one that ends, so no snapshot lands in two files or in neither.
  test('covers a day from its midnight to the next', () => {
    expect(dayBounds('2026-09-07')).toEqual({ from: '2026-09-07T00:00:00Z', to: '2026-09-08T00:00:00Z' });
  });

  test('crosses the end of a month', () => {
    expect(dayBounds('2026-09-30')).toEqual({ from: '2026-09-30T00:00:00Z', to: '2026-10-01T00:00:00Z' });
  });

  test('crosses the end of a year', () => {
    expect(dayBounds('2026-12-31')).toEqual({ from: '2026-12-31T00:00:00Z', to: '2027-01-01T00:00:00Z' });
  });
});

describe('dateFromKey', () => {
  test('reads back the date backupKey wrote', () => {
    expect(dateFromKey('channel_snapshot', backupKey('channel_snapshot', '2026-09-07'))).toEqual('2026-09-07');
  });

  test.each(['channel_snapshot/notadate.sql', 'channel_snapshot/2026-09-07.txt', 'video/2026-09-07.sql'])(
    'has no date for %s',
    (key) => {
      expect(dateFromKey('channel_snapshot', key)).toBeNull();
    },
  );

  // The regex alone would take this: Date rolls February 31 over into March
  // rather than refusing it, and a stray object under the prefix - a typo
  // from checking the bucket by hand - must not be read back as a date.
  test('refuses a date the calendar has no such day on', () => {
    expect(dateFromKey('channel_snapshot', 'channel_snapshot/2026-02-31.sql')).toBeNull();
  });
});

describe('daysPresent', () => {
  test('reads back the days one table has files for, apart from another table', async () => {
    await env.BACKUP.put(backupKey('video', '2026-09-08'), '');
    await env.BACKUP.put(backupKey('video', '2026-09-09'), '');
    await env.BACKUP.put(backupKey('channel', '2026-09-08'), '');

    expect(await daysPresent(env.BACKUP, 'video')).toEqual(new Set(['2026-09-08', '2026-09-09']));
  });

  test('has nothing to say about a table with no files', async () => {
    expect(await daysPresent(env.BACKUP, 'video')).toEqual(new Set());
  });
});

describe('latestDay', () => {
  test('names the newest of several days', async () => {
    await env.BACKUP.put(backupKey('video', '2026-09-08'), '');
    await env.BACKUP.put(backupKey('video', '2026-09-10'), '');
    await env.BACKUP.put(backupKey('video', '2026-09-09'), '');

    expect(await latestDay(env.BACKUP, 'video')).toEqual('2026-09-10');
  });

  test('is null for a table with no files', async () => {
    expect(await latestDay(env.BACKUP, 'video')).toBeNull();
  });
});

describe('daysBetween', () => {
  test('is zero for the same day', () => {
    expect(daysBetween('2026-09-10', '2026-09-10')).toEqual(0);
  });

  test('counts a day written yesterday as one day ago', () => {
    expect(daysBetween('2026-09-09', '2026-09-10')).toEqual(1);
  });

  test('crosses the end of a month', () => {
    expect(daysBetween('2026-08-31', '2026-09-02')).toEqual(2);
  });
});
