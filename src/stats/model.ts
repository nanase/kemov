import type { Channel, ChannelMonths, CountName, Delta, LiveStream, MonthTotals } from '@/type/api';

/**
 * Everything the statistics page works out from what the API answers.
 *
 * Kept apart from the components so it can be tested without a DOM, and
 * written as functions over plain values for the same reason: the frontend
 * test project runs on node.
 *
 * The rules #134 fixed are enforced here rather than in the markup, because
 * they are about numbers. Members are never ranked or scaled against one
 * another: every series is scaled inside its own row, and the order the API
 * sends - `display_order` - is the order everything keeps.
 */

const MINUTES_PER_DAY = 24 * 60;

/** How many minutes a week holds. `GET /api/streams` counts its spans from Sunday 00:00 JST. */
export const WEEK_MINUTES = 7 * MINUTES_PER_DAY;

/** The four numbers the list and the totals can show. */
export const METRICS = [
  { id: 'subscriberCount', label: '登録数', head: '登録数', series: 'subs' },
  { id: 'viewCount', label: '再生数', head: '再生数', series: 'views' },
  { id: 'videoCount', label: '配信・動画数', head: '動画数', series: 'streams' },
  { id: 'chatCount', label: 'チャット数', head: 'チャット数', series: 'chat' },
] as const;

export type MetricId = (typeof METRICS)[number]['id'];

/** The periods a change can be read over, as `GET /api/channels` reports them. */
export const PERIODS = [
  { id: 'perHour', label: '1時間' },
  { id: 'perDay', label: '24時間' },
  { id: 'per30Days', label: '30日' },
] as const;

export type PeriodId = (typeof PERIODS)[number]['id'];

/**
 * The series the record panel can draw.
 *
 * `views` is the one that needs a word of warning: a month's value is what
 * the videos published that month have collected since, not what was watched
 * that month. #134 settled that the page has to say so rather than let the
 * axis imply otherwise.
 */
export const SERIES = [
  { id: 'streams', label: '配信・動画', kind: 'flow', unit: '本' },
  { id: 'hours', label: '配信時間', kind: 'flow', unit: '時間', decimals: 1 },
  { id: 'chat', label: 'チャット数', kind: 'flow', unit: '件' },
  { id: 'views', label: '再生数', kind: 'flow', unit: '回', note: '公開月ごと' },
  { id: 'subsLevel', label: '登録数', kind: 'level', unit: '人' },
  { id: 'subs', label: '登録数の増加', kind: 'flow', unit: '人' },
] as const;

export type SeriesId = (typeof SERIES)[number]['id'];
export type SeriesKind = 'flow' | 'level';

export interface SeriesDef {
  id: SeriesId;
  label: string;
  kind: SeriesKind;
  unit: string;
  decimals?: number;
  note?: string;
}

export function seriesDef(id: SeriesId): SeriesDef {
  return SERIES.find((s) => s.id === id) as SeriesDef;
}

export function metricDef(id: MetricId) {
  return METRICS.find((m) => m.id === id)!;
}

export function periodLabel(id: PeriodId): string {
  return PERIODS.find((p) => p.id === id)!.label;
}

/** Chat has no snapshots behind it, so it has a total but never a change. */
export function hasDelta(metric: MetricId): boolean {
  return metric !== 'chatCount';
}

/**
 * A member, or the sum of them, as the page reads it.
 *
 * The sum is a subject like any other so that the record panel, the list's
 * last row and the totals can all be written once. `members` is what tells
 * them apart.
 */
export interface Subject {
  id: string;
  name: string;
  /** The member's own colour, or null for the sum, which uses the page's accent. */
  color: string | null;
  avatar: string | null;
  ended: boolean;
  activityStartDate: string;
  activityEndDate: string | null;
  counts: Record<CountName, number | null>;
  chatTotal: number | null;
  deltas: Record<PeriodId, Record<CountName, Delta>>;
  months: Record<SeriesId, (number | null)[]>;
  spans: readonly number[];
  /** Set only on the sum. */
  members?: Subject[];
}

/** The id the sum goes by. No channel id can collide with it: YouTube's all start with `UC`. */
export const TOTAL_ID = '__total';

function sumDelta(parts: readonly Delta[]): Delta {
  const values = parts.filter((d): d is Extract<Delta, { value: number }> => d.value !== null);

  // Every part missing means the sum is missing for the same reason. Some
  // parts missing still leaves a sum worth showing, made of what there is.
  if (values.length === 0) return parts[0] ?? { value: null, reason: 'nothing collected' };

  const total = values.reduce((sum, d) => sum + d.value, 0);
  const from = values.reduce(
    (earliest, d) => (d.over.from.isBefore(earliest) ? d.over.from : earliest),
    values[0]!.over.from,
  );
  const to = values.reduce((latest, d) => (d.over.to.isAfter(latest) ? d.over.to : latest), values[0]!.over.to);

  return { value: total, over: { from, to, seconds: to.diff(from, 'second') } };
}

function sumCounts(parts: readonly (number | null)[]): number | null {
  const known = parts.filter((v): v is number => v !== null);

  return known.length === 0 ? null : known.reduce((sum, v) => sum + v, 0);
}

/** The series a month row carries, named as the record panel names them. */
function monthsOf(
  row: Pick<ChannelMonths, 'streams' | 'videos' | 'streamSeconds' | 'chatMessages' | 'views' | 'subscribers'>,
): Record<SeriesId, (number | null)[]> {
  const both = row.streams.map((streams, i) => {
    const videos = row.videos[i] ?? null;

    return streams === null && videos === null ? null : (streams ?? 0) + (videos ?? 0);
  });

  return {
    streams: both,
    hours: row.streamSeconds.map((seconds) => (seconds === null ? null : seconds / 3600)),
    chat: row.chatMessages,
    views: row.views,
    subsLevel: row.subscribers,
    subs: monthlyGain(row.subscribers),
  };
}

/**
 * Month-on-month growth, from the counts each month was read at.
 *
 * A month without a reading has no growth to report, and neither has the
 * first month with one: there is nothing before it to compare against. Both
 * are null rather than zero, so that "nothing was collected" cannot be drawn
 * as "nobody subscribed".
 */
export function monthlyGain(counts: readonly (number | null)[]): (number | null)[] {
  let previous: number | null = null;

  return counts.map((count) => {
    if (count === null) return null;

    const gain = previous === null ? null : count - previous;
    previous = count;

    return gain;
  });
}

export interface SubjectSource {
  channels: readonly Channel[];
  months: readonly ChannelMonths[];
  total: MonthTotals;
  spans: ReadonlyMap<string, readonly number[]>;
}

const EMPTY_MONTHS = (length: number) => new Array<number | null>(length).fill(null);

/** One member, put together from the three endpoints that describe them. */
export function subjectOf(channel: Channel, source: SubjectSource): Subject {
  const length = source.total.streams.length;
  const row = source.months.find((m) => m.channelId === channel.channelId);
  const months = monthsOf(
    row ?? {
      streams: EMPTY_MONTHS(length),
      videos: EMPTY_MONTHS(length),
      streamSeconds: EMPTY_MONTHS(length),
      chatMessages: EMPTY_MONTHS(length),
      views: EMPTY_MONTHS(length),
      subscribers: EMPTY_MONTHS(length),
    },
  );

  return {
    id: channel.channelId,
    name: channel.name,
    color: channel.color.key,
    avatar: channel.thumbnailUrl,
    ended: channel.activityEndDate !== null,
    activityStartDate: channel.activityStartDate,
    activityEndDate: channel.activityEndDate,
    counts: channel.latest,
    chatTotal: sumCounts(months.chat),
    deltas: { perHour: channel.perHour, perDay: channel.perDay, per30Days: channel.per30Days },
    months,
    spans: source.spans.get(channel.channelId) ?? [],
  };
}

/**
 * The sum of the members on screen.
 *
 * The monthly series come from `GET /api/months`, which already carries an
 * ended member's last subscriber count forward rather than dropping it to
 * zero (#134). Doing it here instead would mean adding up nulls and getting
 * a month where the site appears to have lost thousands of subscribers.
 *
 * The sum is only the API's own when every member is on screen. With the
 * list narrowed to active members it is added up here, which the subscriber
 * series cannot be - so that series says nothing rather than something
 * wrong.
 */
export function totalOf(subjects: readonly Subject[], source: SubjectSource, everyMember: boolean): Subject {
  const length = source.total.streams.length;
  const series = (id: SeriesId): (number | null)[] =>
    Array.from({ length }, (_, i) => sumCounts(subjects.map((s) => s.months[id][i] ?? null)));

  const months: Record<SeriesId, (number | null)[]> = everyMember
    ? monthsOf({
        streams: source.total.streams,
        videos: source.total.videos,
        streamSeconds: source.total.streamSeconds,
        chatMessages: source.total.chatMessages,
        views: source.total.views,
        subscribers: source.total.subscribers,
      })
    : {
        streams: series('streams'),
        hours: series('hours'),
        chat: series('chat'),
        views: series('views'),
        subsLevel: EMPTY_MONTHS(length),
        subs: EMPTY_MONTHS(length),
      };

  const starts = subjects.map((s) => s.activityStartDate).sort();

  return {
    id: TOTAL_ID,
    name: 'けもV合計',
    color: null,
    avatar: null,
    ended: false,
    activityStartDate: starts[0] ?? '',
    activityEndDate: null,
    counts: {
      subscriberCount: sumCounts(subjects.map((s) => s.counts.subscriberCount)),
      viewCount: sumCounts(subjects.map((s) => s.counts.viewCount)),
      videoCount: sumCounts(subjects.map((s) => s.counts.videoCount)),
    },
    chatTotal: sumCounts(subjects.map((s) => s.chatTotal)),
    deltas: {
      perHour: deltasOf(subjects, 'perHour'),
      perDay: deltasOf(subjects, 'perDay'),
      per30Days: deltasOf(subjects, 'per30Days'),
    },
    months,
    spans: subjects.flatMap((s) => [...s.spans]),
    members: [...subjects],
  };
}

function deltasOf(subjects: readonly Subject[], period: PeriodId): Record<CountName, Delta> {
  const of = (name: CountName) => sumDelta(subjects.map((s) => s.deltas[period][name]));

  return { subscriberCount: of('subscriberCount'), viewCount: of('viewCount'), videoCount: of('videoCount') };
}

/** What the list shows for one subject under the chosen metric. */
export function valueOf(subject: Subject, metric: MetricId): number | null {
  return metric === 'chatCount' ? subject.chatTotal : subject.counts[metric];
}

/** The change beside it, or null where the metric has none to report. */
export function deltaOf(subject: Subject, metric: MetricId, period: PeriodId): Delta | null {
  return metric === 'chatCount' ? null : subject.deltas[period][metric];
}

/** The series the list's small chart draws while this metric is chosen. */
export function tableSeries(metric: MetricId): SeriesId {
  return metricDef(metric).series;
}

/**
 * How old the numbers are, in three steps.
 *
 * The step is worked out from when the collector last read the channels, not
 * from the `x-kemov-stale-seconds` header: that header says how long the API
 * held this body in its own cache, which is a different question and reads as
 * zero on a freshly built answer built from week-old rows.
 */
export type Freshness = 'ok' | 'warn' | 'bad';

export function freshnessOf(ageSeconds: number): Freshness {
  if (ageSeconds <= 10 * 60) return 'ok';

  return ageSeconds <= 30 * 60 ? 'warn' : 'bad';
}

/** What is on air now, what starts within the hour, and what starts later today. */
export type AnnouncementKind = 'live' | 'soon' | 'today';

export interface Announcement {
  kind: AnnouncementKind;
  channelId: string;
  videoId: string;
  title: string;
  /** `HH:MM` in JST for the two that have not started; empty while on air. */
  time: string;
}

const HOUR_MS = 60 * 60 * 1000;
const JST_OFFSET_MS = 9 * HOUR_MS;

function jstDay(ms: number): string {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(0, 10);
}

function jstClock(ms: number): string {
  return new Date(ms + JST_OFFSET_MS).toISOString().slice(11, 16);
}

/**
 * The announcements, in the order they are shown: on air, then within the
 * hour, then the rest of today.
 *
 * A stream scheduled for tomorrow or later is left out. The row is the top of
 * a page about what has happened, and a date two days out reads as something
 * to do rather than something to watch (2026-09-18).
 */
export function announcementsOf(streams: readonly LiveStream[], now: number): Announcement[] {
  const order: Record<AnnouncementKind, number> = { live: 0, soon: 1, today: 2 };

  const rows = streams.flatMap<Announcement>((stream) => {
    const common = { channelId: stream.channelId, videoId: stream.videoId, title: stream.title };

    if (stream.state === 'live') return [{ ...common, kind: 'live', time: '' }];

    const scheduled = stream.scheduledStartTime?.valueOf();

    if (scheduled === undefined) return [];
    if (jstDay(scheduled) !== jstDay(now)) return [];

    return [{ ...common, kind: scheduled - now <= HOUR_MS ? 'soon' : 'today', time: jstClock(scheduled) }];
  });

  return rows.sort((a, b) => order[a.kind] - order[b.kind]);
}

/**
 * The heatmap's grid: seven days by however many slots the chosen step cuts
 * a day into, each holding the minutes streamed in it.
 *
 * A four-hour stream puts sixty minutes into each of the four hours it
 * covers, rather than one mark on the hour it began. The difference matters
 * for the question the map answers, which is when somebody is on air and not
 * when they press the button.
 *
 * Built by walking a difference array once instead of filling every minute
 * of every stream: five years of streams is a few hundred thousand minutes
 * either way, and only one of the two runs while a reader waits.
 */
export function heatGrid(spans: readonly number[], stepMinutes: number): number[][] {
  const minutes = new Float64Array(WEEK_MINUTES);
  const diff = new Float64Array(WEEK_MINUTES + 1);

  for (let i = 0; i + 1 < spans.length; i += 2) {
    let start = spans[i]! % WEEK_MINUTES;
    let left = Math.min(spans[i + 1]!, WEEK_MINUTES);

    while (left > 0) {
      const run = Math.min(left, WEEK_MINUTES - start);

      diff[start] += 1;
      diff[start + run] -= 1;
      left -= run;
      start = 0;
    }
  }

  let carried = 0;

  for (let i = 0; i < WEEK_MINUTES; i += 1) {
    carried += diff[i]!;
    minutes[i] = carried;
  }

  const columns = MINUTES_PER_DAY / stepMinutes;

  return Array.from({ length: 7 }, (_, day) =>
    Array.from({ length: columns }, (_, slot) => {
      let sum = 0;

      for (let k = 0; k < stepMinutes; k += 1) sum += minutes[day * MINUTES_PER_DAY + slot * stepMinutes + k]!;

      return sum;
    }),
  );
}

export interface HeatCell {
  day: number;
  slot: number;
  minutes: number;
}

/** The busiest cell, which is what the map says out loud when nothing is pointed at. */
export function busiestCell(grid: readonly (readonly number[])[]): HeatCell {
  let best: HeatCell = { day: 0, slot: 0, minutes: grid[0]?.[0] ?? 0 };

  grid.forEach((row, day) =>
    row.forEach((minutes, slot) => {
      if (minutes > best.minutes) best = { day, slot, minutes };
    }),
  );

  return best;
}

/** The largest cell in the grid, which every cell's shade is read against. */
export function heatPeak(grid: readonly (readonly number[])[]): number {
  return Math.max(1, ...grid.map((row) => Math.max(0, ...row)));
}
