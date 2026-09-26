import { ShapeError } from '@/lib/read';
import { readSubscriberMilestones } from '@/type/api';

/**
 * Reading `GET /api/subscribers/milestones` (#225).
 *
 * The body is written out here, in the shape
 * worker/src/admin/subscriber-milestones-publish.ts builds, for the reason
 * test/type/api.test.ts gives.
 */

const BODY = {
  published_at: '2026-09-26T00:00:00Z',
  shape_version: 1,
  milestones: [
    {
      milestone_id: 3,
      channel_id: 'UCaaa',
      date_precision: 'day',
      reached_date: '2024-01-30',
      subscriber_count: 20000,
      announced_by: 'member',
      event: { event_id: 7, title: '登録者2万人記念配信', start_date: '2024-01-30' },
      sources: [{ url: 'https://x.com/example/status/1', title: null }],
    },
    {
      milestone_id: 4,
      channel_id: 'UCaaa',
      date_precision: 'month',
      reached_date: '2022-11',
      subscriber_count: 15000,
      announced_by: 'listener',
      event: null,
      sources: [],
    },
  ],
};

describe('readSubscriberMilestones', () => {
  test('reads both precisions, the linked event and the sources', () => {
    const read = readSubscriberMilestones(BODY);

    expect(read.publishedAt?.toISOString()).toEqual('2026-09-26T00:00:00.000Z');
    expect(read.milestones[0]).toEqual({
      milestoneId: 3,
      channelId: 'UCaaa',
      datePrecision: 'day',
      reachedDate: '2024-01-30',
      subscriberCount: 20000,
      announcedBy: 'member',
      event: { eventId: 7, title: '登録者2万人記念配信', startDate: '2024-01-30' },
      sources: [{ url: 'https://x.com/example/status/1', title: null }],
    });
    expect(read.milestones[1]).toMatchObject({ datePrecision: 'month', reachedDate: '2022-11', event: null });
  });

  test('refuses a date more exact or less exact than its precision says', () => {
    const at = (reached_date: string, date_precision: string) => ({
      ...BODY,
      milestones: [{ ...BODY.milestones[0], reached_date, date_precision }],
    });

    expect(() => readSubscriberMilestones(at('2024-01', 'day'))).toThrow(ShapeError);
    expect(() => readSubscriberMilestones(at('2024-01-30', 'month'))).toThrow(ShapeError);
    expect(() => readSubscriberMilestones(at('2024', 'year'))).toThrow(ShapeError);
  });

  test('refuses an announcer it does not know', () => {
    const body = { ...BODY, milestones: [{ ...BODY.milestones[0], announced_by: 'someone' }] };

    expect(() => readSubscriberMilestones(body)).toThrow(ShapeError);
  });
});
