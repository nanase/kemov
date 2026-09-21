import { SHEET_MAX_WIDTH, stacksSheets, tabWrapTarget } from '@/genet/music/useSheetDialog';

describe('stacksSheets', () => {
  test.each([
    [390, true],
    [SHEET_MAX_WIDTH, true],
    [SHEET_MAX_WIDTH + 0.5, false],
    [720, false],
    [1280, false],
  ])('a shell %d px wide stacks the sheets: %s', (width, expected) => {
    expect(stacksSheets(width)).toBe(expected);
  });
});

describe('tabWrapTarget', () => {
  test('Tab from the last element goes to the first', () => {
    expect(tabWrapTarget(4, 3, false)).toBe(0);
  });

  test('Shift+Tab from the first element goes to the last', () => {
    expect(tabWrapTarget(4, 0, true)).toBe(3);
  });

  test('from outside the dialog, Tab enters at the first and Shift+Tab at the last', () => {
    expect(tabWrapTarget(4, -1, false)).toBe(0);
    expect(tabWrapTarget(4, -1, true)).toBe(3);
  });

  test('anywhere in between, the browser moves on by itself', () => {
    expect(tabWrapTarget(4, 1, false)).toBeNull();
    expect(tabWrapTarget(4, 2, true)).toBeNull();
  });

  test('a lone element wraps onto itself both ways', () => {
    expect(tabWrapTarget(1, 0, false)).toBe(0);
    expect(tabWrapTarget(1, 0, true)).toBe(0);
  });

  test('with nothing to move to there is no target', () => {
    expect(tabWrapTarget(0, -1, false)).toBeNull();
    expect(tabWrapTarget(0, -1, true)).toBeNull();
  });
});
