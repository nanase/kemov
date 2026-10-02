import {
  clampSplit,
  readSplit,
  SPLIT_DEFAULT,
  SPLIT_MAX,
  SPLIT_MIN,
  splitFromPointer,
  splitStorageKey,
  stepSplit,
} from '@/admin/lib/split';

describe('clampSplit', () => {
  test('keeps a value inside the range', () => {
    expect(clampSplit(45)).toBe(45);
  });

  test.each([
    [5, SPLIT_MIN],
    [95, SPLIT_MAX],
  ])('%s is held at %s', (pct, held) => {
    expect(clampSplit(pct)).toBe(held);
  });

  test('rounds to one decimal place', () => {
    expect(clampSplit(33.333)).toBe(33.3);
  });
});

describe('splitFromPointer', () => {
  test('the pointer position as a share of the height', () => {
    expect(splitFromPointer(300, 100, 500)).toBe(40);
  });

  test('a pointer above the area is held at the minimum', () => {
    expect(splitFromPointer(50, 100, 500)).toBe(SPLIT_MIN);
  });

  test('an area with no height leaves the default', () => {
    expect(splitFromPointer(300, 100, 0)).toBe(SPLIT_DEFAULT);
  });
});

describe('stepSplit', () => {
  test('up makes the list shorter, down makes it taller', () => {
    expect(stepSplit(40, -1)).toBe(36);
    expect(stepSplit(40, 1)).toBe(44);
  });

  test('a step past the end stops at the end', () => {
    expect(stepSplit(SPLIT_MAX - 1, 1)).toBe(SPLIT_MAX);
  });
});

describe('readSplit', () => {
  test('a stored number', () => {
    expect(readSplit('52.5')).toBe(52.5);
  });

  test('a stored number out of range comes back clamped', () => {
    expect(readSplit('99')).toBe(SPLIT_MAX);
  });

  test.each([null, '', 'abc', 'NaN', 'Infinity'])('%s is nothing stored', (raw) => {
    expect(readSplit(raw)).toBeNull();
  });
});

describe('splitStorageKey', () => {
  test('one key per page', () => {
    expect(splitStorageKey('/footprints')).not.toBe(splitStorageKey('/videos'));
  });
});
