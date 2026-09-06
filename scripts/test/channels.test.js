import { channelsToSql, findProblems } from '../channels.js';

const id = 'UCEcMIuGR8WO2TwL9XIpjKtw';
const otherId = 'UCmYO-WfY7Tasry4D1YB4LJw';

/** A valid entry, with `overrides` applied on top. */
function channel(overrides = {}) {
  return {
    channel_id: id,
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

/** A valid colour block, with `overrides` applied on top. */
function color(overrides = {}) {
  return { key: '#F38E0A', sub: '#F8C112', light: '#FFEBA4', back: '#FFEBA4', ...overrides };
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

  // One round trip per mistake is slow for the person fixing the file.
  test('reports every problem rather than the first', () => {
    const entry = channel({ channel_id: 'nope', twitter: '@Cape_KEMOV', activity_end_date: '2021-02-30' });

    expect(findProblems([entry])).toHaveLength(3);
  });

  describe('the file itself', () => {
    test('refuses a mapping where a list belongs', () => {
      expect(findProblems({ channels: [] })).toEqual(['the file must hold a list of channels']);
    });

    test('refuses an empty list', () => {
      expect(findProblems([])).toEqual(['the file must hold at least one channel']);
    });

    test('refuses an entry that is not a mapping', () => {
      expect(findProblems([id])).toEqual(['entry 1: entry must be a mapping']);
    });
  });

  describe('fields', () => {
    test('names a missing field', () => {
      const entry = channel();

      delete entry.fullname;

      expect(findProblems([entry])).toEqual([`${id}: fullname is missing`]);
    });

    test('demands activity_end_date even when the streamer is active', () => {
      const entry = channel();

      delete entry.activity_end_date;

      expect(findProblems([entry])).toEqual([`${id}: activity_end_date is missing`]);
    });

    test('refuses a field the file does not have, which is how a typo shows up', () => {
      expect(findProblems([channel({ globalnames: 'African Penguin' })])).toEqual([
        `${id}: globalnames is not a field this file has`,
      ]);
    });

    test('refuses a name that is only whitespace', () => {
      expect(findProblems([channel({ name: '   ' })])).toEqual([`${id}: name must be a non-empty string, not "   "`]);
    });

    test('refuses a channel id of the wrong length', () => {
      expect(findProblems([channel({ channel_id: `${id}X` })])).toEqual([
        `${id}X: channel_id must be a YouTube channel id, not "${id}X"`,
      ]);
    });

    test('refuses a channel id that is not a channel id', () => {
      expect(findProblems([channel({ channel_id: 'XXEcMIuGR8WO2TwL9XIpjKtw' })])).toEqual([
        'XXEcMIuGR8WO2TwL9XIpjKtw: channel_id must be a YouTube channel id, not "XXEcMIuGR8WO2TwL9XIpjKtw"',
      ]);
    });

    test('points at the position when the entry has no id to be named by', () => {
      const entry = channel();

      delete entry.channel_id;

      expect(findProblems([entry])).toEqual(['entry 1: channel_id is missing']);
    });

    // `channel_id:` with nothing after it is a key that is present and null.
    test('refuses a channel id left blank', () => {
      expect(findProblems([channel({ channel_id: null })])).toEqual([
        'entry 1: channel_id must be a YouTube channel id, not null',
      ]);
    });
  });

  describe('colours', () => {
    test('refuses a colour without its #', () => {
      expect(findProblems([channel({ color: color({ key: 'F38E0A' }) })])).toEqual([
        `${id}: color.key must be #RRGGBB, not "F38E0A"`,
      ]);
    });

    test('accepts a colour in either case', () => {
      expect(findProblems([channel({ color: color({ key: '#f38e0a' }) })])).toEqual([]);
    });

    test('refuses a colour that is missing', () => {
      const incomplete = color();

      delete incomplete.back;

      expect(findProblems([channel({ color: incomplete })])).toEqual([`${id}: color.back is missing`]);
    });

    test('refuses a colour the file does not have', () => {
      expect(findProblems([channel({ color: color({ dark: '#000000' }) })])).toEqual([
        `${id}: color.dark is not a colour this file has`,
      ]);
    });

    test('refuses a colour block that is not a mapping', () => {
      expect(findProblems([channel({ color: '#F38E0A' })])).toEqual([
        `${id}: color must be a mapping of key, sub, light and back`,
      ]);
    });
  });

  describe('handles', () => {
    test('refuses an X handle written with the @', () => {
      expect(findProblems([channel({ twitter: '@Cape_KEMOV' })])).toEqual([
        `${id}: twitter must be a handle without the @, not "@Cape_KEMOV"`,
      ]);
    });

    test('accepts a twitch login', () => {
      expect(findProblems([channel({ twitch: 'coyote_kemov' })])).toEqual([]);
    });

    test('refuses a twitch login written with the @', () => {
      expect(findProblems([channel({ twitch: '@coyote_kemov' })])).toEqual([
        `${id}: twitch must be a Twitch login, not "@coyote_kemov"`,
      ]);
    });
  });

  describe('dates', () => {
    // Why the YAML quotes them: unquoted, js-yaml hands back a Date and the
    // column wants the text.
    test('refuses a date that arrived as a Date rather than a string', () => {
      expect(findProblems([channel({ activity_start_date: new Date('2021-04-26T00:00:00Z') })])).toEqual([
        `${id}: activity_start_date must be a quoted YYYY-MM-DD date, not "2021-04-26T00:00:00.000Z"`,
      ]);
    });

    test('refuses a day that does not exist', () => {
      expect(findProblems([channel({ activity_end_date: '2021-02-30' })])).toEqual([
        `${id}: activity_end_date must be a quoted YYYY-MM-DD date or null, not "2021-02-30"`,
      ]);
    });

    test('refuses the 29th of February in a common year', () => {
      expect(findProblems([channel({ activity_start_date: '2023-02-29' })])).toEqual([
        `${id}: activity_start_date must be a quoted YYYY-MM-DD date, not "2023-02-29"`,
      ]);
    });

    test('accepts the 29th of February in a leap year', () => {
      expect(findProblems([channel({ activity_start_date: '2024-02-29' })])).toEqual([]);
    });

    test('refuses an end date before the start date', () => {
      const entry = channel({ activity_start_date: '2021-04-26', activity_end_date: '2021-04-25' });

      expect(findProblems([entry])).toEqual([
        `${id}: activity_end_date 2021-04-25 is before activity_start_date 2021-04-26`,
      ]);
    });

    test('accepts an end date on the start date', () => {
      const entry = channel({ activity_start_date: '2021-04-26', activity_end_date: '2021-04-26' });

      expect(findProblems([entry])).toEqual([]);
    });
  });

  describe('the list as a whole', () => {
    test('refuses the same channel twice', () => {
      const entries = [channel(), channel({ activity_start_date: '2021-04-28' })];

      expect(findProblems(entries)).toEqual([`${id}: appears twice, at entry 1 and entry 2`]);
    });

    test('refuses entries out of order', () => {
      const entries = [channel(), channel({ channel_id: otherId, activity_start_date: '2020-01-01' })];

      expect(findProblems(entries)).toEqual([`${otherId}: is out of order, 2020-01-01 follows 2021-04-26`]);
    });

    test('accepts two entries that start on the same day', () => {
      expect(findProblems([channel(), channel({ channel_id: otherId })])).toEqual([]);
    });
  });
});

describe('channelsToSql', () => {
  const sql = channelsToSql([channel({ twitch: 'cape_kemov' })]);

  test('inserts into channel', () => {
    expect(sql).toContain('INSERT INTO channel (');
  });

  test('updates rather than replaces, so a rerun changes nothing', () => {
    expect(sql).toContain('ON CONFLICT (channel_id) DO UPDATE SET');
  });

  test('never mentions a column the collector owns', () => {
    for (const column of ['custom_url', 'thumbnail_url', 'fetched_at']) {
      expect(sql).not.toContain(column);
    }
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

  test('updates every column the deploy owns', () => {
    const columns = [
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
    ];

    for (const column of columns) {
      expect(sql).toContain(`${column} = excluded.${column}`);
    }
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
    const two = channelsToSql([channel(), channel({ channel_id: otherId })]);

    expect(two).toContain(`('${id}',`);
    expect(two).toContain(`('${otherId}',`);
  });

  test('ends the statement', () => {
    expect(sql.trimEnd().endsWith(';')).toBe(true);
  });
});
