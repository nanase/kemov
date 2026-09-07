import { changeOver, DAY_SECONDS, HOUR_SECONDS, toleranceSeconds } from '../src/lib/delta';

const at = (fetchedAt: string, value: number | null) => ({ fetchedAt, value });

describe('toleranceSeconds', () => {
  // A tenth of the period, or fifteen minutes, whichever is larger.
  test('is fifteen minutes for an hour', () => {
    expect(toleranceSeconds(HOUR_SECONDS)).toEqual(15 * 60);
  });

  test('is a tenth of a day for a day', () => {
    expect(toleranceSeconds(DAY_SECONDS)).toEqual(2.4 * 60 * 60);
  });

  // Collection runs every ten minutes, so the nearest sample to any instant is
  // at most five minutes away. Without the floor, an hour's change would need
  // a sample within six minutes and would usually be refused.
  test('the floor is wide enough for a run that was missed', () => {
    expect(toleranceSeconds(HOUR_SECONDS)).toBeGreaterThan(10 * 60);
  });
});

describe('changeOver', () => {
  test('subtracts the earlier reading from the later one', () => {
    const delta = changeOver(at('2026-09-07T12:00:00Z', 1100), at('2026-09-07T11:00:00Z', 1000), HOUR_SECONDS);

    expect(delta.value).toEqual(100);
  });

  test('says which two instants it measured between', () => {
    const delta = changeOver(at('2026-09-07T12:00:00Z', 1100), at('2026-09-07T11:00:00Z', 1000), HOUR_SECONDS);

    expect(delta).toMatchObject({
      over: { from: '2026-09-07T11:00:00Z', to: '2026-09-07T12:00:00Z', seconds: 3600 },
    });
  });

  test('reports a fall as a negative number', () => {
    expect(changeOver(at('2026-09-07T12:00:00Z', 900), at('2026-09-07T11:00:00Z', 1000), HOUR_SECONDS).value).toEqual(
      -100,
    );
  });

  test('accepts a sample a few minutes off the period', () => {
    const delta = changeOver(at('2026-09-07T12:00:00Z', 1100), at('2026-09-07T10:52:00Z', 1000), HOUR_SECONDS);

    expect(delta.value).toEqual(100);
  });

  // The defect this rewrite removes. The old rule took the sample nearest to
  // a day ago however far away it was, so two hours of history reported the
  // change over two hours as the change over a day.
  test('refuses two hours standing in for a day', () => {
    const delta = changeOver(at('2026-09-07T12:00:00Z', 1100), at('2026-09-07T10:00:00Z', 1000), DAY_SECONDS);

    expect(delta).toEqual({ value: null, reason: 'gap too wide' });
  });

  // Both directions. A sample thirty hours back is no more "a day ago" than
  // one two hours back is.
  test('refuses thirty hours standing in for a day', () => {
    const delta = changeOver(at('2026-09-07T12:00:00Z', 1100), at('2026-09-06T06:00:00Z', 1000), DAY_SECONDS);

    expect(delta).toEqual({ value: null, reason: 'gap too wide' });
  });

  test('accepts a day measured across a couple of missed runs', () => {
    const delta = changeOver(at('2026-09-07T12:00:00Z', 1100), at('2026-09-06T11:30:00Z', 1000), DAY_SECONDS);

    expect(delta.value).toEqual(100);
  });

  // What the site shows for its first day. Saying why is the point: a caller
  // shown only null cannot tell "this channel has not moved" from "nobody has
  // measured it for long enough to say".
  test('says the history is too short when it does not reach back far enough', () => {
    expect(changeOver(at('2026-09-07T12:00:00Z', 1100), undefined, DAY_SECONDS)).toEqual({
      value: null,
      reason: 'history too short',
    });
  });

  // A different answer from the one above, because only this one means
  // something is wrong rather than that the site is new.
  test('says nothing was collected when there is no reading at all', () => {
    expect(changeOver(undefined, undefined, HOUR_SECONDS)).toEqual({ value: null, reason: 'nothing collected' });
  });

  // A hidden subscriber count is null in the column, and the schema says so
  // explicitly because YouTube reports 0 for it. Treating that as a reading
  // would report the channel's whole following as having appeared or vanished
  // in an hour.
  test('does not treat a hidden count as a reading', () => {
    expect(changeOver(at('2026-09-07T12:00:00Z', null), at('2026-09-07T11:00:00Z', 1000), HOUR_SECONDS)).toEqual({
      value: null,
      reason: 'count not collected',
    });

    expect(changeOver(at('2026-09-07T12:00:00Z', 1100), at('2026-09-07T11:00:00Z', null), HOUR_SECONDS)).toEqual({
      value: null,
      reason: 'count not collected',
    });
  });

  test('reports no change as zero rather than as an absence', () => {
    const delta = changeOver(at('2026-09-07T12:00:00Z', 1000), at('2026-09-07T11:00:00Z', 1000), HOUR_SECONDS);

    expect(delta.value).toEqual(0);
  });
});
