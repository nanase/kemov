import { ShapeError } from '@/lib/read';
import { readFootprintEvents } from '@/type/api';

/**
 * `lead_channel_ids` came after the first publish of the timeline. The file
 * already in R2 when this reader ships has no such key, and every read of it
 * must still succeed.
 */

const body = (extra: Record<string, unknown>) => ({
  published_at: '2026-10-18T00:00:00Z',
  events: [
    {
      event_id: 6,
      date_precision: 'day',
      start_date: '2021-06-11',
      starts_at: null,
      end_date: null,
      kind: 'debut',
      emphasized: true,
      title: 'シマハイイロギツネが初配信',
      place: null,
      supplement: null,
      video_id: null,
      source_pending: false,
      channel_ids: ['UCa', 'UCb'],
      sources: [],
      ...extra,
    },
  ],
});

describe('lead_channel_ids', () => {
  test('reads the leads', () => {
    expect(readFootprintEvents(body({ lead_channel_ids: ['UCb'] })).events[0]!.leadChannelIds).toEqual(['UCb']);
  });

  test('reads a file published before leads as naming none', () => {
    expect(readFootprintEvents(body({})).events[0]!.leadChannelIds).toEqual([]);
  });

  test('refuses leads that are not a list of ids', () => {
    expect(() => readFootprintEvents(body({ lead_channel_ids: 'UCb' }))).toThrow(ShapeError);
  });
});
