import { compareAll, compareVideo, durationSeconds, summarise } from '../compare-rules.js';

/** A legacy record for a finished stream, plus `overrides`. */
function legacy(overrides = {}) {
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

/** The same video as the API presents it, plus `overrides`. */
function current(overrides = {}) {
  return {
    videoId: 'aaaaaaaaaaa',
    channelId: 'UCEcMIuGR8WO2TwL9XIpjKtw',
    title: 'ある配信',
    publishedAt: '2026-05-05T01:02:03Z',
    availability: 'public',
    liveBroadcastContent: 'none',
    type: 'streaming',
    durationSeconds: 7501,
    // Views, likes and comments differ from the legacy fixture on purpose:
    // they move between one system reading the video and the other, and the
    // comparison has to pass over that. Chat matches, because #65 changed
    // what is counted and a difference there is a difference in judgement.
    viewCount: 4300,
    likeCount: 13,
    commentCount: 5,
    chatMessageCount: 900,
    chatUniqueUserCount: 40,
    fetchedAt: '2026-09-08T02:00:00Z',
    ...overrides,
  };
}

const reasonsFor = (o, n) => compareVideo(o, n).map((difference) => `${difference.field}:${difference.reason}`);

describe('durationSeconds', () => {
  test('reads an ISO 8601 duration', () => {
    expect(durationSeconds('PT2H5M1S')).toEqual(7501);
  });

  // 'P0D' is what the API answers for a stream that has not finished, and it
  // is a real zero rather than an absence, which is the whole reason the
  // comparison has to tell the two apart.
  test('reads P0D as zero, not as nothing', () => {
    expect(durationSeconds('P0D')).toEqual(0);
  });

  test.each([undefined, null, '', 'two hours', 'P1Y'])('has no answer for %p', (value) => {
    expect(durationSeconds(value)).toBeNull();
  });

  // Every part of the shape is optional, so 'PT' satisfies it and comes out
  // as no time at all. worker/src/lib/video.ts reads it the same way, and the
  // comparison has to agree with the rules it is checking rather than be
  // stricter than them. Nothing in the measured data is spelled this way.
  test('reads a duration with no parts as zero, as the collector does', () => {
    expect(durationSeconds('PT')).toEqual(0);
  });
});

describe('compareVideo', () => {
  // The counts move between one system reading a video and the other, which
  // says nothing about the rules, so only judgements are compared.
  test('ignores the counts that drift on their own', () => {
    expect(compareVideo(legacy(), current())).toEqual([]);
  });

  test('reports a judgement both sides state differently', () => {
    expect(compareVideo(legacy({ type: 'video' }), current())).toEqual([
      { field: 'type', oldValue: 'video', newValue: 'streaming', reason: null },
    ]);
  });

  // The old system wrote -1 into a count it gave up on and '' nearly
  // everywhere else. Both mean the same absence, and reading either as a
  // value would turn a gap into a disagreement.
  test.each([-1, '', null, undefined])('reads %p as the old system having nothing', (value) => {
    expect(reasonsFor(legacy({ chatMessageCount: value }), current())).toEqual([
      'chatMessageCount:old-system-gave-up-collecting',
    ]);
  });

  test('says the same length two ways is one length', () => {
    expect(compareVideo(legacy({ duration: 'PT1M' }), current({ durationSeconds: 60 }))).toEqual([]);
  });
});

describe('explain', () => {
  // Both columns video-update fills are still empty, which is what the
  // migration wrote and what nothing else produces.
  test('knows a row the sweep has not reached', () => {
    const unswept = current({ type: null, durationSeconds: null, liveBroadcastContent: 'none' });

    expect(reasonsFor(legacy({ liveBroadcastContent: 'upcoming' }), unswept)).toEqual([
      'liveBroadcastContent:not-yet-swept',
      'type:not-yet-swept',
      'durationSeconds:not-yet-swept',
    ]);
  });

  // The same two columns empty, but for good rather than for now. Videos.list
  // does not return the video, so there is no response to read a kind or a
  // length off, and the sweep coming back changes nothing. Measured: all 73
  // rows in this state had been read within the last two days.
  test('tells a video that is gone from one the sweep has not reached', () => {
    const gone = current({ type: null, durationSeconds: null, availability: 'unavailable' });

    expect(reasonsFor(legacy({ availability: 'unavailable' }), gone)).toEqual([
      'type:video-is-gone-so-nothing-to-judge',
      'durationSeconds:video-is-gone-so-nothing-to-judge',
    ]);
  });

  // Videos.list omits a deleted video and a private one alike, so the
  // collector can only say the video is gone. This is the one thing the old
  // system knew that the API cannot say, and #66 counts it as a difference in
  // definition rather than a gap in collection.
  test('knows that private cannot be told from deleted', () => {
    expect(reasonsFor(legacy({ availability: 'private' }), current({ availability: 'unavailable' }))).toEqual([
      'availability:private-indistinguishable-from-deleted',
    ]);
  });

  // #58's second symptom, seen from the other side: the old system dropped
  // the video from its update set and kept saying what it last saw. The one
  // row in the data was last read 2025-03-26 and is watchable today.
  test('knows a video that can be watched again', () => {
    expect(reasonsFor(legacy({ availability: 'private' }), current({ availability: 'public' }))).toEqual([
      'availability:old-value-predates-the-new-reading',
    ]);
  });

  // The reason claims the old reading is the older one, so it has to check
  // that. Over 6,433 videos this is not a formality: the old system had
  // looked more recently for 4,046 of them. Where it did, nothing here
  // accounts for the difference and it stays on the unexplained list.
  test('does not call the old value stale when the old side looked later', () => {
    const readToday = legacy({ availability: 'private', fetchedAt: '2026-09-08T09:00:00Z' });

    expect(reasonsFor(readToday, current({ availability: 'public', fetchedAt: '2026-09-07T02:10:15Z' }))).toEqual([
      'availability:null',
    ]);
  });

  // #58's first symptom: a video that could not be fetched kept its live
  // state for good. 15 of 16 deleted or private videos still read live or
  // upcoming there.
  test('knows a stale live state that the collector cleared', () => {
    const stale = legacy({ availability: 'private', liveBroadcastContent: 'live' });

    expect(reasonsFor(stale, current({ availability: 'unavailable' }))).toContain(
      'liveBroadcastContent:stale-live-state-cleared',
    );
  });

  // The old system read 'P0D' while the stream was running and never looked
  // again. The new side has a real length, which only a finished stream has.
  test('knows a stream that finished between the two readings', () => {
    const running = legacy({ liveBroadcastContent: 'live', duration: 'P0D', type: 'streaming', actualEndTime: '' });

    expect(reasonsFor(running, current({ durationSeconds: 7501 }))).toEqual([
      'liveBroadcastContent:stream-ended-since',
      'durationSeconds:stream-ended-since',
    ]);
  });

  // Zero is a length the shorts rule would act on, so the collector records
  // none at all until the stream ends.
  test('knows an unfinished stream has no length yet', () => {
    const running = legacy({ liveBroadcastContent: 'live', duration: 'P0D', actualEndTime: '' });
    const notYet = current({ liveBroadcastContent: 'live', durationSeconds: null, type: 'streaming' });

    expect(reasonsFor(running, notYet)).toEqual(['durationSeconds:unfinished-stream-has-no-length']);
  });

  // YouTube revises the length of a recording after the stream ends. Nine
  // rows in the measured data differ, all of them finished streams, none by
  // more than six seconds on a recording of an hour or more.
  test('knows a recording whose length settled afterwards', () => {
    expect(reasonsFor(legacy({ duration: 'PT2H5M1S' }), current({ durationSeconds: 7505 }))).toEqual([
      'durationSeconds:recording-length-settled-after-the-stream',
    ]);
  });

  // Far enough apart and it is not the same recording settling. A rule that
  // explained any difference would explain nothing.
  test('does not call a wholly different length settling', () => {
    expect(reasonsFor(legacy({ duration: 'PT2H5M1S' }), current({ durationSeconds: 3000 }))).toEqual([
      'durationSeconds:null',
    ]);
  });

  // The length rule disagreeing with YouTube is a finding, not something to
  // explain away. Probing youtube.com/shorts/<id> agreed with the old system
  // for all 22 videos around the boundary.
  test('leaves a disputed kind unexplained', () => {
    const short = legacy({
      type: 'shorts',
      duration: 'PT1M1S',
      scheduledStartTime: '',
      actualStartTime: '',
      actualEndTime: '',
    });

    expect(reasonsFor(short, current({ type: 'video', durationSeconds: 61 }))).toEqual(['type:null']);
  });
});

describe('compareAll', () => {
  const oldSide = [legacy(), legacy({ videoId: 'bbbbbbbbbbb', type: 'video' })];
  const newSide = [current(), current({ videoId: 'ccccccccccc' })];

  test('compares only what both sides have', () => {
    expect(compareAll(oldSide, newSide).compared).toEqual(1);
  });

  // Each system reaches videos the other has not: the old one is still
  // collecting, and the collector finds a new upload within ten minutes.
  test('counts what only one side has apart from the differences', () => {
    const result = compareAll(oldSide, newSide);

    expect(result.onlyOld).toEqual(['bbbbbbbbbbb']);
    expect(result.onlyNew).toEqual(['ccccccccccc']);
    expect(result.differences).toEqual([]);
  });

  test('collects the differences nothing accounts for', () => {
    const result = compareAll([legacy({ type: 'video' })], [current()]);

    expect(result.unexplained).toEqual([
      { videoId: 'aaaaaaaaaaa', field: 'type', oldValue: 'video', newValue: 'streaming', reason: null },
    ]);
  });
});

describe('summarise', () => {
  test('counts by field and reason, largest first', () => {
    const differences = [
      { field: 'type', reason: 'not-yet-swept' },
      { field: 'type', reason: 'not-yet-swept' },
      { field: 'availability', reason: null },
    ];

    expect(summarise(differences)).toEqual([
      { field: 'type', reason: 'not-yet-swept', count: 2 },
      { field: 'availability', reason: '(unexplained)', count: 1 },
    ]);
  });
});
