import {
  determineAvailability,
  determineLiveBroadcastContent,
  determineVideoType,
  isFreeChatPlaceholder,
  needsShortsProbe,
  parseDurationSeconds,
  readShortsProbe,
  toCount,
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

describe('toCount', () => {
  test('reads the string the API reports', () => {
    expect(toCount('4200')).toEqual(4200);
  });

  test('reads zero as zero rather than as absent', () => {
    expect(toCount('0')).toEqual(0);
  });

  // The schema says a NULL here is "not collected yet, or hidden by the
  // uploader" and draws no line between them, so neither does this.
  test('is null when the API reports no count', () => {
    expect(toCount(undefined)).toBeNull();
  });

  // The column's CHECK refuses these, so they become the absence they amount
  // to rather than a row the database throws out.
  test('is null for a value the column would refuse', () => {
    expect(toCount('-1')).toBeNull();
    expect(toCount('12.5')).toBeNull();
    expect(toCount('many')).toBeNull();
  });

  // Number('') is 0, so the empty string is the one that reads as a real
  // count if nothing stops it.
  test('is null for an empty string rather than zero', () => {
    expect(toCount('')).toBeNull();
    expect(toCount('   ')).toBeNull();
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

describe('needsShortsProbe', () => {
  test('asks about a short video that was never broadcast', () => {
    expect(needsShortsProbe(61, 'none', undefined)).toBe(true);
  });

  // Measured: none of the 190 shorts in the archive carries a
  // liveStreamingDetails, so a stream is settled without asking.
  test('does not ask about a stream that has ended', () => {
    expect(needsShortsProbe(44, 'none', { actualEndTime: '2026-09-07T15:22:47Z' })).toBe(false);
  });

  test('does not ask about a stream that is running or announced', () => {
    expect(needsShortsProbe(0, 'live', { actualStartTime: '2026-09-07T13:01:12Z' })).toBe(false);
    expect(needsShortsProbe(0, 'upcoming', { scheduledStartTime: '2026-09-07T13:00:00Z' })).toBe(false);
  });

  test('does not ask about anything longer than a short can be', () => {
    expect(needsShortsProbe(182, 'none', undefined)).toBe(false);
  });

  // The limit is three minutes and the reported duration rounds up, which is
  // why the five 61-second shorts exist at all.
  test('asks one second past the limit', () => {
    expect(needsShortsProbe(181, 'none', undefined)).toBe(true);
  });

  test('does not ask while the length is unknown', () => {
    expect(needsShortsProbe(null, 'none', undefined)).toBe(false);
  });
});

describe('readShortsProbe', () => {
  test('reads the shorts page being served as yes', () => {
    expect(readShortsProbe(200)).toBe(true);
  });

  test.each([301, 302, 303, 307, 308])('reads a redirect away from /shorts/ as no (%i)', (status) => {
    expect(readShortsProbe(status)).toBe(false);
  });

  // The failure #58 exists to remove: a refusal recorded as a verdict. 403 is
  // not hypothetical - the chat job is being refused several times a tick on
  // the same host - and a 403 read as "not a short" would settle the kind of
  // a video nobody had an answer for.
  test.each([403, 404, 429, 500, 503])('reads %i as no answer rather than as no', (status) => {
    expect(readShortsProbe(status)).toBeNull();
  });
});

describe('determineVideoType', () => {
  test('is video for an ordinary upload', () => {
    expect(determineVideoType(612, 'none', undefined)).toEqual('video');
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

  // #66 checked 22 videos against youtube.com/shorts/<id> itself. Each case
  // below is one of those readings, and each was decided the other way by the
  // length rule this replaces.

  // Five videos in the archive report 61 seconds and are served at /shorts/.
  // The length rule called them video.
  test('is shorts for a 61-second video YouTube serves at /shorts/', () => {
    expect(determineVideoType(61, 'none', undefined, true)).toEqual('shorts');
  });

  // Eight uploads between 17 and 59 seconds are redirected to /watch. The
  // length rule called them shorts.
  test('is video for a short upload YouTube redirects to /watch', () => {
    expect(determineVideoType(44, 'none', undefined, false)).toEqual('video');
  });

  // A stream that ended after four seconds. It is a stream whatever its
  // length, and it is not asked about at all - the length rule made it a
  // short, which is what #63's completion criterion asked for and what
  // YouTube contradicts.
  test('is streaming for a stream that ended inside a minute', () => {
    expect(determineVideoType(4, 'none', { actualEndTime: '2026-09-07T13:00:04Z' })).toEqual('streaming');
  });

  // The point of the whole change: an unanswered question leaves the kind
  // unset, and video-update comes back within a day. Settling it either way
  // would be the old system's -1 in another column.
  test('is null when YouTube did not answer', () => {
    expect(determineVideoType(45, 'none', undefined, null)).toBeNull();
  });

  // The old getVideoType answered from the stored value and returned before
  // reading anything, so a video classified before its length was known kept
  // that answer. Nothing here takes a previous answer at all.
  test('decides from the arguments alone, with no previous answer to keep', () => {
    expect(determineVideoType(45, 'none', undefined, true)).toEqual('shorts');
    expect(determineVideoType(45, 'none', undefined, true)).toEqual('shorts');
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
