import dayjs from '@nanase/alnilam/dayjs';
import { formatProperty, getPropertyName, parse, readProperty, type Video, type VideoProperty } from '@/type/video';

function parseOne(video: Record<string, unknown>): Video {
  return parse(JSON.stringify([video]))[0];
}

describe('parse', () => {
  test('reads an array of videos', () => {
    const videos = parse(JSON.stringify([{ videoId: 'a' }, { videoId: 'b' }]));

    expect(videos).toHaveLength(2);
    expect(videos[1].videoId).toEqual('b');
  });

  test('publishedAt becomes a Dayjs', () => {
    const video = parseOne({ publishedAt: '2024-03-01T12:00:00Z' });

    expect(dayjs.isDayjs(video.publishedAt)).toBe(true);
    expect(video.publishedAt.toISOString()).toEqual('2024-03-01T12:00:00.000Z');
  });

  test('the optional timestamps become Dayjs, or undefined when absent', () => {
    const present = parseOne({
      fetchedAt: '2024-03-01T00:00:00Z',
      scheduledStartTime: '2024-03-01T01:00:00Z',
      actualStartTime: '2024-03-01T02:00:00Z',
      actualEndTime: '2024-03-01T03:00:00Z',
    });

    expect(dayjs.isDayjs(present.fetchedAt)).toBe(true);
    expect(dayjs.isDayjs(present.scheduledStartTime)).toBe(true);
    expect(dayjs.isDayjs(present.actualStartTime)).toBe(true);
    expect(dayjs.isDayjs(present.actualEndTime)).toBe(true);

    const empty = parseOne({ fetchedAt: '', actualEndTime: null });

    expect(empty.fetchedAt).toBeUndefined();
    expect(empty.actualEndTime).toBeUndefined();
  });

  test('duration becomes a Duration, or undefined when absent', () => {
    expect(parseOne({ duration: 'PT1H2M3S' }).duration?.asSeconds()).toEqual(3723);
    expect(parseOne({ duration: '' }).duration).toBeUndefined();
  });

  test('counts become numbers', () => {
    const video = parseOne({ viewCount: '1234', likeCount: 56, commentCount: '0' });

    expect(video.viewCount).toEqual(1234);
    expect(video.likeCount).toEqual(56);
    expect(video.commentCount).toEqual(0);
  });

  test('an empty or unparsable count becomes undefined rather than NaN', () => {
    const video = parseOne({ viewCount: '', likeCount: 'many', commentCount: null });

    expect(video.viewCount).toBeUndefined();
    expect(video.likeCount).toBeUndefined();
    expect(video.commentCount).toEqual(0);
  });

  test('type falls back to undefined when null', () => {
    expect(parseOne({ type: 'shorts' }).type).toEqual('shorts');
    expect(parseOne({ type: null }).type).toBeUndefined();
  });
});

describe('readProperty', () => {
  const video: Video = parseOne({
    videoId: 'a',
    publishedAt: '2024-03-01T00:00:00Z',
    title: 't',
    liveBroadcastContent: 'none',
    duration: 'PT1M40S',
    viewCount: 1000,
    likeCount: 200,
    commentCount: 50,
    chatMessageCount: 300,
    chatUniqueUserCount: 60,
  });

  test('reads the stored counts', () => {
    expect(readProperty(video, 'viewCount')).toEqual(1000);
    expect(readProperty(video, 'chatUniqueUserCount')).toEqual(60);
  });

  test('duration is read in seconds', () => {
    expect(readProperty(video, 'duration')).toEqual(100);
  });

  test('derives the per-second and per-user values', () => {
    expect(readProperty(video, 'viewCountPerSecond')).toEqual(10);
    expect(readProperty(video, 'likeCountPerSecond')).toEqual(2);
    expect(readProperty(video, 'commentCountPerSecond')).toEqual(0.5);
    expect(readProperty(video, 'chatMessageCountPerSecond')).toEqual(3);
    expect(readProperty(video, 'chatMessageCountPerUniqueUser')).toEqual(5);
  });

  test('a derived value is 0 when either side is missing', () => {
    const bare = parseOne({ videoId: 'a', publishedAt: '2024-03-01T00:00:00Z' });

    expect(readProperty(bare, 'viewCountPerSecond')).toEqual(0);
    expect(readProperty(bare, 'chatMessageCountPerUniqueUser')).toEqual(0);
  });

  test('a stored count that is missing stays undefined, unlike the derived ones', () => {
    const bare = parseOne({ videoId: 'a', publishedAt: '2024-03-01T00:00:00Z' });

    expect(readProperty(bare, 'viewCount')).toBeUndefined();
    expect(readProperty(bare, 'duration')).toBeUndefined();
  });
});

describe('formatProperty', () => {
  test('counts are grouped with commas', () => {
    expect(formatProperty('viewCount', 1234567)).toEqual('1,234,567');
    expect(formatProperty('likeCount', 0)).toEqual('0');
  });

  test('a duration under an hour is mm:ss', () => {
    expect(formatProperty('duration', 125)).toEqual('02:05');
  });

  test('a duration of an hour or more gains the hour field', () => {
    expect(formatProperty('duration', 3723)).toEqual('1:02:03');
  });

  test('a zero or missing duration is 00:00', () => {
    expect(formatProperty('duration', 0)).toEqual('00:00');
    expect(formatProperty('duration', undefined)).toEqual('00:00');
  });

  test('derived values keep one decimal place', () => {
    expect(formatProperty('viewCountPerSecond', 1.234)).toEqual('1.2');
    expect(formatProperty('chatMessageCountPerUniqueUser', 0)).toEqual('0');
  });
});

describe('getPropertyName', () => {
  test('every property has a name', () => {
    const properties: VideoProperty[] = [
      'viewCount',
      'likeCount',
      'commentCount',
      'chatMessageCount',
      'chatUniqueUserCount',
      'chatMessageCountPerUniqueUser',
      'duration',
      'viewCountPerSecond',
      'likeCountPerSecond',
      'commentCountPerSecond',
      'chatMessageCountPerSecond',
    ];

    for (const property of properties) {
      expect(getPropertyName(property), property).not.toEqual('');
    }
  });
});
