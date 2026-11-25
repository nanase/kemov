import { wrappedFocusIndex } from '@/admin/lib/focus-trap';

describe('wrappedFocusIndex', () => {
  test('Tab on the last control goes back to the first', () => {
    expect(wrappedFocusIndex(1, 2, false)).toBe(0);
  });

  test('Shift+Tab on the first control goes to the last', () => {
    expect(wrappedFocusIndex(0, 2, true)).toBe(1);
  });

  test('Tab between controls is left to the browser', () => {
    expect(wrappedFocusIndex(0, 2, false)).toBeNull();
    expect(wrappedFocusIndex(1, 2, true)).toBeNull();
  });

  // Focus went outside, by a click on the dialog's own text say.
  test('focus on none of them is brought back in', () => {
    expect(wrappedFocusIndex(-1, 2, false)).toBe(0);
    expect(wrappedFocusIndex(-1, 2, true)).toBe(1);
  });

  test('a single control keeps the focus', () => {
    expect(wrappedFocusIndex(0, 1, false)).toBe(0);
    expect(wrappedFocusIndex(0, 1, true)).toBe(0);
  });

  test('a dialog with no controls is left alone', () => {
    expect(wrappedFocusIndex(-1, 0, false)).toBeNull();
  });
});
