import type { RankingPeriod } from '@/lib/ranking';
import { VIDEO_PROPERTIES, type VideoProperty } from '@/type/video';
import { VIDEO_TYPES, type VideoType } from '@/type/api';
import { DEFAULT_KIND, DEFAULT_METRIC, LENGTH_BANDS, NO_FILTERS, type Filters } from './model';

/**
 * The URL query #135 asks for: a reload, or a link someone was handed, opens
 * to the same ranking and the same filters. Encoding and decoding are kept
 * apart from `VideosPage.vue` so the round trip - state to a query string and
 * back - can be checked without mounting anything.
 *
 * The vocabulary is this page's own choice (#135's body left it open): a key
 * per control, `all` / `1y` / `90d` / `30d` / `year` for the period chips,
 * and `year` alongside `period=year` for which year. Absent means the
 * default, so the common case - the page opened with nothing narrowed - has
 * no query string at all.
 */

export interface PageState {
  metric: VideoProperty;
  kind: VideoType;
  period: RankingPeriod;
  filters: Filters;
}

export function defaultState(): PageState {
  return { metric: DEFAULT_METRIC, kind: DEFAULT_KIND, period: 'all', filters: NO_FILTERS };
}

const PERIOD_QUERY_IDS = ['all', '1y', '90d', '30d', 'year'] as const;
type PeriodQueryId = (typeof PERIOD_QUERY_IDS)[number];

const PERIOD_TO_QUERY: Record<Exclude<RankingPeriod, { year: number }> & string, PeriodQueryId> = {
  all: 'all',
  p365: '1y',
  p90: '90d',
  p30: '30d',
};

function periodToQuery(period: RankingPeriod): { period: PeriodQueryId; year: number | null } {
  if (typeof period === 'object') return { period: 'year', year: period.year };

  return { period: PERIOD_TO_QUERY[period], year: null };
}

function queryToPeriod(periodId: string | null, yearText: string | null): RankingPeriod | null {
  if (periodId === null) return 'all';
  if (!(PERIOD_QUERY_IDS as readonly string[]).includes(periodId)) return null;

  if (periodId !== 'year') {
    const id = (Object.keys(PERIOD_TO_QUERY) as (keyof typeof PERIOD_TO_QUERY)[]).find(
      (key) => PERIOD_TO_QUERY[key] === periodId,
    );

    return id ?? null;
  }

  const year = yearText === null ? NaN : Number(yearText);

  return Number.isInteger(year) ? { year } : null;
}

const LENGTH_BAND_IDS = new Set(LENGTH_BANDS.map((b) => b.id));

/**
 * `state` as a query string, with every key at its default left out.
 *
 * Leaving out a default rather than writing it keeps a shared link short and
 * keeps today's default from being frozen into a link written before it
 * changes: a reader who opens `/videos/` afresh always gets whatever the page
 * currently defaults to, not whatever it defaulted to when the link was
 * copied.
 */
export function stateToQuery(state: PageState): URLSearchParams {
  const defaults = defaultState();
  const params = new URLSearchParams();

  if (state.metric !== defaults.metric) params.set('metric', state.metric);
  if (state.kind !== defaults.kind) params.set('type', state.kind);

  const { period, year } = periodToQuery(state.period);

  if (period !== 'all') params.set('period', period);
  if (year !== null) params.set('year', String(year));

  if (state.filters.query !== '') params.set('q', state.filters.query);
  if (state.filters.lengthBandId !== defaults.filters.lengthBandId) params.set('duration', state.filters.lengthBandId);
  for (const channelId of state.filters.channelIds) params.append('channels', channelId);

  return params;
}

/**
 * `params` read back into a state, falling back to the default for any key
 * that is absent or not one of this page's own values.
 *
 * A value this page does not recognise - an old vocabulary, a hand-edited
 * link, a future one this build does not know yet - is read the same as the
 * key being absent, rather than thrown out as an error: the page still opens,
 * just without that one narrowing.
 */
export function queryToState(params: URLSearchParams): PageState {
  const defaults = defaultState();

  const metricText = params.get('metric');
  const metric = (
    metricText !== null && (VIDEO_PROPERTIES as readonly string[]).includes(metricText) ? metricText : defaults.metric
  ) as VideoProperty;

  const kindText = params.get('type');
  const kind = (
    kindText !== null && (VIDEO_TYPES as readonly string[]).includes(kindText) ? kindText : defaults.kind
  ) as VideoType;

  const period = queryToPeriod(params.get('period'), params.get('year')) ?? defaults.period;

  const durationText = params.get('duration');
  const lengthBandId = durationText !== null && LENGTH_BAND_IDS.has(durationText) ? durationText : 'any';

  return {
    metric,
    kind,
    period,
    filters: {
      query: params.get('q') ?? '',
      lengthBandId,
      channelIds: new Set(params.getAll('channels')),
    },
  };
}
