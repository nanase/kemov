import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ShapeError } from '@/lib/read';
import { EVENT_KINDS, readFootprintEvents } from '@/type/api';

/**
 * The kinds the public page reads and the kinds the admin API saves are one
 * list said twice. `readFootprintEvents` refuses a kind it does not know
 * outright, so one spelling that differs makes every read of
 * /api/footprints/events fail, not just the row that carries it (#174).
 */

/**
 * Read out of the worker's source rather than imported: worker/ is typed
 * against workers-types, which the frontend's type-check does not load, so
 * importing it here would put worker types into that check.
 */
const ADMIN_KINDS = [
  ...readFileSync(resolve(import.meta.dirname, '../../worker/src/admin/footprints.ts'), 'utf8')
    .match(/export const KINDS = \[([^\]]*)\]/)![1]
    .matchAll(/'([^']+)'/g),
].map((match) => match[1]);

const eventOfKind = (kind: string) => ({
  published_at: '2026-09-20T00:00:00Z',
  events: [
    {
      event_id: 1,
      date_precision: 'day',
      start_date: '2026-09-20',
      starts_at: null,
      end_date: null,
      kind,
      emphasized: false,
      title: 'できごと',
      place: null,
      supplement: null,
      video_id: null,
      source_pending: false,
      channel_ids: [],
      sources: [],
    },
  ],
});

describe('EVENT_KINDS', () => {
  test('is the same set as the kinds the admin API saves', () => {
    expect([...EVENT_KINDS].sort()).toEqual([...ADMIN_KINDS].sort());
  });

  test.each(['announcement', 'new_outfit', 'real_event'])('reads %s', (kind) => {
    expect(readFootprintEvents(eventOfKind(kind)).events[0].kind).toBe(kind);
  });

  test.each(['reveal', 'outfit', 'live-event'])('refuses the old spelling %s', (kind) => {
    expect(() => readFootprintEvents(eventOfKind(kind))).toThrow(ShapeError);
  });

  test.each(ADMIN_KINDS)('reads every kind the admin API saves: %s', (kind) => {
    expect(readFootprintEvents(eventOfKind(kind)).events[0].kind).toBe(kind);
  });
});
