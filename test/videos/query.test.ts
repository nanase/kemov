import { defaultState, queryToState, stateToQuery, type PageState } from '@/videos/query';
import type { Filters } from '@/videos/model';

/**
 * The round trip between a page state and its URL query - #135's requirement
 * that a reload, and a link someone was handed, open to the same ranking.
 */

const filters = (over: Partial<Filters> = {}): Filters => ({
  lengthBandId: 'any',
  channelIds: new Set(),
  query: '',
  ...over,
});

describe('stateToQuery', () => {
  test('the default state has no query string at all', () => {
    expect(stateToQuery(defaultState()).toString()).toEqual('');
  });

  test('writes a metric and a kind that are not the default', () => {
    const state: PageState = { ...defaultState(), metric: 'viewCount', kind: 'video' };

    expect(stateToQuery(state).get('metric')).toEqual('viewCount');
    expect(stateToQuery(state).get('type')).toEqual('video');
  });

  test.each([
    ['p365', '1y'],
    ['p90', '90d'],
    ['p30', '30d'],
  ] as const)('writes the period %s as %s', (period, queryId) => {
    const state: PageState = { ...defaultState(), period };

    expect(stateToQuery(state).get('period')).toEqual(queryId);
  });

  test("'all', the default period, writes nothing", () => {
    expect(stateToQuery({ ...defaultState(), period: 'all' }).get('period')).toBeNull();
  });

  test('a year writes both period=year and the year itself', () => {
    const params = stateToQuery({ ...defaultState(), period: { year: 2021 } });

    expect(params.get('period')).toEqual('year');
    expect(params.get('year')).toEqual('2021');
  });

  test('writes the title search, the length band and every selected channel', () => {
    const state: PageState = {
      ...defaultState(),
      filters: filters({ query: '歌ってみた', lengthBandId: 'a', channelIds: new Set(['UCaaa', 'UCbbb']) }),
    };
    const params = stateToQuery(state);

    expect(params.get('q')).toEqual('歌ってみた');
    expect(params.get('duration')).toEqual('a');
    expect(params.getAll('channels')).toEqual(['UCaaa', 'UCbbb']);
  });
});

describe('queryToState', () => {
  test('an empty query string reads as the default state', () => {
    expect(queryToState(new URLSearchParams())).toEqual(defaultState());
  });

  test('round-trips every field, including a year', () => {
    const state: PageState = {
      metric: 'chatMessageCountPerSecond',
      kind: 'shorts',
      period: { year: 2022 },
      filters: filters({ query: 'マイクラ', lengthBandId: 'b', channelIds: new Set(['UCaaa', 'UCbbb']) }),
    };

    expect(queryToState(stateToQuery(state))).toEqual(state);
  });

  test('a metric this page does not have falls back to the default rather than throwing', () => {
    expect(queryToState(new URLSearchParams('metric=notAMetric')).metric).toEqual(defaultState().metric);
  });

  test('a kind this page does not have falls back to the default', () => {
    expect(queryToState(new URLSearchParams('type=podcast')).kind).toEqual(defaultState().kind);
  });

  test('period=year without a year falls back to the default period', () => {
    expect(queryToState(new URLSearchParams('period=year')).period).toEqual('all');
  });

  test('a year that is not a whole number falls back to the default period', () => {
    expect(queryToState(new URLSearchParams('period=year&year=abc')).period).toEqual('all');
  });

  test('a period this page does not have falls back to the default', () => {
    expect(queryToState(new URLSearchParams('period=lastWeek')).period).toEqual('all');
  });

  test('a length band this page does not have falls back to "any"', () => {
    expect(queryToState(new URLSearchParams('duration=eternal')).filters.lengthBandId).toEqual('any');
  });

  test('repeats of channels become one set, in no particular guaranteed order', () => {
    const state = queryToState(new URLSearchParams('channels=UCaaa&channels=UCbbb'));

    expect(state.filters.channelIds).toEqual(new Set(['UCaaa', 'UCbbb']));
  });
});
