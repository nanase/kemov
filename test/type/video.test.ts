import dayjs from '@nanase/alnilam/dayjs';

import type { Video } from '@/type/api';
import {
  COUNT_PROPERTIES,
  formatDuration,
  formatProperty,
  getPropertyDescription,
  getPropertyName,
  RATE_PROPERTIES,
  readProperty,
  VIDEO_PROPERTIES,
} from '@/type/video';

/**
 * What the site works out about a video from what the API sent.
 *
 * The old `parse` is gone with the JSON files it was written for: a response
 * is checked where it arrives now - test/type/api.test.ts - rather than
 * rebuilt from a string with a JSON.parse reviver.
 *
 * Eight of these eleven measures are also computed in SQL by the API, in
 * worker/src/lib/ranking.ts, and nothing checks that the two agree. The rule
 * they have to share is the one below: a video missing a part of a measure is
 * left out, never counted as zero.
 */

const VIDEO: Video = {
  videoId: 'v1',
  channelId: 'UCaaa',
  title: 'ある配信',
  publishedAt: dayjs('2026-01-01T00:00:00Z'),
  availability: 'public',
  liveBroadcastContent: 'none',
  type: 'streaming',
  durationSeconds: 3600,
  viewCount: 7200,
  likeCount: 360,
  commentCount: 180,
  chatMessageCount: 1800,
  chatUniqueUserCount: 90,
  scheduledStartTime: null,
  actualStartTime: null,
  actualEndTime: null,
  fetchedAt: dayjs('2026-09-07T12:00:00Z'),
};

const video = (changes: Partial<Video> = {}): Video => ({ ...VIDEO, ...changes });

describe('readProperty', () => {
  test('reads the counts the row holds', () => {
    expect(readProperty(VIDEO, 'viewCount')).toEqual(7200);
    expect(readProperty(VIDEO, 'likeCount')).toEqual(360);
    expect(readProperty(VIDEO, 'commentCount')).toEqual(180);
    expect(readProperty(VIDEO, 'chatMessageCount')).toEqual(1800);
    expect(readProperty(VIDEO, 'chatUniqueUserCount')).toEqual(90);
    expect(readProperty(VIDEO, 'duration')).toEqual(3600);
  });

  test('works out the ones that are ratios', () => {
    expect(readProperty(VIDEO, 'viewCountPerSecond')).toEqual(2);
    expect(readProperty(VIDEO, 'likeCountPerSecond')).toEqual(0.1);
    expect(readProperty(VIDEO, 'commentCountPerSecond')).toEqual(0.05);
    expect(readProperty(VIDEO, 'chatMessageCountPerSecond')).toEqual(0.5);
    expect(readProperty(VIDEO, 'chatMessageCountPerUniqueUser')).toEqual(20);
  });

  // Undefined, never zero. Zero would order the video as though it had been
  // measured and found to be nothing, and it would sort above every video with
  // a negative - which is the shape of the -1 the old system wrote.
  test('a count that was not collected has no value rather than a value of zero', () => {
    expect(readProperty(video({ viewCount: null }), 'viewCount')).toBeUndefined();
    expect(readProperty(video({ viewCount: null }), 'viewCountPerSecond')).toBeUndefined();
    expect(readProperty(video({ chatUniqueUserCount: null }), 'chatMessageCountPerUniqueUser')).toBeUndefined();
  });

  // Every video #67 migrated starts this way, so on the day the migration
  // lands the per-second rankings are short by however much of the archive
  // video-update has not swept yet.
  test('a video with no collected duration has no per-second value', () => {
    const migrated = video({ durationSeconds: null, type: null });

    expect(readProperty(migrated, 'viewCountPerSecond')).toBeUndefined();
    expect(readProperty(migrated, 'duration')).toBeUndefined();
    // The plain counts are still there. It is only the ratios that need the
    // duration.
    expect(readProperty(migrated, 'viewCount')).toEqual(7200);
  });

  // SQLite answers a division by zero with NULL and the row drops out of the
  // ranking; this is the same answer rather than an Infinity that sorts first.
  test('a video of no length has no per-second value either', () => {
    expect(readProperty(video({ durationSeconds: 0 }), 'viewCountPerSecond')).toBeUndefined();
    expect(readProperty(video({ chatUniqueUserCount: 0 }), 'chatMessageCountPerUniqueUser')).toBeUndefined();
  });

  test('every measure it offers can be read', () => {
    for (const property of VIDEO_PROPERTIES) {
      expect(readProperty(VIDEO, property)).toBeTypeOf('number');
    }
  });
});

describe('getPropertyName', () => {
  test('every measure has a name', () => {
    for (const property of VIDEO_PROPERTIES) {
      expect(getPropertyName(property)).toBeTruthy();
    }
  });

  // 時間 is both "time" and "an hour". These divide by a duration in seconds,
  // and one reading of the shorter word is 3,600 times the other.
  test('the rates say which unit they are per', () => {
    for (const property of RATE_PROPERTIES) {
      if (property === 'chatMessageCountPerUniqueUser') continue;

      expect(getPropertyName(property)).toContain('秒あたり');
      expect(getPropertyName(property)).not.toContain('時間あたり');
    }
  });
});

describe('the two sorts of measure', () => {
  test('every measure is in exactly one group', () => {
    expect([...COUNT_PROPERTIES, ...RATE_PROPERTIES].sort()).toEqual([...VIDEO_PROPERTIES].sort());
    expect(COUNT_PROPERTIES.filter((p) => (RATE_PROPERTIES as readonly string[]).includes(p))).toEqual([]);
  });

  // A count answers "how big" and, across channels, mostly reports who has the
  // most subscribers. A rate answers "how dense", which is a property of the
  // video. The cross-channel page opens on the second sort for that reason.
  test('the rates are the ones that divide by something', () => {
    expect([...RATE_PROPERTIES].sort()).toEqual(
      [
        'chatMessageCountPerSecond',
        'chatMessageCountPerUniqueUser',
        'commentCountPerSecond',
        'likeCountPerSecond',
        'viewCountPerSecond',
      ].sort(),
    );
  });
});

describe('getPropertyDescription', () => {
  test('every measure has a sentence', () => {
    for (const property of VIDEO_PROPERTIES) {
      expect(getPropertyDescription(property)).toBeTruthy();
    }
  });

  // The name does not say that 1,136 means one person wrote 1,136 times.
  test('says what a rate is divided by', () => {
    expect(getPropertyDescription('viewCountPerSecond')).toContain('1 秒あたり');
    expect(getPropertyDescription('chatMessageCountPerUniqueUser')).toContain('1 人');
  });
});

describe('formatDuration', () => {
  test('writes minutes and seconds under an hour, and hours above it', () => {
    expect(formatDuration(62)).toEqual('01:02');
    expect(formatDuration(3723)).toEqual('1:02:03');
  });

  test('a length that was not collected reads as zero rather than as nothing', () => {
    expect(formatDuration(null)).toEqual('00:00');
    expect(formatDuration(undefined)).toEqual('00:00');
  });
});

describe('formatProperty', () => {
  test('counts get thousands separators', () => {
    expect(formatProperty('viewCount', 1234567)).toEqual('1,234,567');
  });

  test('ratios get one decimal place', () => {
    expect(formatProperty('viewCountPerSecond', 2.06)).toEqual('2.1');
    expect(formatProperty('viewCountPerSecond', 2.04)).toEqual('2.0');
  });

  test('a duration is written as a duration', () => {
    expect(formatProperty('duration', 3723)).toEqual('1:02:03');
  });

  test('every measure can be written', () => {
    for (const property of VIDEO_PROPERTIES) {
      expect(formatProperty(property, 12)).toBeTypeOf('string');
      expect(formatProperty(property, undefined)).toBeTypeOf('string');
    }
  });
});
