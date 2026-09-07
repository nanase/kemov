import dayjs from '@nanase/alnilam/dayjs';

import { isFault, MISSING_TEXT, missingMark, toDifference, totalDifference } from '@/lib/difference';
import { DELTA_MISSING, type Delta, type DeltaMissing } from '@/type/api';

/**
 * How a missing change is shown.
 *
 * The API gives four reasons and the page has to keep two of them apart from
 * the other two: "the collection is not working" and "there is nothing to show
 * yet" look identical as a blank cell, and only one of them is anybody's
 * problem.
 */

const change = (value: number): Delta => ({
  value,
  over: { from: dayjs('2026-09-07T11:00:00Z'), to: dayjs('2026-09-07T12:00:00Z'), seconds: 3600 },
});

const missing = (reason: DeltaMissing): Delta => ({ value: null, reason });

describe('isFault', () => {
  test('a channel with no readings, and a gap in the readings, are faults', () => {
    expect(isFault('nothing collected')).toBe(true);
    expect(isFault('gap too wide')).toBe(true);
  });

  // Both fill in on their own. A page that raised an alarm for either would
  // raise one every time a channel was added and every time a streamer hid a
  // count, which is how an alarm stops being read.
  test('a short history and a hidden count are not', () => {
    expect(isFault('history too short')).toBe(false);
    expect(isFault('count not collected')).toBe(false);
  });
});

describe('the marks and the words', () => {
  test('every reason has a sentence', () => {
    for (const reason of DELTA_MISSING) {
      expect(MISSING_TEXT[reason]).toBeTruthy();
    }
  });

  test('a fault is marked differently from a wait', () => {
    expect(missingMark('nothing collected')).toEqual('!');
    expect(missingMark('history too short')).toEqual('—');
  });
});

describe('toDifference', () => {
  test('a change is a number with nothing missing', () => {
    expect(toDifference(change(42))).toEqual({ value: 42, missing: 0 });
  });

  test('a missing change keeps its reason', () => {
    expect(toDifference(missing('gap too wide'))).toEqual({ value: null, reason: 'gap too wide' });
  });
});

describe('totalDifference', () => {
  test('adds the changes it has', () => {
    expect(totalDifference([change(10), change(5)])).toEqual({ value: 15, missing: 0 });
  });

  // Zero would be a lie that looks like a number; withholding the total
  // altogether would hide the channels that are fine because one is not.
  test('adds what it can and counts what it could not', () => {
    expect(totalDifference([change(10), missing('nothing collected'), change(5)])).toEqual({ value: 15, missing: 1 });
  });

  test('has no total when nothing could be read', () => {
    expect(totalDifference([missing('history too short'), missing('history too short')])).toEqual({
      value: null,
      reason: 'history too short',
    });
  });

  // "Not collected yet" while the collection is broken is the wrong answer, so
  // the fault is the one reported.
  test('reports a fault ahead of a wait when both are present', () => {
    expect(totalDifference([missing('history too short'), missing('nothing collected')])).toEqual({
      value: null,
      reason: 'nothing collected',
    });
  });

  // The first load, before anything has been fetched.
  test('an empty set has nothing collected', () => {
    expect(totalDifference([])).toEqual({ value: null, reason: 'nothing collected' });
  });
});
