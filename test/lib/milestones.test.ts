import {
  axisFraction,
  cardPlacement,
  chartSummary,
  countLabel,
  countScale,
  labelSides,
  milestonesByChannel,
  monthlyEstimates,
  pointName,
} from '@/lib/milestones';
import type { SubscriberMilestone } from '@/type/api';

const milestone = (over: Partial<SubscriberMilestone> = {}): SubscriberMilestone => ({
  milestoneId: 1,
  channelId: 'UCaaa',
  datePrecision: 'day',
  reachedDate: '2024-01-30',
  subscriberCount: 20000,
  announcedBy: 'member',
  event: null,
  sources: [],
  ...over,
});

describe('countLabel', () => {
  test.each([
    [10000, '1万'],
    [15000, '1.5万'],
    [20000, '2万'],
    [1230000, '123万'],
    [5000, '5,000'],
    [12345, '12,345'],
    [0, '0'],
  ])('writes %i as %s', (count, label) => {
    expect(countLabel(count)).toEqual(label);
  });
});

describe('milestonesByChannel', () => {
  test("keeps each member's apart, oldest first, a month-precise date in the middle of its month", () => {
    const all = [
      milestone({ milestoneId: 1, reachedDate: '2024-01-20' }),
      milestone({ milestoneId: 2, reachedDate: '2024-01', datePrecision: 'month' }),
      milestone({ milestoneId: 3, reachedDate: '2021-08-28' }),
      milestone({ milestoneId: 4, channelId: 'UCbbb', reachedDate: '2020-01-01' }),
      milestone({ milestoneId: 5, reachedDate: '2024-01-10' }),
    ];

    const byChannel = milestonesByChannel(all);

    expect(byChannel.get('UCaaa')?.map((m) => m.milestoneId)).toEqual([3, 5, 2, 1]);
    expect(byChannel.get('UCbbb')?.map((m) => m.milestoneId)).toEqual([4]);
    expect(byChannel.get('UCccc')).toBeUndefined();
  });
});

describe('axisFraction', () => {
  const months = ['2021-04', '2021-05', '2021-06', '2021-07'];

  test('puts a day at its share of its month', () => {
    expect(axisFraction('2021-05-01', months)).toBeCloseTo((1 + 0.5 / 31) / 4);
    expect(axisFraction('2021-06-30', months)).toBeCloseTo((2 + 29.5 / 30) / 4);
  });

  test('puts a month-precise date in the middle of its month', () => {
    expect(axisFraction('2021-05', months)).toBeCloseTo(1.5 / 4);
  });

  test('holds a date off either end at that end', () => {
    expect(axisFraction('2020-12-31', months)).toEqual(0);
    expect(axisFraction('2021-08-01', months)).toEqual(1);
  });
});

describe('countScale', () => {
  test('runs from zero to a round figure above the largest count', () => {
    expect(countScale(23000)).toEqual({ top: 30000, ticks: [0, 10000, 20000, 30000] });
    expect(countScale(5000)).toEqual({ top: 6000, ticks: [0, 2000, 4000, 6000] });
  });

  test('leaves room above the largest count for its label', () => {
    expect(countScale(20000).top).toBeGreaterThan(20000);
  });
});

describe('monthlyEstimates', () => {
  const months = ['2024-01', '2024-02', '2024-03', '2024-04', '2024-05'];
  const two = [
    milestone({ milestoneId: 1, reachedDate: '2024-02-01', subscriberCount: 1000 }),
    milestone({ milestoneId: 2, reachedDate: '2024-04-01', subscriberCount: 3000 }),
  ];

  // Nothing is known before the first milestone: no bar, not a bar of zero.
  test('has no month before the first milestone', () => {
    expect(monthlyEstimates(two, months, 4000, '2024-05-20', null)[0]).toBeNull();
  });

  test('takes a milestone month as known and the months between as interpolated', () => {
    const estimates = monthlyEstimates(two, months, 4000, '2024-05-20', null);

    expect(estimates[1]).toEqual({ count: 1000, recorded: true });
    // 2024-03-31 is 59 of the 60 days from 02-01 to 04-01.
    expect(estimates[2]).toEqual({ count: Math.round(1000 + (2000 * 59) / 60), recorded: false });
    expect(estimates[3]).toEqual({ count: 3000, recorded: true });
  });

  test("ends on today's count, reached by a line from the last milestone", () => {
    const estimates = monthlyEstimates(two.slice(0, 1), months, 5000, '2024-05-20', null);

    expect(estimates[4]).toEqual({ count: 5000, recorded: true });
    expect(estimates[2]?.recorded).toBe(false);
    expect(estimates[2]!.count).toBeGreaterThan(1000);
    expect(estimates[2]!.count).toBeLessThan(5000);
  });

  // Without today's count there is nothing to draw a line towards.
  test("draws nothing after the last milestone when today's count was not read", () => {
    const estimates = monthlyEstimates(two, months, null, '2024-05-20', null);

    expect(estimates[3]).toMatchObject({ count: 3000 });
    expect(estimates[4]).toBeNull();
  });

  test('draws nothing after an activity ended', () => {
    const estimates = monthlyEstimates(two, months, 4000, '2024-05-20', '2024-03-15');

    expect(estimates.map((e) => e?.recorded ?? null)).toEqual([null, true, false, null, null]);
  });

  test('is all empty without a milestone', () => {
    expect(monthlyEstimates([], months, 4000, '2024-05-20', null)).toEqual([null, null, null, null, null]);
  });
});

describe('labelSides', () => {
  test('puts a label that would crowd the last one above it below instead', () => {
    expect(labelSides([0.1, 0.12, 0.5, 0.51, 0.52], 0.05)).toEqual(['above', 'below', 'above', 'below', 'below']);
  });
});

describe('cardPlacement', () => {
  test('opens towards the middle of the chart', () => {
    expect(cardPlacement(0.2, 0.2)).toEqual({ left: 'max(0px, calc(20.000% - 18px))', top: 'calc(20.000% + 12px)' });
    expect(cardPlacement(0.9, 0.8)).toEqual({
      right: 'max(0px, calc(10.000% - 18px))',
      bottom: 'calc(20.000% + 12px)',
    });
    expect(cardPlacement(0.9, null)).toMatchObject({ top: 'calc(50% + 12px)' });
  });
});

describe('what is read out', () => {
  test('names a point by its date, count and who announced it', () => {
    expect(
      pointName(milestone({ reachedDate: '2022-11-03', subscriberCount: 15000, announcedBy: 'listener' })),
    ).toEqual('2022-11-03 1.5万人 リスナーの投稿');
  });

  test('sums a chart up by whose, how many and the newest', () => {
    const list = [milestone({ reachedDate: '2021-08-28', subscriberCount: 5000 }), milestone()];

    expect(chartSummary('シマハイイロギツネ', list)).toEqual(
      'シマハイイロギツネの登録者数の節目 2 件。最新は 2024-01-30 の 2万人',
    );
    expect(chartSummary('シマハイイロギツネ', [])).toBeNull();
  });
});
