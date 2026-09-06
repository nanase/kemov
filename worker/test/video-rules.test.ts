import {
  determineAvailability,
  determineLiveBroadcastContent,
  determineVideoType,
  isFreeChatPlaceholder,
  parseDurationSeconds,
} from '../src/lib/video';

// The rules themselves, with no D1 and no API in the way. What the collector
// does with the answers is worker/test/video.test.ts.

describe('parseDurationSeconds', () => {
  test('reads minutes and seconds', () => {
    expect(parseDurationSeconds('PT1M30S')).toEqual(90);
  });

  test('reads hours', () => {
    expect(parseDurationSeconds('PT2H5M1S')).toEqual(7501);
  });

  test('reads days', () => {
    expect(parseDurationSeconds('P1DT1S')).toEqual(86401);
  });

  test('reads a bare second count', () => {
    expect(parseDurationSeconds('PT59S')).toEqual(59);
  });

  // What the API reports for a stream that has not finished.
  test('reads P0D as zero', () => {
    expect(parseDurationSeconds('P0D')).toEqual(0);
  });

  test('answers null when there is no duration', () => {
    expect(parseDurationSeconds(undefined)).toBeNull();
  });

  // Null rather than 0: 0 is a real length the shorts rule would act on.
  test('answers null rather than zero for a shape it cannot read', () => {
    expect(parseDurationSeconds('1M30S')).toBeNull();
    expect(parseDurationSeconds('PT1W')).toBeNull();
    expect(parseDurationSeconds('')).toBeNull();
  });
});

describe('determineLiveBroadcastContent', () => {
  test('is none for a video that was never a stream', () => {
    expect(determineLiveBroadcastContent(undefined)).toEqual('none');
  });

  test('is upcoming while only a scheduled time is known', () => {
    expect(determineLiveBroadcastContent({ scheduledStartTime: '2026-09-07T13:00:00Z' })).toEqual('upcoming');
  });

  test('is live once it has started', () => {
    expect(
      determineLiveBroadcastContent({
        scheduledStartTime: '2026-09-07T13:00:00Z',
        actualStartTime: '2026-09-07T13:01:12Z',
      }),
    ).toEqual('live');
  });

  // The whole point of #64's "a stream ending shows within ten minutes".
  test('is none again once it has ended', () => {
    expect(
      determineLiveBroadcastContent({
        scheduledStartTime: '2026-09-07T13:00:00Z',
        actualStartTime: '2026-09-07T13:01:12Z',
        actualEndTime: '2026-09-07T15:22:47Z',
      }),
    ).toEqual('none');
  });

  test('is none for details carrying no timestamp at all', () => {
    expect(determineLiveBroadcastContent({})).toEqual('none');
  });
});

describe('determineVideoType', () => {
  test('is video for an ordinary upload', () => {
    expect(determineVideoType(612, 'none', undefined)).toEqual('video');
  });

  test('is shorts at sixty seconds', () => {
    expect(determineVideoType(60, 'none', undefined)).toEqual('shorts');
  });

  test('is video at sixty-one seconds', () => {
    expect(determineVideoType(61, 'none', undefined)).toEqual('video');
  });

  test('is streaming for a stream that has ended', () => {
    expect(determineVideoType(7501, 'none', { actualEndTime: '2026-09-07T15:22:47Z' })).toEqual('streaming');
  });

  // P0D parses to a real 0, so without the live test first every running
  // stream would come out a short. This is the trap the ordering exists for.
  test('is streaming for a running stream reporting no length', () => {
    expect(determineVideoType(0, 'live', { actualStartTime: '2026-09-07T13:01:12Z' })).toEqual('streaming');
  });

  test('is streaming for a stream that has not started', () => {
    expect(determineVideoType(0, 'upcoming', { scheduledStartTime: '2026-09-07T13:00:00Z' })).toEqual('streaming');
  });

  test('is null while the length is unknown', () => {
    expect(determineVideoType(null, 'none', undefined)).toBeNull();
  });

  // The old getVideoType answered from the stored value and returned before
  // reading the length, so 12 of 197 videos of a minute or less stayed
  // misclassified. Nothing here takes a previous answer at all, so the same
  // inputs give the same answer whatever came before.
  test('decides from the arguments alone, with no previous answer to keep', () => {
    expect(determineVideoType(45, 'none', undefined)).toEqual('shorts');
    expect(determineVideoType(45, 'none', undefined)).toEqual('shorts');
  });
});

describe('determineAvailability', () => {
  test('is public for a public video', () => {
    expect(determineAvailability({ returned: true, privacyStatus: 'public' })).toEqual('public');
  });

  test('is public for an unlisted video', () => {
    expect(determineAvailability({ returned: true, privacyStatus: 'unlisted' })).toEqual('public');
  });

  test('is private when the API says so', () => {
    expect(determineAvailability({ returned: true, privacyStatus: 'private' })).toEqual('private');
  });

  // Absence cannot tell deleted from private apart, so it does not claim to.
  test('is unavailable when the API did not return the video', () => {
    expect(determineAvailability({ returned: false })).toEqual('unavailable');
  });

  test('is unavailable even if a stale privacyStatus is passed alongside', () => {
    expect(determineAvailability({ returned: false, privacyStatus: 'public' })).toEqual('unavailable');
  });

  // Reachable, which is what #63 asks to be shown. Nothing in this repository
  // sets membersOnly today because Data API v3 has no field for it; #67
  // carries the old scraper's requiresSubscription forward and #66 decides
  // whether that is the signal.
  test('is membership when the caller knows the video is members-only', () => {
    expect(determineAvailability({ returned: true, privacyStatus: 'public', membersOnly: true })).toEqual('membership');
  });

  test('membership outranks a private privacyStatus', () => {
    expect(determineAvailability({ returned: true, privacyStatus: 'private', membersOnly: true })).toEqual(
      'membership',
    );
  });

  test('is public for a status value it does not recognise', () => {
    expect(determineAvailability({ returned: true, privacyStatus: 'somethingNew' })).toEqual('public');
  });
});

describe('isFreeChatPlaceholder', () => {
  const now = new Date('2026-09-06T21:38:54Z');

  // The three streams the live feed carried at that instant. The two real
  // ones are hours away; the free chat is scheduled for 2028.
  test('is false for a stream starting within the hour', () => {
    expect(isFreeChatPlaceholder('2026-09-06T22:00:00Z', now)).toBe(false);
  });

  test('is false for a stream scheduled for tomorrow', () => {
    expect(isFreeChatPlaceholder('2026-09-07T13:00:00Z', now)).toBe(false);
  });

  test('is true for the free chat scheduled two years out', () => {
    expect(isFreeChatPlaceholder('2028-09-01T12:30:00Z', now)).toBe(true);
  });

  test('is false a day inside the threshold and true a day outside it', () => {
    expect(isFreeChatPlaceholder('2026-10-05T21:38:54Z', now)).toBe(false);
    expect(isFreeChatPlaceholder('2026-10-07T21:38:54Z', now)).toBe(true);
  });

  test('is false for a video with no scheduled time', () => {
    expect(isFreeChatPlaceholder(null, now)).toBe(false);
  });

  test('is false for a scheduled time it cannot read', () => {
    expect(isFreeChatPlaceholder('not a time', now)).toBe(false);
  });

  // A stream whose schedule has passed is late or already running, not a
  // placeholder.
  test('is false for a scheduled time in the past', () => {
    expect(isFreeChatPlaceholder('2020-01-01T00:00:00Z', now)).toBe(false);
  });
});
