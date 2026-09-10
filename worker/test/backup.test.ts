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
                          custom_url, thumbnail_url, fetched_at)
     VALUES (?1, 'あ', 'あの人', NULL, 'aaa', '#000000', '#111111', '#222222', '#333333',
             '2021-04-01', NULL, '@aaa', 'https://example.invalid/a.jpg', '2026-09-08T00:00:00Z')`,
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

/** Two snapshot days, so that a run has a finished day and an unfinished one. */
async function seed(): Promise<void> {
  await insertChannel('UCaaa');
  await insertVideo('vid1', 'UCaaa');

  for (const fetchedAt of ['2026-09-06T00:00:00Z', '2026-09-06T00:10:00Z', '2026-09-07T00:00:00Z']) {
    await insertSnapshot('UCaaa', fetchedAt);
  }
}

async function clearEverything(): Promise<void> {
  // Children before parents: the foreign keys refuse it in any other order.
  for (const table of ['chat_author', 'collect_task', 'channel_snapshot', 'video', 'channel']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
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
      backupKey('video', '2026-09-08'),
    ]);
  });

  // The whole point of the issue. Everything else here is a detail of it.
  test('restores a database that has been emptied', async () => {
    await seed();

    const before = {
      channel: await rowsOf('channel', 'channel_id'),
      video: await rowsOf('video', 'video_id'),
      channel_snapshot: await rowsOf('channel_snapshot', 'channel_id, fetched_at'),
    };

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
    // foreign keys require. A restore that applied video first would be
    // refused, so the order is part of what is being tested.
    for (const table of BACKED_UP_TABLES) {
      for (const file of files.filter((candidate) => candidate.key.startsWith(`${table.name}/`))) {
        await applyFile(file.sql);
      }
    }

    expect(await rowsOf('channel', 'channel_id')).toEqual(before.channel);
    expect(await rowsOf('video', 'video_id')).toEqual(before.video);
    expect(await rowsOf('channel_snapshot', 'channel_id, fetched_at')).toEqual(before.channel_snapshot);
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
