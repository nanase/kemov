import { AdminApiError } from '@/admin/lib/api';
import type { SubscriberMilestone } from '@/admin/lib/subscriber-milestones';
import { bulkPublishTargets, publishInTurn } from '@/admin/lib/subscriber-milestones-bulk';

function milestone(milestoneId: number, status: string): SubscriberMilestone {
  return {
    milestoneId,
    channelId: 'UC1',
    datePrecision: 'day',
    reachedDate: '2024-01-30',
    subscriberCount: 20000,
    announcedBy: 'member',
    eventId: null,
    status,
    memo: null,
    createdAt: '2024-02-01 00:00:00',
    updatedAt: '2024-02-01 00:00:00',
    sources: [],
  };
}

const REFUSED = new AdminApiError(400, { errors: ['there are no sources'] });

describe('bulkPublishTargets', () => {
  test('keeps only the drafts, in the order the table shows them', () => {
    const rows = [milestone(3, 'draft'), milestone(1, 'published'), milestone(2, 'draft'), milestone(4, 'review')];

    expect(bulkPublishTargets(rows).map((m) => m.milestoneId)).toEqual([3, 2]);
  });

  test('is empty when the table has no draft', () => {
    expect(bulkPublishTargets([milestone(1, 'published')])).toEqual([]);
    expect(bulkPublishTargets([])).toEqual([]);
  });
});

describe('publishInTurn', () => {
  test('publishes every row and reports each step', async () => {
    const calls: number[] = [];
    const progress: number[] = [];

    const outcome = await publishInTurn(
      [milestone(3, 'draft'), milestone(2, 'draft')],
      async (id) => {
        calls.push(id);
      },
      (done) => progress.push(done),
    );

    expect(calls).toEqual([3, 2]);
    expect(progress).toEqual([1, 2]);
    expect(outcome).toEqual({ total: 2, published: 2, skipped: [], stopped: null });
  });

  // One at a time: the next request starts only once the previous one has answered.
  test('does not start a request before the previous one answers', async () => {
    const started: number[] = [];
    const answers: (() => void)[] = [];

    const running = publishInTurn([milestone(1, 'draft'), milestone(2, 'draft')], (id) => {
      started.push(id);

      return new Promise<void>((resolve) => answers.push(resolve));
    });

    await Promise.resolve();
    expect(started).toEqual([1]);

    answers[0]!();
    await vi.waitFor(() => expect(started).toEqual([1, 2]));

    answers[1]!();
    expect((await running).published).toBe(2);
  });

  test('skips a row the check refuses (400) and goes on', async () => {
    const refused = milestone(2, 'draft');

    const outcome = await publishInTurn([milestone(1, 'draft'), refused, milestone(3, 'draft')], async (id) => {
      if (id === 2) throw REFUSED;
    });

    expect(outcome).toEqual({
      total: 3,
      published: 2,
      skipped: [{ milestone: refused, reason: 'there are no sources' }],
      stopped: null,
    });
  });

  test.each([
    ['the network', new AdminApiError(0, '/subscribers/milestones/2/publish could not be reached: TypeError')],
    ['a 5xx', new AdminApiError(500, null)],
    ['anything that is not an answer from the worker', new TypeError('boom')],
  ])('stops at a failure of %s and tries nothing after it', async (_, error) => {
    const calls: number[] = [];
    const failed = milestone(3, 'draft');
    const progress: number[] = [];

    const outcome = await publishInTurn(
      [milestone(1, 'draft'), milestone(2, 'draft'), failed, milestone(4, 'draft')],
      async (id) => {
        calls.push(id);
        if (id === 2) throw REFUSED;
        if (id === 3) throw error;
      },
      (done) => progress.push(done),
    );

    expect(calls).toEqual([1, 2, 3]);
    expect(progress).toEqual([1, 2]);
    expect(outcome.published).toBe(1);
    expect(outcome.skipped.map((s) => s.milestone.milestoneId)).toEqual([2]);
    expect(outcome.stopped).toEqual({ milestone: failed, reason: String(error.message) });
  });

  // A 404 (the row was deleted since the list was read) is not a refused
  // check: the list the run started from is no longer the database's.
  test('stops at any other 4xx too', async () => {
    const outcome = await publishInTurn([milestone(1, 'draft'), milestone(2, 'draft')], async (id) => {
      if (id === 1) throw new AdminApiError(404, { error: 'no subscriber milestone 1' });
    });

    expect(outcome.published).toBe(0);
    expect(outcome.stopped?.reason).toBe('no subscriber milestone 1');
  });
});
