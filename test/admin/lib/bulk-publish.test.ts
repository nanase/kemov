import { AdminApiError } from '@/admin/lib/api';
import type { SubscriberMilestone } from '@/admin/lib/subscriber-milestones';
import {
  ABANDONED,
  allTicked,
  ALREADY_PUBLISHED,
  outcomeSummary,
  publishInTurn,
  tickableKeys,
  tickedRows,
  ticksAfterReload,
  toggleAll,
  toggleTick,
} from '@/admin/lib/bulk-publish';

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

const SOURCES_PROBLEM = '出典が足りません。ホワイトリストの出典か、別のサイトの出典を足してください。';
const REFUSED = new AdminApiError(400, {
  errors: [SOURCES_PROBLEM],
  problems: [{ field: 'sources', message: SOURCES_PROBLEM }],
  saved: true,
});

const keyOf = (m: SubscriberMilestone): number => m.milestoneId;

describe('tickableKeys', () => {
  test('keeps only the drafts, in the order the table shows them', () => {
    const rows = [milestone(3, 'draft'), milestone(1, 'published'), milestone(2, 'draft')];

    expect(tickableKeys(rows, keyOf)).toEqual([3, 2]);
  });

  test('is empty when the table has no draft', () => {
    expect(tickableKeys([milestone(1, 'published')], keyOf)).toEqual([]);
    expect(tickableKeys([], keyOf)).toEqual([]);
  });
});

describe('ticksAfterReload', () => {
  test('drops a row no longer shown, and one published since', () => {
    const shown = [milestone(1, 'draft'), milestone(2, 'published')];

    expect([...ticksAfterReload(new Set([1, 2, 3]), shown, keyOf)]).toEqual([1]);
  });
});

describe('allTicked and toggleAll', () => {
  const shown = [milestone(1, 'draft'), milestone(2, 'published'), milestone(3, 'draft')];

  test('counts only the drafts: a published row has no checkbox', () => {
    expect(allTicked(new Set([1, 3]), shown, keyOf)).toBe(true);
    expect(allTicked(new Set([1]), shown, keyOf)).toBe(false);
  });

  test('is off for a list with nothing to tick', () => {
    expect(allTicked(new Set(), [milestone(2, 'published')], keyOf)).toBe(false);
  });

  test('ticks every draft, and none once they all are', () => {
    expect([...toggleAll(new Set([1]), shown, keyOf)]).toEqual([1, 3]);
    expect([...toggleAll(new Set([1, 3]), shown, keyOf)]).toEqual([]);
  });
});

describe('toggleTick', () => {
  test('adds a key that is not ticked and takes away one that is', () => {
    expect([...toggleTick(new Set([1]), 2)]).toEqual([1, 2]);
    expect([...toggleTick(new Set([1, 2]), 1)]).toEqual([2]);
  });
});

describe('tickedRows', () => {
  test('answers the ticked drafts in the order the table shows them', () => {
    const shown = [milestone(3, 'draft'), milestone(1, 'draft'), milestone(2, 'published')];

    expect(tickedRows(new Set([1, 2, 3]), shown, keyOf).map(keyOf)).toEqual([3, 1]);
  });
});

describe('publishInTurn', () => {
  test('publishes every row and reports each step', async () => {
    const calls: number[] = [];
    const progress: number[] = [];

    const outcome = await publishInTurn(
      [milestone(3, 'draft'), milestone(2, 'draft')],
      async ({ milestoneId: id }) => {
        calls.push(id);
      },
      (done) => progress.push(done),
    );

    expect(calls).toEqual([3, 2]);
    expect(progress).toEqual([1, 2]);
    expect(outcome).toEqual({ total: 2, published: 2, alreadyPublished: 0, skipped: [], stopped: null });
  });

  // One at a time: the next request starts only once the previous one has answered.
  test('does not start a request before the previous one answers', async () => {
    const started: number[] = [];
    const answers: (() => void)[] = [];

    const running = publishInTurn([milestone(1, 'draft'), milestone(2, 'draft')], ({ milestoneId: id }) => {
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

    const outcome = await publishInTurn(
      [milestone(1, 'draft'), refused, milestone(3, 'draft')],
      async ({ milestoneId: id }) => {
        if (id === 2) throw REFUSED;
      },
    );

    expect(outcome).toEqual({
      total: 3,
      published: 2,
      alreadyPublished: 0,
      skipped: [{ row: refused, reason: SOURCES_PROBLEM }],
      stopped: null,
    });
  });

  // Published by another request since the table was read: that request may
  // have recorded the publish and failed to write the public JSON, so this
  // run does not say it published the row.
  test('counts a row found published already apart from those it published', async () => {
    const progress: number[] = [];

    const outcome = await publishInTurn(
      [milestone(1, 'draft'), milestone(2, 'draft'), milestone(3, 'draft')],
      async ({ milestoneId: id }) => (id === 2 ? ALREADY_PUBLISHED : undefined),
      (done) => progress.push(done),
    );

    expect(progress).toEqual([1, 2, 3]);
    expect(outcome).toEqual({ total: 3, published: 2, alreadyPublished: 1, skipped: [], stopped: null });
  });

  test.each([
    ['the network', new AdminApiError(0, '/subscribers/milestones/2/publish could not be reached: TypeError')],
    // A field a save refuses is not what the run skips for: the row is not
    // short of sources, and calling it so would send the person to the wrong place.
    ['a 400 that is not a refused publish', new AdminApiError(400, { error: 'footprints event 3 is not a milestone' })],
    ['a 5xx', new AdminApiError(500, null)],
    ['anything that is not an answer from the worker', new TypeError('boom')],
  ])('stops at a failure of %s and tries nothing after it', async (_, error) => {
    const calls: number[] = [];
    const failed = milestone(3, 'draft');
    const progress: number[] = [];

    const outcome = await publishInTurn(
      [milestone(1, 'draft'), milestone(2, 'draft'), failed, milestone(4, 'draft')],
      async ({ milestoneId: id }) => {
        calls.push(id);
        if (id === 2) throw REFUSED;
        if (id === 3) throw error;
      },
      (done) => progress.push(done),
    );

    expect(calls).toEqual([1, 2, 3]);
    expect(progress).toEqual([1, 2]);
    expect(outcome.published).toBe(1);
    expect(outcome.skipped.map((s) => s.row.milestoneId)).toEqual([2]);
    expect(outcome.stopped).toEqual({ row: failed, reason: String(error.message) });
  });

  // The page was left mid-run: nothing more is sent.
  test('sends no row once the run is abandoned', async () => {
    const calls: number[] = [];
    let left = false;

    const outcome = await publishInTurn(
      [milestone(1, 'draft'), milestone(2, 'draft'), milestone(3, 'draft')],
      async ({ milestoneId: id }) => {
        calls.push(id);
        left = true;
      },
      undefined,
      () => left,
    );

    expect(calls).toEqual([1]);
    expect(outcome).toEqual({ total: 3, published: 1, alreadyPublished: 0, skipped: [], stopped: null });
  });

  // The page was left while a row's read was on its way: that row's publish
  // was not sent, so it is untried like the rows after it.
  test('ends the run at a row whose publish noticed the page was left', async () => {
    const calls: number[] = [];

    const outcome = await publishInTurn(
      [milestone(1, 'draft'), milestone(2, 'draft'), milestone(3, 'draft')],
      async ({ milestoneId: id }) => {
        calls.push(id);
        if (id === 2) return ABANDONED;
      },
    );

    expect(calls).toEqual([1, 2]);
    expect(outcome).toEqual({ total: 3, published: 1, alreadyPublished: 0, skipped: [], stopped: null });
    expect(outcomeSummary(outcome).untried).toBe(2);
  });

  // A 404 (the row was deleted since the list was read) is not a refused
  // check: the list the run started from is no longer the database's.
  test('stops at any other 4xx too', async () => {
    const outcome = await publishInTurn([milestone(1, 'draft'), milestone(2, 'draft')], async ({ milestoneId: id }) => {
      if (id === 1) throw new AdminApiError(404, { error: 'no subscriber milestone 1' });
    });

    expect(outcome.published).toBe(0);
    expect(outcome.stopped?.reason).toBe('no subscriber milestone 1');
  });
});

describe('outcomeSummary', () => {
  const row = milestone(1, 'draft');
  const stoppedAt = milestone(2, 'draft');

  test('a run that went through every row', () => {
    const outcome = { total: 3, published: 2, alreadyPublished: 1, skipped: [], stopped: null };

    expect(outcomeSummary(outcome)).toEqual({
      heading: '3 件中 2 件を公開しました',
      published: 2,
      failed: 0,
      alreadyPublished: 1,
      untried: 0,
      failedRows: [],
    });
  });

  // The rows after the one it stopped at were not tried: they are 未処理 (#285).
  test('counts the refused row and the row a run stopped at as failed, and the rows after as untried', () => {
    const outcome = {
      total: 5,
      published: 1,
      alreadyPublished: 0,
      skipped: [{ row, reason: 'x' }],
      stopped: { row: stoppedAt, reason: 'y' },
    };

    expect(outcomeSummary(outcome)).toEqual({
      heading: '5 件中 1 件を公開しました',
      published: 1,
      failed: 2,
      alreadyPublished: 0,
      untried: 2,
      failedRows: [
        { row, reason: 'x' },
        { row: stoppedAt, reason: 'y' },
      ],
    });
  });
});
