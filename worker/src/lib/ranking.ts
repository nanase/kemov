/**
 * What a video can be ranked by, and how each one reads out of the row.
 *
 * The names are the ones src/type/video.ts already uses. #70 replaces where
 * the front end gets its data, not what it shows, so a ranking called
 * something else here would turn that into a rewrite rather than a move.
 *
 * Three of these are counts the row holds. The other eight are derived, and
 * that is why there is no index for any of them - see the note on
 * ORDERABLE_COLUMN below and the measurements in the pull request.
 */

/** Every metric the API will order by. */
export const RANKING_METRICS = [
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
] as const;

export type RankingMetric = (typeof RANKING_METRICS)[number];

export function isRankingMetric(value: string): value is RankingMetric {
  return (RANKING_METRICS as readonly string[]).includes(value);
}

/**
 * The video kinds a ranking may be narrowed to.
 *
 * The same three the schema stores, named here so a caller can ask for one
 * without this file importing what the front end calls them.
 *
 * A cross-channel ranking needs this in a way one channel's did not. The
 * per-second metrics divide by a duration that stops at 60 seconds for a short
 * and runs to hours for a stream, so ranking every kind together ranks shorts:
 * measured across the archive, a short averages 141 views per second of length
 * against a stream's 0.58, while streams are 97% of the rows. The answer is
 * arithmetically right and tells the reader nothing, because it compares two
 * things that are not alike.
 */
export const VIDEO_KINDS = ['video', 'streaming', 'shorts'] as const;

export type VideoKind = (typeof VIDEO_KINDS)[number];

export function isVideoKind(value: string): value is VideoKind {
  return (VIDEO_KINDS as readonly string[]).includes(value);
}

/**
 * These two functions return SQL, which nothing else in worker/src/lib does,
 * and their results are interpolated into a query rather than bound.
 *
 * That is safe here for one reason, and it is worth naming because it is the
 * kind of thing that stops being true quietly. Neither function takes text
 * from a request: both take a RankingMetric, which is a union of eleven
 * literals, and the only way to obtain one from a caller is isRankingMetric,
 * which rejects anything else before the query is built. The strings below are
 * written in this file and nowhere else.
 *
 * A metric that had to carry a value from the caller - a threshold, a channel
 * to filter to - could not be handled this way. That belongs in a bound
 * parameter, and this pair should not grow one.
 */

/**
 * The SQL expression each metric orders by.
 *
 * The per-second ones divide by `duration_seconds`, which is why they are
 * written as expressions rather than column names: SQLite cannot use an index
 * on a column to order by a function of it. A ranking by
 * chatMessageCountPerUniqueUser is a division of two nullable counts, so it is
 * guarded here rather than left to produce a row with a null where a number
 * belongs.
 *
 * CAST to REAL on the numerator, because both sides are INTEGER columns and
 * SQLite's / on two integers is integer division. Without it every rate under
 * one comes out zero and the ranking is a list of ties.
 */
const EXPRESSIONS: Readonly<Record<RankingMetric, string>> = {
  viewCount: 'view_count',
  likeCount: 'like_count',
  commentCount: 'comment_count',
  chatMessageCount: 'chat_message_count',
  chatUniqueUserCount: 'chat_unique_user_count',
  duration: 'duration_seconds',
  chatMessageCountPerUniqueUser: 'CAST(chat_message_count AS REAL) / chat_unique_user_count',
  viewCountPerSecond: 'CAST(view_count AS REAL) / duration_seconds',
  likeCountPerSecond: 'CAST(like_count AS REAL) / duration_seconds',
  commentCountPerSecond: 'CAST(comment_count AS REAL) / duration_seconds',
  chatMessageCountPerSecond: 'CAST(chat_message_count AS REAL) / duration_seconds',
};

/**
 * The columns a metric needs before it can be computed at all.
 *
 * A row missing any of them is left out of the ranking rather than ordered as
 * if the missing part were zero. Every migrated video has a null
 * `duration_seconds` until video-update reaches it, so on the day the
 * migration lands the per-second rankings are short by however much of the
 * archive has not been swept yet - which is the honest answer, and it fills in
 * on its own.
 */
const REQUIRED: Readonly<Record<RankingMetric, readonly string[]>> = {
  viewCount: ['view_count'],
  likeCount: ['like_count'],
  commentCount: ['comment_count'],
  chatMessageCount: ['chat_message_count'],
  chatUniqueUserCount: ['chat_unique_user_count'],
  duration: ['duration_seconds'],
  chatMessageCountPerUniqueUser: ['chat_message_count', 'chat_unique_user_count'],
  viewCountPerSecond: ['view_count', 'duration_seconds'],
  likeCountPerSecond: ['like_count', 'duration_seconds'],
  commentCountPerSecond: ['comment_count', 'duration_seconds'],
  chatMessageCountPerSecond: ['chat_message_count', 'duration_seconds'],
};

/** The expression a ranking orders by, and reports as its value. */
export function rankingExpression(metric: RankingMetric): string {
  return EXPRESSIONS[metric];
}

/**
 * The condition a row must meet to appear in a ranking by `metric`.
 *
 * Every required column must be present, and any divisor must be above zero -
 * a video of no length would otherwise divide by zero, which SQLite answers
 * with NULL and which would sort as if the video had never been measured.
 */
export function rankingFilter(metric: RankingMetric): string {
  const conditions = REQUIRED[metric].map((column) => `${column} IS NOT NULL`);

  if (REQUIRED[metric].includes('duration_seconds') && metric !== 'duration') {
    conditions.push('duration_seconds > 0');
  }

  if (metric === 'chatMessageCountPerUniqueUser') conditions.push('chat_unique_user_count > 0');

  return conditions.join(' AND ');
}
