/**
 * Lines the judgements the collector makes up against the ones it replaces.
 *
 * #66 asks for a list of differences in which every entry is explained. The
 * shape that answers it is one function that finds differences and one that
 * names the reason for each, because an explanation nobody can check is not an
 * explanation: every reason here is decided from the two records, so a row
 * that stops matching its reason stops being explained and appears in the
 * report as unexplained.
 *
 * Only judgements are compared. The counts a video accumulates - views, likes,
 * comments - move on their own between one system reading them and the other,
 * so a difference there says nothing about the rules. Chat is the exception
 * and is compared, because #65 changed what is counted rather than when.
 *
 * This is JavaScript for bare node, like the rest of scripts/. The duration
 * parser below repeats worker/src/lib/video.ts for the reason
 * legacy-videos.js' toTimestamp repeats time.ts: that one is TypeScript for
 * workerd and cannot be imported here, and the rule is small enough that a
 * build step to share it would cost more than the repetition.
 */

const DURATION_PATTERN = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

/** An ISO 8601 duration in seconds, or null when it is absent or unreadable. */
export function durationSeconds(duration) {
  if (typeof duration !== 'string' || duration === '') return null;

  const match = DURATION_PATTERN.exec(duration);

  if (!match) return null;

  const [, days, hours, minutes, seconds] = match;

  return Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);
}

/** The old system's two spellings of "no value", as one answer. */
function oldValue(value) {
  return value === undefined || value === null || value === '' || value === -1 ? null : value;
}

/**
 * The judgement fields, and how to read each one off the two sides.
 *
 * `duration` is here as seconds rather than as the string the old system
 * wrote, so that 'PT1M' and 60 do not read as a difference when they are the
 * same length said twice.
 */
const FIELDS = [
  { name: 'availability', old: (o) => oldValue(o.availability), new: (n) => n.availability },
  { name: 'liveBroadcastContent', old: (o) => oldValue(o.liveBroadcastContent), new: (n) => n.liveBroadcastContent },
  { name: 'type', old: (o) => oldValue(o.type), new: (n) => n.type ?? null },
  { name: 'durationSeconds', old: (o) => durationSeconds(o.duration), new: (n) => n.durationSeconds ?? null },
  { name: 'chatMessageCount', old: (o) => oldValue(o.chatMessageCount), new: (n) => n.chatMessageCount ?? null },
  {
    name: 'chatUniqueUserCount',
    old: (o) => oldValue(o.chatUniqueUserCount),
    new: (n) => n.chatUniqueUserCount ?? null,
  },
];

/** Whether the old record shows the video was ever a live stream. */
function wasStream(record) {
  return ['scheduledStartTime', 'actualStartTime', 'actualEndTime'].some((key) => oldValue(record[key]) !== null);
}

/** Whether the old record shows a stream that finished. */
function streamEnded(record) {
  return oldValue(record.actualEndTime) !== null;
}

/**
 * Whether the collector read this video after the old system last did.
 *
 * Both sides record when they looked, and neither is reliably the fresher:
 * measured over 6,433 videos, the old system had looked more recently for
 * 4,046 of them and the collector for 2,384. So this settles something rather
 * than always holding, which is what makes it usable as evidence.
 *
 * Milliseconds on one side and not the other, so the two are parsed rather
 * than compared as text.
 */
function newSideLookedLater(oldRecord, newRecord) {
  const was = Date.parse(oldRecord.fetchedAt ?? '');
  const now = Date.parse(newRecord.fetchedAt ?? '');

  return Number.isFinite(was) && Number.isFinite(now) && now > was;
}

/**
 * Whether video-update has yet to reach this row.
 *
 * The migration left both columns the sweep fills empty, and the collector
 * fills them together, so one without the other never occurs and either one
 * being absent says the same thing.
 */
function isUnswept(record) {
  return (record.type ?? null) === null && (record.durationSeconds ?? null) === null;
}

/**
 * Why a difference is there, or null when nothing here accounts for it.
 *
 * Each reason is a claim about the pair that the pair itself settles. They are
 * tried in order, and the first that holds is the answer, so a narrower reason
 * has to come before a broader one that would also match.
 */
export function explain(difference, oldRecord, newRecord) {
  const { field, oldValue: was, newValue: now } = difference;

  // The sweep has not reached this video. Both columns the sweep fills are
  // still empty, which is what the migration wrote and nothing else produces:
  // the collector never writes one without the other. It accounts for the
  // live state as well, because the migration wrote 'none' there for every
  // row rather than carrying across a value #63 had shown to be stale.
  if (isUnswept(newRecord) && ['type', 'durationSeconds', 'liveBroadcastContent'].includes(field)) {
    return 'not-yet-swept';
  }

  if (field === 'availability') {
    // Videos.list omits a deleted video and a private one alike, so absence
    // cannot tell them apart and the collector says only that it is gone. The
    // old system knew better because it scraped, and that is the one thing it
    // knew that the API cannot say.
    if (was === 'private' && now === 'unavailable') return 'private-indistinguishable-from-deleted';
    // The old system left the field empty for a video it had not judged yet.
    if (was === null) return 'old-system-had-not-judged-it';
    // The video can be watched again, and the reading that says so is the
    // later of the two. The collector writes 'public' only for a video
    // Videos.list returned, so that half is an observation; the timestamps
    // are what make the old value the stale one rather than the new.
    //
    // The reason says only that, because only that is checked. Whether the
    // old system stopped looking or the video was unlocked after it last
    // looked, neither record can tell - and it does not have to, since the
    // difference is accounted for either way. The one row in the data is
    // #58's second symptom: last read 2025-03-26, one of the five it names as
    // stranded, and youtube.com/oembed answers 200 for it today.
    if ((was === 'private' || was === 'unavailable') && now === 'public' && newSideLookedLater(oldRecord, newRecord)) {
      return 'old-value-predates-the-new-reading';
    }
  }

  if (field === 'liveBroadcastContent') {
    // #58's first symptom: a video that could no longer be fetched kept the
    // live state it had when it was last seen. The collector clears it.
    if (was !== 'none' && now === 'none' && oldRecord.availability !== 'public') return 'stale-live-state-cleared';
    // A stream that finished between the two readings. The old system's own
    // record is not the evidence here - it is the side that stopped looking -
    // so the new one is: a length is only recorded once a stream has ended.
    if (was !== 'none' && now === 'none' && (newRecord.durationSeconds ?? 0) > 0) return 'stream-ended-since';
    if (was !== 'none' && now === 'none' && streamEnded(oldRecord)) return 'stream-ended-since';
    // One that started or was announced between them.
    if (was === 'none' && now !== 'none') return 'stream-started-since';
  }

  if (field === 'type') {
    // The old system had not worked out what this video was.
    if (was === null) return 'old-system-had-not-judged-it';

    // A stream that had not finished when the old system last read it. Its
    // length was 'P0D' then and is real now, and the kind follows the length.
    if (durationSeconds(oldRecord.duration) === 0 && newRecord.durationSeconds !== null) {
      return 'stream-ended-since';
    }

    // Everything else the two sides call by different names is the length
    // rule disagreeing with YouTube, which is a finding rather than an
    // explanation and is left unexplained on purpose. Probing
    // youtube.com/shorts/<id> for the 22 videos around the boundary agreed
    // with the old system every time: 61 seconds is a short there and is not
    // here, and a 44-second clip or a stream that ended in four seconds is
    // not a short there but is here. See the PR body.
  }

  if (field === 'durationSeconds') {
    // An unfinished stream reports 'P0D'. Zero is a real length that the
    // shorts rule would act on, so the collector records no length at all
    // rather than one nobody measured.
    if (was === 0 && now === null) return 'unfinished-stream-has-no-length';
    // The same stream, seen after it ended. The old system read 'P0D' while
    // it was running and never looked again.
    if (was === 0 && now !== null) return 'stream-ended-since';
    // The old system never recorded a length for this video at all.
    if (was === null) return 'old-system-recorded-no-length';

    // YouTube revises the length of a stream's recording after the stream
    // ends - measured across 6,433 videos, nine differ and every one is a
    // finished stream out by six seconds or less on a recording of an hour or
    // more. A cutoff would need a threshold nobody can justify, so the claim
    // made here is the one the data supports: both sides agree to within the
    // second, and the row is a stream.
    if (was !== null && now !== null && wasStream(oldRecord)) {
      const drift = Math.abs(now - was);

      if (drift <= Math.max(10, was * 0.01)) return 'recording-length-settled-after-the-stream';
    }
  }

  if (field === 'chatMessageCount' || field === 'chatUniqueUserCount') {
    // The old system wrote -1 and stopped when the third-party API failed.
    // oldValue reads that as null, so this is the row arriving as a gap.
    if (was === null) return 'old-system-gave-up-collecting';
    // Both sides have a figure and they disagree. #65 defines a message as an
    // item carrying authorExternalChannelId; the old system recorded whatever
    // a third-party API returned, and that API is gone, so what it counted
    // cannot be recovered. This is the reason that cannot be verified, and it
    // is named separately so the report never presents it as settled.
    if (was !== null && now !== null) return 'chat-definition-differs-unverifiable';
    // The new side has not collected it yet.
    if (now === null) return 'chat-not-yet-collected';
  }

  return null;
}

/**
 * Every judgement the two records disagree on, each with its reason.
 *
 * A difference with `reason: null` is one nothing accounts for, which is what
 * the report exists to surface.
 */
export function compareVideo(oldRecord, newRecord) {
  const differences = [];

  for (const field of FIELDS) {
    const was = field.old(oldRecord);
    const now = field.new(newRecord);

    if (was === now) continue;

    const difference = { field: field.name, oldValue: was, newValue: now };

    differences.push({ ...difference, reason: explain(difference, oldRecord, newRecord) });
  }

  return differences;
}

/**
 * The whole comparison: which videos are on both sides, and what differs.
 *
 * A video only one side has is not a difference in judgement and is counted
 * apart from them. The old system keeps collecting while this runs, and the
 * collector finds new uploads within ten minutes, so each side reaches videos
 * the other has not.
 */
export function compareAll(oldRecords, newRecords) {
  const oldById = new Map(oldRecords.map((record) => [record.videoId, record]));
  const newById = new Map(newRecords.map((record) => [record.videoId, record]));

  const compared = [];
  const differences = [];

  for (const [videoId, oldRecord] of oldById) {
    const newRecord = newById.get(videoId);

    if (newRecord === undefined) continue;

    compared.push(videoId);

    for (const difference of compareVideo(oldRecord, newRecord)) {
      differences.push({ videoId, ...difference });
    }
  }

  return {
    compared: compared.length,
    onlyOld: [...oldById.keys()].filter((id) => !newById.has(id)),
    onlyNew: [...newById.keys()].filter((id) => !oldById.has(id)),
    differences,
    unexplained: differences.filter((difference) => difference.reason === null),
  };
}

/** Differences counted by field and reason, for the report's summary. */
export function summarise(differences) {
  const counts = new Map();

  for (const { field, reason } of differences) {
    const key = `${field}\t${reason ?? '(unexplained)'}`;

    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts]
    .map(([key, count]) => {
      const [field, reason] = key.split('\t');

      return { field, reason, count };
    })
    .sort((a, b) => b.count - a.count || a.field.localeCompare(b.field));
}
