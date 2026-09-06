import { convertChannel, rowsToSql, toCount, toTimestamp, toVideoRow, ROWS_PER_STATEMENT } from '../legacy-videos.js';

const channelId = 'UCEcMIuGR8WO2TwL9XIpjKtw';

/** A legacy record the old system would call complete, plus `overrides`. */
function record(overrides = {}) {
  return {
    videoId: 'aaaaaaaaaaa',
    publishedAt: '2026-05-05T01:02:03Z',
    fetchedAt: '2026-09-03T19:08:12.474Z',
    availability: 'public',
    title: 'ある配信',
    liveBroadcastContent: 'none',
    type: 'streaming',
    duration: 'PT2H5M1S',
    viewCount: 4200,
    likeCount: 12,
    commentCount: 3,
    chatMessageCount: 900,
    chatUniqueUserCount: 40,
    scheduledStartTime: '2026-05-05T02:00:00Z',
    actualStartTime: '2026-05-05T02:01:12Z',
    actualEndTime: '2026-05-05T04:06:13Z',
    ...overrides,
  };
}

const rowOf = (overrides = {}) => toVideoRow(record(overrides), channelId).row;

describe('toCount', () => {
  test('keeps a count', () => {
    expect(toCount(4200)).toEqual(4200);
  });

  test('keeps zero', () => {
    expect(toCount(0)).toEqual(0);
  });

  // The old system's two ways of saying it has nothing. -1 is in 2,016 rows
  // of the measured data and '' in a few hundred; the CHECK refuses the first
  // and STRICT refuses the second.
  test('is null for the give-up marker', () => {
    expect(toCount(-1)).toBeNull();
  });

  test('is null for the empty string', () => {
    expect(toCount('')).toBeNull();
  });

  test('is null for an absent value', () => {
    expect(toCount(undefined)).toBeNull();
    expect(toCount(null)).toBeNull();
  });

  test('is null for anything the column would refuse', () => {
    expect(toCount(-2)).toBeNull();
    expect(toCount(1.5)).toBeNull();
    expect(toCount('many')).toBeNull();
  });
});

describe('toTimestamp', () => {
  test('keeps an instant already in the schema shape', () => {
    expect(toTimestamp('2026-05-05T01:02:03Z')).toEqual('2026-05-05T01:02:03Z');
  });

  // Every fetchedAt in the measured data carries milliseconds.
  test('drops milliseconds', () => {
    expect(toTimestamp('2026-09-03T19:08:12.474Z')).toEqual('2026-09-03T19:08:12Z');
  });

  test('converts an offset to Z', () => {
    expect(toTimestamp('2026-09-06T14:13:29-07:00')).toEqual('2026-09-06T21:13:29Z');
  });

  test('is null for the empty string', () => {
    expect(toTimestamp('')).toBeNull();
  });

  test('is null for something that is not an instant', () => {
    expect(toTimestamp('yesterday')).toBeNull();
  });
});

describe('toVideoRow', () => {
  test('carries across what the old system observed', () => {
    expect(rowOf()).toMatchObject({
      video_id: 'aaaaaaaaaaa',
      channel_id: channelId,
      title: 'ある配信',
      published_at: '2026-05-05T01:02:03Z',
      availability: 'public',
      view_count: 4200,
      like_count: 12,
      comment_count: 3,
      chat_message_count: 900,
      chat_unique_user_count: 40,
      scheduled_start_time: '2026-05-05T02:00:00Z',
      actual_start_time: '2026-05-05T02:01:12Z',
      actual_end_time: '2026-05-05T04:06:13Z',
    });
  });

  // 15 of the 16 deleted or private videos in #58's audit still read 'live' or
  // 'upcoming' there. Moving that across would reinstate as data the defect
  // #63 removed as code.
  test('does not carry the live state across, whatever it says', () => {
    expect(rowOf({ liveBroadcastContent: 'live' }).live_broadcast_content).toEqual('none');
    expect(rowOf({ liveBroadcastContent: 'upcoming' }).live_broadcast_content).toEqual('none');
  });

  // The old getVideoType never revisited a type once set, and a stream that
  // had not finished has a duration of 'P0D'. The collector decides both.
  test('leaves the kind and the length to the collector', () => {
    expect(rowOf({ type: 'streaming', duration: 'PT2H5M1S' }).type).toBeNull();
    expect(rowOf({ type: 'streaming', duration: 'PT2H5M1S' }).duration_seconds).toBeNull();
    expect(rowOf({ type: 'shorts', duration: 'PT30S' }).type).toBeNull();
  });

  test('keeps the old fetched_at rather than the time of the migration', () => {
    expect(rowOf().fetched_at).toEqual('2026-09-03T19:08:12Z');
  });

  // The oldest in the measured data. video-update sweeps oldest first, so this
  // is what puts the five videos the old system abandoned at the front of the
  // queue rather than the back.
  test('keeps a fetched_at from years ago', () => {
    expect(rowOf({ fetchedAt: '2023-11-30T00:57:16Z' }).fetched_at).toEqual('2023-11-30T00:57:16Z');
  });

  test('turns both kinds of missing count into null', () => {
    const row = rowOf({ chatMessageCount: -1, chatUniqueUserCount: -1, viewCount: '' });

    expect(row.chat_message_count).toBeNull();
    expect(row.chat_unique_user_count).toBeNull();
    expect(row.view_count).toBeNull();
  });

  test('turns an empty stream time into null', () => {
    const row = rowOf({ scheduledStartTime: '', actualStartTime: '', actualEndTime: '' });

    expect(row.scheduled_start_time).toBeNull();
    expect(row.actual_start_time).toBeNull();
    expect(row.actual_end_time).toBeNull();
  });

  // 'private' is the one availability the collector can never write: Videos.list
  // omits a private video exactly as it omits a deleted one, so only the old
  // system's scraping knew the difference.
  test('carries private across', () => {
    expect(rowOf({ availability: 'private' }).availability).toEqual('private');
  });
});

// A guess would be indistinguishable from an observation when #66 compares
// this data with what the collector fetches, and telling those apart is the
// whole point of the comparison.
describe('toVideoRow on a record that cannot become a row', () => {
  test('skips one with no availability rather than guessing', () => {
    expect(toVideoRow(record({ availability: '' }), channelId)).toEqual({ skipped: 'no availability' });
  });

  test('skips one with no fetchedAt', () => {
    expect(toVideoRow(record({ fetchedAt: '' }), channelId)).toEqual({ skipped: 'no fetchedAt' });
  });

  test('skips one with no title', () => {
    expect(toVideoRow(record({ title: '' }), channelId)).toEqual({ skipped: 'no title' });
  });

  test('skips one with no publishedAt', () => {
    expect(toVideoRow(record({ publishedAt: '' }), channelId)).toEqual({ skipped: 'no publishedAt' });
  });

  test('skips one with no videoId', () => {
    expect(toVideoRow(record({ videoId: '' }), channelId)).toEqual({ skipped: 'no videoId' });
  });

  test('does not skip one whose availability the schema accepts', () => {
    for (const availability of ['public', 'membership', 'private', 'unavailable']) {
      expect(toVideoRow(record({ availability }), channelId).row).toBeDefined();
    }
  });
});

describe('convertChannel', () => {
  test('accounts for every record it read', () => {
    const result = convertChannel([record(), record({ videoId: 'bbbbbbbbbbb' }), record({ fetchedAt: '' })], channelId);

    expect(result.read).toEqual(3);
    expect(result.rows).toHaveLength(2);
    expect(result.skipped).toEqual([{ channelId, reason: 'no fetchedAt' }]);
    // What the script checks rather than a count written down anywhere: the
    // old system is still collecting, so any figure here would be stale.
    expect(result.rows.length + result.skipped.length).toEqual(result.read);
  });

  test('answers for an empty file without failing', () => {
    expect(convertChannel([], channelId)).toEqual({ rows: [], skipped: [], read: 0 });
  });
});

describe('rowsToSql', () => {
  const rows = (count) =>
    Array.from({ length: count }, (_, index) => rowOf({ videoId: `v${String(index).padStart(4, '0')}` }));

  test('never upserts', () => {
    const sql = rowsToSql(rows(1), channelId, 'https://example.com/x.json');

    expect(sql).toContain('ON CONFLICT (video_id) DO NOTHING;');
    expect(sql).not.toContain('DO UPDATE');
  });

  // A quoted NULL is the string 'NULL', which STRICT refuses in an INTEGER
  // column, and a quoted count is text where the column wants a number.
  test('writes NULL and the counts as literals rather than strings', () => {
    const [row] = rows(1);

    row.view_count = null;
    row.like_count = 12;

    const values = rowsToSql([row], channelId, 'x').split('VALUES')[1];

    expect(values).toContain('NULL');
    expect(values).not.toContain("'NULL'");
    expect(values).toContain(', 12,');
    expect(values).not.toContain("'12'");
  });

  test('escapes a quote in a title', () => {
    const [row] = rows(1);

    row.title = "It's here";

    expect(rowsToSql([row], channelId, 'x')).toContain("'It''s here'");
  });

  // One statement for a whole channel would be a single line of over a
  // megabyte for the largest of them.
  test('splits a channel into statements', () => {
    const sql = rowsToSql(rows(ROWS_PER_STATEMENT + 1), channelId, 'x');

    expect(sql.match(/INSERT INTO video/g)).toHaveLength(2);
  });

  test('keeps one statement while the rows fit', () => {
    const sql = rowsToSql(rows(ROWS_PER_STATEMENT), channelId, 'x');

    expect(sql.match(/INSERT INTO video/g)).toHaveLength(1);
  });

  test('names the source it was generated from', () => {
    expect(rowsToSql(rows(1), channelId, 'https://example.com/x.json')).toContain('https://example.com/x.json');
  });
});
