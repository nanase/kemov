import {
  field,
  readDate,
  readEach,
  readInstant,
  readNumber,
  readObject,
  readOneOf,
  readOrNull,
  readString,
  ShapeError,
} from '@/lib/read';

/**
 * The layer that replaces `axios.get<T>()`.
 *
 * That call is a type annotation: it promises the compiler a T and asks the
 * response nothing, so a wrong body travels into a component and fails there,
 * naming the component rather than the field. Every test here is a body that
 * has to be refused where it arrives.
 */

describe('readString', () => {
  test('takes a string', () => {
    expect(readString('kemov', 'body.name')).toEqual('kemov');
    expect(readString('', 'body.name')).toEqual('');
  });

  test('refuses anything else, naming the field', () => {
    expect(() => readString(7, 'body.name')).toThrow(ShapeError);
    expect(() => readString(null, 'body.name')).toThrow('body.name should be a string');
    expect(() => readString(undefined, 'body.name')).toThrow('body.name');
  });
});

describe('readNumber', () => {
  test('takes a finite number, including zero and negatives', () => {
    expect(readNumber(0, 'body.n')).toEqual(0);
    expect(readNumber(-12.5, 'body.n')).toEqual(-12.5);
  });

  // JSON cannot carry either, but a division upstream can, and a NaN that
  // reaches a component is displayed rather than caught.
  test('refuses NaN and infinity', () => {
    expect(() => readNumber(Number.NaN, 'body.n')).toThrow(ShapeError);
    expect(() => readNumber(Number.POSITIVE_INFINITY, 'body.n')).toThrow(ShapeError);
  });

  // A count that arrives as text is not a count. The system being replaced
  // sent '1234' and the site called Number() on it, which is how '' became 0.
  test('refuses a number written as a string', () => {
    expect(() => readNumber('1234', 'body.n')).toThrow(ShapeError);
  });
});

describe('readOrNull', () => {
  test('lets null through as null', () => {
    expect(readOrNull(null, 'body.n', readNumber)).toBeNull();
  });

  // An older deployment that has not grown a field yet is saying the same
  // thing as one that sends null for it.
  test('reads a missing field as null too', () => {
    expect(readOrNull(undefined, 'body.n', readNumber)).toBeNull();
  });

  test('still refuses a present value of the wrong type', () => {
    expect(() => readOrNull('many', 'body.n', readNumber)).toThrow(ShapeError);
  });
});

describe('readObject and field', () => {
  test('reads a field of an object', () => {
    expect(field({ name: 'kemov' }, 'name', 'body')).toEqual('kemov');
  });

  test('an absent field is undefined rather than an error', () => {
    expect(field({}, 'name', 'body')).toBeUndefined();
  });

  // An array is not an object here, and neither is null. Both would otherwise
  // read every field as undefined and look like an empty answer.
  test('refuses an array or a null where an object belongs', () => {
    expect(() => readObject([], 'body')).toThrow(ShapeError);
    expect(() => readObject(null, 'body')).toThrow(ShapeError);
  });
});

describe('readEach', () => {
  test('reads every element', () => {
    expect(readEach(['a', 'b'], 'body.names', readString)).toEqual(['a', 'b']);
  });

  test('names the element that was wrong', () => {
    expect(() => readEach(['a', 3], 'body.names', readString)).toThrow('body.names[1]');
  });

  test('refuses something that is not an array', () => {
    expect(() => readEach({ 0: 'a' }, 'body.names', readString)).toThrow(ShapeError);
  });
});

describe('readOneOf', () => {
  const STATES = ['upcoming', 'live'] as const;

  test('takes a value from the set', () => {
    expect(readOneOf('live', 'body.state', STATES)).toEqual('live');
  });

  // The failure mode this exists for: an unrecognised value falls through
  // every branch of a switch and renders as nothing, which is the hardest
  // kind of wrong to notice.
  test('refuses a value outside it, listing what is allowed', () => {
    expect(() => readOneOf('none', 'body.state', STATES)).toThrow('one of upcoming, live');
  });
});

describe('readInstant', () => {
  test('takes the shape every timestamp in this API has', () => {
    expect(readInstant('2026-09-07T12:00:00Z', 'body.fetchedAt')).toEqual('2026-09-07T12:00:00Z');
  });

  // dayjs accepts nearly anything and answers an invalid date for the rest,
  // which is a value that spreads rather than stops. The API cannot send any
  // of these: the schema's timestamp columns each carry a CHECK for the one
  // shape above.
  test('refuses anything the API could not have sent', () => {
    expect(() => readInstant('2026-09-07', 'body.at')).toThrow(ShapeError);
    expect(() => readInstant('2026-09-07T12:00:00.000Z', 'body.at')).toThrow(ShapeError);
    expect(() => readInstant('2026-09-07T12:00:00+09:00', 'body.at')).toThrow(ShapeError);
    expect(() => readInstant('yesterday', 'body.at')).toThrow(ShapeError);
    expect(() => readInstant(1789171200000, 'body.at')).toThrow(ShapeError);
  });

  test('refuses a date the calendar does not have', () => {
    expect(() => readInstant('2026-02-30T00:00:00Z', 'body.at')).toThrow(ShapeError);
  });
});

describe('readDate', () => {
  test('takes a date with no time', () => {
    expect(readDate('2021-04-26', 'body.activityStartDate')).toEqual('2021-04-26');
  });

  test('refuses an instant, and a date that is not one', () => {
    expect(() => readDate('2021-04-26T00:00:00Z', 'body.at')).toThrow(ShapeError);
    expect(() => readDate('2021-04-31', 'body.at')).toThrow(ShapeError);
  });
});

// A body that failed to read is not necessarily safe to quote into a log or an
// error box, so the message says what the value was and not what it held.
describe('the message', () => {
  test('describes the value without repeating it', () => {
    expect(() => readNumber('secret', 'body.n')).toThrow('got a string of 6');
    expect(() => readNumber([1, 2, 3], 'body.n')).toThrow('got an array of 3');
  });
});
