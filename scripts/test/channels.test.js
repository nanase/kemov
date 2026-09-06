import { channelsToSql, findProblems } from '../channels.js';

/** A valid entry, with `overrides` applied on top. */
function channel(overrides = {}) {
  return {
    channel_id: 'UCEcMIuGR8WO2TwL9XIpjKtw',
    name: 'ケープペンギン',
    fullname: 'ケープペンギン / African Penguin',
    globalname: 'African Penguin',
    twitter: 'Cape_KEMOV',
    color: { key: '#F38E0A', sub: '#F8C112', light: '#FFEBA4', back: '#FFEBA4' },
    activity_start_date: '2021-04-26',
    activity_end_date: null,
    ...overrides,
  };
}

/** The one problem `findProblems` reports, or a failure if it reports another number. */
function onlyProblem(channels) {
  const problems = findProblems(channels);

  expect(problems).toHaveLength(1);
  return problems[0];
}

describe('findProblems', () => {
  test('passes an entry with everything filled in', () => {
    expect(findProblems([channel()])).toEqual([]);
  });

  test('passes an entry that leaves out the optional fields', () => {
    const entry = channel();

    delete entry.globalname;
    delete entry.twitter;

    expect(findProblems([entry])).toEqual([]);
  });

  test('passes a streamer who has stopped', () => {
    expect(findProblems([channel({ activity_end_date: '2022-05-21' })])).toEqual([]);
  });

  test('refuses a file that is not a list', () => {
    expect(findProblems({ channels: [] })).toEqual(['the file must hold a list of channels']);
  });

  test('refuses an empty file', () => {
    expect(findProblems([])).toEqual(['the file must hold at least one channel']);
  });

  test('refuses an entry that is not a mapping', () => {
    expect(onlyProblem(['UCEcMIuGR8WO2TwL9XIpjKtw'])).toEqual('entry 1: entry must be a mapping');
  });

  test('names a missing field', () => {
    const entry = channel();

    delete entry.fullname;

    expect(onlyProblem([entry])).toEqual('UCEcMIuGR8WO2TwL9XIpjKtw: fullname is missing');
  });

  test('demands activity_end_date even when the streamer is active', () => {
    const entry = channel();

    delete entry.activity_end_date;

    expect(onlyProblem([entry])).toEqual('UCEcMIuGR8WO2TwL9XIpjKtw: activity_end_date is missing');
  });

  test('refuses a field the file does not have, which is how a typo shows up', () => {
    expect(onlyProblem([channel({ globalnames: 'African Penguin' })])).toContain(
      'globalnames is not a field this file has',
    );
  });

  test('refuses a colour the file does not have', () => {
    const color = { key: '#F38E0A', sub: '#F8C112', light: '#FFEBA4', back: '#FFEBA4', dark: '#000000' };

    expect(onlyProblem([channel({ color })])).toContain('color.dark is not a colour this file has');
  });

  test('refuses a channel id of the wrong length', () => {
    expect(onlyProblem([channel({ channel_id: 'UCEcMIuGR8WO2TwL9XIpjKtwX' })])).toContain(
      'channel_id must be a YouTube channel id',
    );
  });

  test('refuses a channel id that does not start with UC', () => {
    expect(onlyProblem([channel({ channel_id: 'XXEcMIuGR8WO2TwL9XIpjKtw' })])).toContain(
      'channel_id must be a YouTube channel id',
    );
  });

  test('refuses a name that is only whitespace', () => {
    expect(onlyProblem([channel({ name: '   ' })])).toContain('name must be a non-empty string');
  });

  test('refuses a colour without its #', () => {
    expect(
      onlyProblem([channel({ color: { key: 'F38E0A', sub: '#F8C112', light: '#FFEBA4', back: '#FFEBA4' } })]),
    ).toContain('color.key must be #RRGGBB');
  });

  test('accepts a colour in either case', () => {
    expect(
      findProblems([channel({ color: { key: '#f38e0a', sub: '#F8C112', light: '#FFEBA4', back: '#FFEBA4' } })]),
    ).toEqual([]);
  });

  test('refuses a colour that is missing', () => {
    expect(onlyProblem([channel({ color: { key: '#F38E0A', sub: '#F8C112', light: '#FFEBA4' } })])).toEqual(
      'UCEcMIuGR8WO2TwL9XIpjKtw: color.back is missing',
    );
  });

  test('refuses a colour block that is not a mapping', () => {
    expect(onlyProblem([channel({ color: '#F38E0A' })])).toContain(
      'color must be a mapping of key, sub, light and back',
    );
  });

  test('refuses an X handle written with the @', () => {
    expect(onlyProblem([channel({ twitter: '@Cape_KEMOV' })])).toContain('twitter must be a handle without the @');
  });

  test('accepts a twitch login', () => {
    expect(findProblems([channel({ twitch: 'coyote_kemov' })])).toEqual([]);
  });

  test('refuses a twitch login written with the @', () => {
    expect(onlyProblem([channel({ twitch: '@coyote_kemov' })])).toContain('twitch must be a Twitch login');
  });

  // Why the dates are quoted in the YAML: unquoted, js-yaml hands back a Date
  // and the column wants the text.
  test('refuses a date that arrived as a Date rather than a string', () => {
    expect(onlyProblem([channel({ activity_start_date: new Date('2021-04-26T00:00:00Z') })])).toContain(
      'activity_start_date must be a quoted YYYY-MM-DD date',
    );
  });

  test('refuses a day that does not exist', () => {
    expect(onlyProblem([channel({ activity_end_date: '2021-02-30' })])).toContain(
      'activity_end_date must be a quoted YYYY-MM-DD date or null',
    );
  });

  test('refuses the 29th of February in a common year', () => {
    expect(onlyProblem([channel({ activity_start_date: '2023-02-29' })])).toContain(
      'activity_start_date must be a quoted YYYY-MM-DD date',
    );
  });

  test('accepts the 29th of February in a leap year', () => {
    expect(findProblems([channel({ activity_start_date: '2024-02-29' })])).toEqual([]);
  });

  test('refuses an end date before the start date', () => {
    expect(onlyProblem([channel({ activity_start_date: '2021-04-26', activity_end_date: '2021-04-25' })])).toEqual(
      'UCEcMIuGR8WO2TwL9XIpjKtw: activity_end_date 2021-04-25 is before activity_start_date 2021-04-26',
    );
  });

  test('accepts an end date on the start date', () => {
    expect(findProblems([channel({ activity_start_date: '2021-04-26', activity_end_date: '2021-04-26' })])).toEqual([]);
  });

  test('refuses the same channel twice', () => {
    const entries = [channel(), channel({ activity_start_date: '2021-04-28' })];

    expect(onlyProblem(entries)).toEqual('UCEcMIuGR8WO2TwL9XIpjKtw: appears twice, at entry 1 and entry 2');
  });

  test('refuses entries out of order', () => {
    const entries = [channel(), channel({ channel_id: 'UCmYO-WfY7Tasry4D1YB4LJw', activity_start_date: '2020-01-01' })];

    expect(onlyProblem(entries)).toEqual('UCmYO-WfY7Tasry4D1YB4LJw: is out of order, 2020-01-01 follows 2021-04-26');
  });

  test('accepts two entries that start on the same day', () => {
    const entries = [channel(), channel({ channel_id: 'UCmYO-WfY7Tasry4D1YB4LJw' })];

    expect(findProblems(entries)).toEqual([]);
  });

  // One round trip per mistake is slow for the person fixing the file.
  test('reports every problem rather than the first', () => {
    expect(
      findProblems([channel({ channel_id: 'nope', twitter: '@Cape_KEMOV', activity_end_date: '2021-02-30' })]),
    ).toHaveLength(3);
  });

  test('points at the position when the entry has no usable id', () => {
    const entry = channel();

    delete entry.channel_id;

    expect(onlyProblem([entry])).toEqual('entry 1: channel_id is missing');
  });

  // `channel_id:` with nothing after it is a key that is present and null.
  test('refuses a channel id left blank', () => {
    expect(onlyProblem([channel({ channel_id: null })])).toEqual(
      'entry 1: channel_id must be a YouTube channel id, not null',
    );
  });
});

describe('channelsToSql', () => {
  const sql = channelsToSql([channel({ twitch: 'cape_kemov' })]);

  test('inserts into channel', () => {
    expect(sql).toContain('INSERT INTO channel (');
  });

  test('updates rather than replaces, so a rerun is a no-op', () => {
    expect(sql).toContain('ON CONFLICT (channel_id) DO UPDATE SET');
  });

  test.each(['custom_url', 'thumbnail_url', 'fetched_at'])('never mentions %s, which the collector owns', (column) => {
    expect(sql).not.toContain(column);
  });

  test('does not carry twitch, which no column holds', () => {
    expect(sql).not.toContain('twitch');
    expect(sql).not.toContain('cape_kemov');
  });

  test('never deletes, because the snapshots and videos are the history', () => {
    expect(sql).not.toContain('DELETE');
    expect(sql).not.toContain('REPLACE');
  });

  test('leaves the primary key out of the update', () => {
    expect(sql).not.toContain('channel_id = excluded.channel_id');
  });

  test.each([
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
  ])('updates %s', (column) => {
    expect(sql).toContain(`${column} = excluded.${column}`);
  });

  test('spreads the colour block across its four columns', () => {
    expect(sql).toContain("'#F38E0A', '#F8C112', '#FFEBA4', '#FFEBA4'");
  });

  test('writes NULL rather than a quoted empty string for a value that is not there', () => {
    expect(channelsToSql([channel({ activity_end_date: null })])).toContain(", '2021-04-26', NULL)");
  });

  test('writes NULL for an optional field the entry leaves out', () => {
    const entry = channel();

    delete entry.twitter;

    expect(channelsToSql([entry])).toContain("'African Penguin', NULL,");
  });

  test('doubles an apostrophe rather than ending the literal', () => {
    expect(channelsToSql([channel({ name: "Geoffroy's Cat" })])).toContain("'Geoffroy''s Cat'");
  });

  test('writes one row per channel', () => {
    const two = channelsToSql([channel(), channel({ channel_id: 'UCmYO-WfY7Tasry4D1YB4LJw' })]);

    expect(two).toContain("('UCEcMIuGR8WO2TwL9XIpjKtw',");
    expect(two).toContain("('UCmYO-WfY7Tasry4D1YB4LJw',");
  });

  test('ends the statement', () => {
    expect(sql.trimEnd().endsWith(';')).toBe(true);
  });
});
